import Foundation
import AVFoundation
import KairoIOSHostCore
import PhotosUI
import QuickLook
import UIKit
import UniformTypeIdentifiers
import WebKit

@MainActor
private final class IntakePreviewItem: NSObject, QLPreviewItem {
    let previewItemURL: URL?
    init(_ url: URL?) { previewItemURL = url }
}

/// Owns system file UI and temporary bytes. The renderer receives no paths,
/// security-scoped bookmarks, generic native invocation or persistent grants.
@MainActor
final class WKIntakeOwner: NSObject, WKScriptMessageHandlerWithReply, UIDocumentPickerDelegate, PHPickerViewControllerDelegate,
                           UIImagePickerControllerDelegate, UINavigationControllerDelegate,
                           UIAdaptivePresentationControllerDelegate, QLPreviewControllerDataSource, QLPreviewControllerDelegate {
    private weak var webView: WKWebView?
    private weak var presenter: UIViewController?
    private let documentID: () -> UUID
    private let documentCurrent: () -> Bool
    private let consumeGesture: () -> Bool
    private let sharedFileIntake: NativeSharedFileIntake?
    private let session = NativeFileIntakeSession()
    private var picker: UIDocumentPickerViewController?
    private var pickerReply: CheckedContinuation<URL?, Error>?
    private enum SourceChoice { case files, photos, camera, sharedFiles }
    private var sourcePicker: UIAlertController?
    private var sourceReply: CheckedContinuation<SourceChoice?, Error>?
    private var sharedPicker: UIAlertController?
    private var sharedReply: CheckedContinuation<NativeSharedFileChoice?, Error>?
    private var photoPicker: PHPickerViewController?
    private var photoPickerReply: CheckedContinuation<NSItemProvider?, Error>?
    private var photoLoad: NativePhotoIntakeLoad?
    private var photoLoadID: UUID?
    private var cameraPicker: UIImagePickerController?
    private var cameraReply: CheckedContinuation<NativeCameraImage?, Error>?
    private var cameraPermissionID: UUID?
    private var cameraPermissionReply: CheckedContinuation<Bool, Never>?
    private var cancelJob: (() -> Void)?
    private var expiry: Task<Void, Never>?
    private var preview: QLPreviewController?
    private var previewURL: URL?
    private var previewReply: CheckedContinuation<Bool, Never>?

    init(webView: WKWebView, presenter: UIViewController, documentID: @escaping () -> UUID,
         documentCurrent: @escaping () -> Bool, consumeGesture: @escaping () -> Bool,
         sharedFileIntake: NativeSharedFileIntake? = nil) {
        self.webView = webView; self.presenter = presenter; self.documentID = documentID
        self.documentCurrent = documentCurrent; self.consumeGesture = consumeGesture
        self.sharedFileIntake = sharedFileIntake
    }

    var isBusy: Bool { session.isBusy || picker != nil || sourcePicker != nil || sharedPicker != nil || photoPicker != nil || cameraPicker != nil || preview != nil }

    func invalidate() {
        session.invalidate()
        expiry?.cancel(); expiry = nil
        cancelJob?()
        photoLoad?.cancel()
        cameraPermissionID = nil
        let permission = cameraPermissionReply; cameraPermissionReply = nil
        permission?.resume(returning: false)
        if let cameraPicker {
            cameraPicker.dismiss(animated: false)
            finishCameraPicker(cameraPicker, result: .failure(NativeTextExtractionError("source-owner-changed")))
        }
        if let sourcePicker {
            sourcePicker.dismiss(animated: false)
            finishSourcePicker(sourcePicker, result: .failure(NativeTextExtractionError("source-owner-changed")))
        }
        if let sharedPicker {
            sharedPicker.dismiss(animated: false)
            finishSharedPicker(sharedPicker, result: .failure(NativeTextExtractionError("source-owner-changed")))
        }
        if let photoPicker {
            photoPicker.dismiss(animated: false)
            finishPhotoPicker(photoPicker, result: .failure(NativeTextExtractionError("source-owner-changed")))
        }
        if let picker {
            picker.dismiss(animated: false)
            finishPicker(picker, result: .failure(NativeTextExtractionError("source-owner-changed")))
        }
        if let preview { preview.dismiss(animated: false) }
        finishPreview()
    }

    private func owned(_ message: WKScriptMessage) -> Bool {
        message.name == "kairoIntake" && message.webView === webView && message.frameInfo.isMainFrame &&
            HostPolicy.isAppURL(message.frameInfo.request.url) && HostPolicy.isAppURL(webView?.url) &&
            documentCurrent() && UIApplication.shared.applicationState == .active
    }

    private func current(_ lease: NativeFileIntakeLease) throws {
        guard documentCurrent(), UIApplication.shared.applicationState == .active else {
            throw NativeTextExtractionError("source-owner-changed")
        }
        try session.assertCurrent(lease, document: documentID())
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard owned(message) else { replyHandler(["status": "failed", "code": "source-owner-changed"], nil); return }
        do {
            let request = try NativeFileIntakeRequest.parse(message.body)
            if case .available = request { replyHandler(true, nil); return }
            guard presenter?.presentedViewController == nil, consumeGesture() else {
                replyHandler(["status": "failed", "code": "file-intake-unavailable"], nil); return
            }
            let lease = try session.begin(document: documentID())
            Task {
                defer { session.finish(lease) }
                do {
                    let result = try await perform(request, lease: lease)
                    try current(lease)
                    replyHandler(result, nil)
                } catch {
                    let code = (error as? NativeTextExtractionError)?.code ?? "file-intake-failed"
                    replyHandler(["status": "failed", "code": code], nil)
                }
            }
        } catch {
            replyHandler(["status": "failed", "code": (error as? NativeTextExtractionError)?.code ?? "invalid-input"], nil)
        }
    }

    private func perform(_ request: NativeFileIntakeRequest, lease: NativeFileIntakeLease) async throws -> Any {
        try current(lease)
        switch request {
        case .available: return true
        case .choose(let expected):
            expiry?.cancel(); expiry = nil; session.clearSelection()
            guard let file = try await chooseFile(lease: lease, imageOnly: expected?.kind == "image", pdfOnly: expected?.kind == "pdf", allowCamera: expected == nil) else { return ["status": "cancelled"] }
            try current(lease)
            let token = try session.select(file, expected: expected, lease: lease, document: documentID())
            expiry = Task { [weak self] in
                do { try await Task.sleep(for: .seconds(600)) } catch { return }
                guard !Task.isCancelled else { return }
                self?.session.clearSelection(ifToken: token)
            }
            return ["status": "selected", "token": token, "file": try wire(file.file)]
        case .extract(let token, let first, let last):
            let file = try session.selected(token: token, firstPage: first, lastPage: last, lease: lease, document: documentID())
            let document = try await background { try file.extract(firstPage: first, lastPage: last) }
            try current(lease)
            // Recheck TTL/selection after the synchronous Vision/PDFKit work.
            _ = try session.selected(token: token, firstPage: first, lastPage: last, lease: lease, document: documentID())
            return ["status": "extracted", "document": try wire(document)]
        case .openOriginal(let expected):
            guard let file = try await chooseFile(lease: lease, imageOnly: expected.kind == "image", pdfOnly: expected.kind == "pdf", allowCamera: false) else { return ["status": "cancelled"] }
            try current(lease)
            guard file.matches(expected) else { throw NativeTextExtractionError("file-mismatch") }
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("KairoIntakePreview", isDirectory: true)
            let copy = try file.writePreview(in: directory)
            do {
                try current(lease)
                guard await presentPreview(copy, lease: lease) else { throw NativeTextExtractionError("file-viewer-unavailable") }
                return ["status": "opened"]
            } catch {
                try? FileManager.default.removeItem(at: copy.deletingLastPathComponent())
                throw error
            }
        }
    }

    private func wire<T: Encodable>(_ value: T) throws -> Any {
        let bytes = try JSONEncoder().encode(value)
        guard bytes.count <= 2 * 1024 * 1024 else { throw NativeTextExtractionError("extraction-response") }
        return try JSONSerialization.jsonObject(with: bytes)
    }

    private func background<T: Sendable>(_ work: @escaping @Sendable () throws -> T) async throws -> T {
        let job = Task.detached(priority: .userInitiated) {
            try Task.checkCancellation()
            let value = try work()
            try Task.checkCancellation()
            return value
        }
        cancelJob = { job.cancel() }
        defer { cancelJob = nil }
        // Cancellation fences the reply. A synchronous Vision call can finish
        // before observing cancellation; the session remains busy until then.
        return try await job.value
    }

    private func chooseFile(lease: NativeFileIntakeLease, imageOnly: Bool, pdfOnly: Bool, allowCamera: Bool) async throws -> NativeIntakeFile? {
        let source: SourceChoice?
        if pdfOnly && sharedFileIntake == nil { source = .files }
        else { source = try await chooseSource(allowCamera: allowCamera, pdfOnly: pdfOnly) }
        try current(lease)
        guard let source else { return nil }
        switch source {
        case .files:
            guard let url = try await chooseURL(imageOnly: imageOnly, pdfOnly: pdfOnly) else { return nil }
            try current(lease)
            return try await background { try NativeIntakeFile.readChosenURL(url) }
        case .photos:
            guard let provider = try await choosePhoto() else { return nil }
            try current(lease)
            return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<NativeIntakeFile, Error>) in
                let id = UUID()
                let load = NativePhotoIntakeLoad { [weak self] result in
                    Task { @MainActor in
                        if self?.photoLoadID == id { self?.photoLoad = nil; self?.photoLoadID = nil }
                        continuation.resume(with: result.mapError { $0 as Error })
                    }
                }
                photoLoad = load; photoLoadID = id
                load.start(provider: provider)
            }
        case .camera:
            guard allowCamera else { throw NativeTextExtractionError("file-mismatch") }
            guard let capture = try await takePhoto(lease: lease) else { return nil }
            try current(lease)
            let name = "camera-\(UUID().uuidString.lowercased()).jpg"
            let file = try await background { try capture.encode(name: name) }
            try current(lease)
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("KairoCameraExport", isDirectory: true)
            let temporary = try file.writePreview(in: directory)
            defer { try? FileManager.default.removeItem(at: temporary.deletingLastPathComponent()) }
            let export = temporary.deletingLastPathComponent().appendingPathComponent(name)
            try FileManager.default.moveItem(at: temporary, to: export)
            guard let destination = try await saveCameraOriginal(export) else { return nil }
            try current(lease)
            let saved = try await background { try NativeIntakeFile.readChosenURL(destination) }
            try current(lease)
            guard file.matches(saved.file) else { throw NativeTextExtractionError("file-mismatch") }
            return file
        case .sharedFiles:
            guard let intake = sharedFileIntake else { throw NativeTextExtractionError("file-intake-unavailable") }
            // Keep this exact consumer for both list and read: its choices carry
            // private adapter/publication identities, never renderer identifiers.
            let choices = try await background { try intake.choices() }
            try current(lease)
            guard choices.count <= 20 else { throw NativeTextExtractionError("file-selection") }
            let images: Set<String> = ["public.png", "public.jpeg", "public.heic", "public.heif", "public.tiff"]
            let visible = choices.filter { choice in
                if pdfOnly { return choice.offeredType == "com.adobe.pdf" }
                if imageOnly { return images.contains(choice.offeredType) }
                return true
            }
            let choice = try await chooseSharedFile(visible, lease: lease)
            try current(lease)
            guard let choice else { return nil }
            let file = try await background { try intake.readSelected(choice) }
            try current(lease)
            guard (!imageOnly || file.file.kind == "image"), (!pdfOnly || file.file.kind == "pdf") else {
                throw NativeTextExtractionError("file-mismatch")
            }
            // The caller still checks the expected original before selection or
            // preview. No held payload is consumed by this immutable snapshot.
            return file
        }
    }

    private var cameraAvailable: Bool {
        UIImagePickerController.isSourceTypeAvailable(.camera) &&
            (UIImagePickerController.availableMediaTypes(for: .camera)?.contains(UTType.image.identifier) == true)
    }

    private func chooseSource(allowCamera: Bool, pdfOnly: Bool) async throws -> SourceChoice? {
        guard let presenter, presenter.presentedViewController == nil, sourcePicker == nil else {
            throw NativeTextExtractionError("file-intake-busy")
        }
        return try await withCheckedThrowingContinuation { continuation in
            let cameraStatus = AVCaptureDevice.authorizationStatus(for: .video)
            let cameraDenied = cameraStatus == .denied || cameraStatus == .restricted
            let message: String?
            if allowCamera && cameraAvailable {
                message = cameraDenied ?
                    "カメラへのアクセスが許可されていない。ファイルや写真を選ぶか、設定を確認する。\nCamera access is unavailable. Choose Files or Photos, or check Settings." :
                    "撮影後は写真をファイルに保存する。\nAfter taking a photo, save it to Files."
            } else { message = nil }
            let controller = UIAlertController(title: pdfOnly ? "PDF" : "画像・PDF · Image or PDF", message: message, preferredStyle: .actionSheet)
            sourcePicker = controller; sourceReply = continuation
            var choices = [("ファイル · Files", SourceChoice.files)]
            if !pdfOnly { choices.append(("写真 · Photos", .photos)) }
            if sharedFileIntake != nil { choices.append(("共有ファイル · Shared Files", .sharedFiles)) }
            if allowCamera && cameraAvailable { choices.append(("カメラ · Camera", .camera)) }
            for (title, choice) in choices {
                let action = UIAlertAction(title: title, style: .default) { [weak self, weak controller] _ in
                    guard let controller else { return }
                    controller.dismiss(animated: true) { self?.finishSourcePicker(controller, result: .success(choice)) }
                }
                if choice == .camera && cameraDenied { action.isEnabled = false }
                controller.addAction(action)
            }
            controller.addAction(UIAlertAction(title: "キャンセル · Cancel", style: .cancel) { [weak self, weak controller] _ in
                guard let controller else { return }
                controller.dismiss(animated: true) { self?.finishSourcePicker(controller, result: .success(nil)) }
            })
            if let popover = controller.popoverPresentationController {
                popover.sourceView = presenter.view
                popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.maxY, width: 1, height: 1)
            }
            presenter.present(controller, animated: true)
            controller.presentationController?.delegate = self
        }
    }

    private func finishSourcePicker(_ controller: UIAlertController, result: Result<SourceChoice?, Error>) {
        guard sourcePicker === controller else { return }
        sourcePicker = nil
        let continuation = sourceReply; sourceReply = nil
        continuation?.resume(with: result)
    }

    private func chooseSharedFile(_ choices: [NativeSharedFileChoice], lease: NativeFileIntakeLease) async throws -> NativeSharedFileChoice? {
        try current(lease)
        guard choices.count <= 20, let presenter, presenter.presentedViewController == nil, sharedPicker == nil else {
            throw NativeTextExtractionError("file-intake-busy")
        }
        return try await withCheckedThrowingContinuation { continuation in
            let message = choices.isEmpty ?
                "選べる共有ファイルはない。\nNo shared files are available for this selection." :
                "選んでから、内容を確認して取り込む。\nChoose a file, then review its text before capture."
            let controller = UIAlertController(title: "共有ファイル · Shared Files", message: message, preferredStyle: .actionSheet)
            sharedPicker = controller; sharedReply = continuation
            for (index, choice) in choices.enumerated() {
                let title = sharedChoiceTitle(choice, index: index)
                controller.addAction(UIAlertAction(title: title, style: .default) { [weak self, weak controller] _ in
                    guard let self, let controller, self.sharedPicker === controller else { return }
                    controller.dismiss(animated: true) { [weak self] in
                        self?.finishSharedPicker(controller, result: .success(choice))
                    }
                })
            }
            controller.addAction(UIAlertAction(title: "キャンセル · Cancel", style: .cancel) { [weak self, weak controller] _ in
                guard let self, let controller, self.sharedPicker === controller else { return }
                controller.dismiss(animated: true) { [weak self] in
                    self?.finishSharedPicker(controller, result: .success(nil))
                }
            })
            if let popover = controller.popoverPresentationController {
                popover.sourceView = presenter.view
                popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.maxY, width: 1, height: 1)
            }
            presenter.present(controller, animated: true)
            controller.presentationController?.delegate = self
        }
    }

    private func sharedChoiceTitle(_ choice: NativeSharedFileChoice, index: Int) -> String {
        let name = String(choice.name.prefix(80)).split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
        let displayName = name.isEmpty ? "ファイル · File" : name + (choice.name.count > 80 ? "…" : "")
        let offeredLabels = ["public.png": "PNG", "public.jpeg": "JPEG", "public.heic": "HEIC",
                             "public.heif": "HEIF", "public.tiff": "TIFF", "com.adobe.pdf": "PDF"]
        let offered = offeredLabels[choice.offeredType] ?? "File"
        // Display metadata is bounded and is not content admission. The selected
        // publication's actual MIME, SHA256 and size are rechecked by readSelected.
        return "\(index + 1). \(displayName)\n\(offered) · \((choice.bytes + 1023) / 1024) KiB"
    }

    private func finishSharedPicker(_ controller: UIAlertController, result: Result<NativeSharedFileChoice?, Error>) {
        guard sharedPicker === controller else { return }
        sharedPicker = nil
        let continuation = sharedReply; sharedReply = nil
        continuation?.resume(with: result)
    }

    private func takePhoto(lease: NativeFileIntakeLease) async throws -> NativeCameraImage? {
        try current(lease)
        guard cameraAvailable else { throw NativeTextExtractionError("file-intake-unavailable") }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: break
        case .notDetermined:
            let id = UUID()
            let allowed = await withCheckedContinuation { continuation in
                cameraPermissionID = id; cameraPermissionReply = continuation
                AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                    Task { @MainActor in
                        guard self?.cameraPermissionID == id else { return }
                        self?.cameraPermissionID = nil
                        let reply = self?.cameraPermissionReply; self?.cameraPermissionReply = nil
                        reply?.resume(returning: granted)
                    }
                }
            }
            try current(lease)
            guard allowed else { throw NativeTextExtractionError("file-intake-unavailable") }
        default: throw NativeTextExtractionError("file-intake-unavailable")
        }
        try current(lease)
        guard cameraAvailable, AVCaptureDevice.authorizationStatus(for: .video) == .authorized,
              let presenter, presenter.presentedViewController == nil, cameraPicker == nil else {
            throw NativeTextExtractionError("file-intake-unavailable")
        }
        return try await withCheckedThrowingContinuation { continuation in
            let controller = UIImagePickerController()
            controller.sourceType = .camera
            controller.mediaTypes = [UTType.image.identifier]
            controller.cameraCaptureMode = .photo
            controller.allowsEditing = false
            controller.delegate = self
            controller.modalPresentationStyle = .fullScreen
            cameraPicker = controller; cameraReply = continuation
            presenter.present(controller, animated: true)
            controller.presentationController?.delegate = self
        }
    }

    private func finishCameraPicker(_ controller: UIImagePickerController, result: Result<NativeCameraImage?, Error>) {
        guard cameraPicker === controller else { return }
        cameraPicker = nil
        let continuation = cameraReply; cameraReply = nil
        continuation?.resume(with: result)
    }

    func imagePickerControllerDidCancel(_ controller: UIImagePickerController) {
        guard cameraPicker === controller else { return }
        controller.dismiss(animated: true) { [weak self] in self?.finishCameraPicker(controller, result: .success(nil)) }
    }

    func imagePickerController(_ controller: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        guard cameraPicker === controller else { return }
        let result: Result<NativeCameraImage?, Error>
        do {
            guard info[.mediaType] as? String == UTType.image.identifier,
                  let image = info[.originalImage] as? UIImage, let bitmap = image.cgImage else {
                throw NativeTextExtractionError("unsupported-image")
            }
            let orientation: UInt32
            switch image.imageOrientation {
            case .up: orientation = 1
            case .upMirrored: orientation = 2
            case .down: orientation = 3
            case .downMirrored: orientation = 4
            case .leftMirrored: orientation = 5
            case .right: orientation = 6
            case .rightMirrored: orientation = 7
            case .left: orientation = 8
            @unknown default: throw NativeTextExtractionError("image-orientation")
            }
            result = .success(try NativeCameraImage(image: bitmap, orientation: orientation))
        } catch { result = .failure(error) }
        controller.dismiss(animated: true) { [weak self] in self?.finishCameraPicker(controller, result: result) }
    }

    private func saveCameraOriginal(_ url: URL) async throws -> URL? {
        guard let presenter, presenter.presentedViewController == nil, picker == nil else {
            throw NativeTextExtractionError("file-intake-busy")
        }
        return try await withCheckedThrowingContinuation { continuation in
            let controller = UIDocumentPickerViewController(forExporting: [url], asCopy: true)
            controller.delegate = self
            controller.modalPresentationStyle = .formSheet
            picker = controller; pickerReply = continuation
            presenter.present(controller, animated: true)
            controller.presentationController?.delegate = self
        }
    }

    private func choosePhoto() async throws -> NSItemProvider? {
        guard let presenter, presenter.presentedViewController == nil, photoPicker == nil else {
            throw NativeTextExtractionError("file-intake-busy")
        }
        return try await withCheckedThrowingContinuation { continuation in
            // The system picker grants only the chosen representation. No
            // PHPhotoLibrary authorization or persistent asset identifier is used.
            var configuration = PHPickerConfiguration()
            configuration.filter = .images
            configuration.selectionLimit = 1
            configuration.preferredAssetRepresentationMode = .current
            let controller = PHPickerViewController(configuration: configuration)
            controller.delegate = self
            controller.modalPresentationStyle = .formSheet
            photoPicker = controller; photoPickerReply = continuation
            presenter.present(controller, animated: true)
            controller.presentationController?.delegate = self
        }
    }

    private func finishPhotoPicker(_ controller: PHPickerViewController, result: Result<NSItemProvider?, Error>) {
        guard photoPicker === controller else { return }
        photoPicker = nil
        let continuation = photoPickerReply; photoPickerReply = nil
        continuation?.resume(with: result)
    }

    func picker(_ controller: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        guard photoPicker === controller else { return }
        let result: Result<NSItemProvider?, Error> = results.count <= 1 ? .success(results.first?.itemProvider) : .failure(NativeTextExtractionError("file-selection"))
        controller.dismiss(animated: true) { [weak self] in self?.finishPhotoPicker(controller, result: result) }
    }

    private func chooseURL(imageOnly: Bool, pdfOnly: Bool) async throws -> URL? {
        guard let presenter, presenter.presentedViewController == nil, picker == nil else {
            throw NativeTextExtractionError("file-intake-busy")
        }
        return try await withCheckedThrowingContinuation { continuation in
            let images: [UTType] = [.png, .jpeg, .heic, .heif, .tiff]
            let controller = UIDocumentPickerViewController(forOpeningContentTypes: pdfOnly ? [.pdf] : imageOnly ? images : [.pdf] + images, asCopy: false)
            controller.delegate = self
            controller.allowsMultipleSelection = false
            controller.shouldShowFileExtensions = true
            controller.modalPresentationStyle = .formSheet
            picker = controller; pickerReply = continuation
            presenter.present(controller, animated: true)
            controller.presentationController?.delegate = self
        }
    }

    private func finishPicker(_ controller: UIDocumentPickerViewController, result: Result<URL?, Error>) {
        guard picker === controller else { return }
        picker = nil
        let continuation = pickerReply; pickerReply = nil
        continuation?.resume(with: result)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard picker === controller else { return }
        let result: Result<URL?, Error> = urls.count == 1 ? .success(urls[0]) : .failure(NativeTextExtractionError("file-selection"))
        controller.dismiss(animated: true) { [weak self] in self?.finishPicker(controller, result: result) }
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        guard picker === controller else { return }
        controller.dismiss(animated: true) { [weak self] in self?.finishPicker(controller, result: .success(nil)) }
    }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        if let cameraPicker, presentationController.presentedViewController === cameraPicker { finishCameraPicker(cameraPicker, result: .success(nil)) }
        if let sourcePicker, presentationController.presentedViewController === sourcePicker { finishSourcePicker(sourcePicker, result: .success(nil)) }
        if let sharedPicker, presentationController.presentedViewController === sharedPicker { finishSharedPicker(sharedPicker, result: .success(nil)) }
        if let photoPicker, presentationController.presentedViewController === photoPicker { finishPhotoPicker(photoPicker, result: .success(nil)) }
        if let picker, presentationController.presentedViewController === picker { finishPicker(picker, result: .success(nil)) }
        if let preview, presentationController.presentedViewController === preview { finishPreview() }
    }

    private func presentPreview(_ url: URL, lease: NativeFileIntakeLease) async -> Bool {
        guard let presenter, presenter.presentedViewController == nil, preview == nil,
              QLPreviewController.canPreview(url as NSURL) else { return false }
        return await withCheckedContinuation { continuation in
            let controller = QLPreviewController()
            preview = controller; previewURL = url; previewReply = continuation
            controller.dataSource = self; controller.delegate = self
            controller.modalPresentationStyle = .formSheet
            presenter.present(controller, animated: true) { [weak self] in
                guard let self, self.preview === controller else { return }
                let current = (try? self.current(lease)) != nil
                let continuation = self.previewReply; self.previewReply = nil
                continuation?.resume(returning: current)
                if !current { controller.dismiss(animated: false); self.finishPreview() }
            }
            controller.presentationController?.delegate = self
        }
    }

    private func finishPreview() {
        let controller = preview; preview = nil
        controller?.dataSource = nil; controller?.delegate = nil
        let continuation = previewReply; previewReply = nil
        continuation?.resume(returning: false)
        if let url = previewURL { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        previewURL = nil
    }

    func numberOfPreviewItems(in controller: QLPreviewController) -> Int { preview === controller && previewURL != nil ? 1 : 0 }
    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
        IntakePreviewItem(preview === controller && index == 0 ? previewURL : nil)
    }
    func previewControllerDidDismiss(_ controller: QLPreviewController) { if preview === controller { finishPreview() } }
    func previewController(_ controller: QLPreviewController, shouldOpen url: URL, for item: QLPreviewItem) -> Bool { false }
    func previewController(_ controller: QLPreviewController, editingModeFor item: QLPreviewItem) -> QLPreviewItemEditingMode { .disabled }
}
