import Foundation
import CoreGraphics
import ImageIO
import Darwin
import KairoIOSHostCore
import KairoNativeShareCore

private struct IntakeCheckFailure: Error { let name: String }

private final class PhotoCompletionCount: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0
    func take() -> Int { lock.lock(); defer { lock.unlock() }; count += 1; return count }
    var value: Int { lock.lock(); defer { lock.unlock() }; return count }
}

@MainActor
enum NativeIntakeChecks {
    private static func check(_ condition: Bool, _ name: String) throws {
        if !condition { throw IntakeCheckFailure(name: name) }
    }
    private static func refused(_ work: () throws -> Void, code: String? = nil) throws {
        do { try work() } catch let error as NativeTextExtractionError {
            if let code { try check(error.code == code, "wrong-refusal-code") }
            return
        }
        throw IntakeCheckFailure(name: "unexpected-acceptance")
    }
    private static func object<T: Encodable>(_ value: T) throws -> [String: Any] {
        try JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) as! [String: Any]
    }
    private static func fixture() throws -> Data {
        let bytes = NSMutableData()
        guard let sink = CGDataConsumer(data: bytes as CFMutableData) else { throw IntakeCheckFailure(name: "fixture-consumer") }
        var box = CGRect(x: 0, y: 0, width: 100, height: 80)
        guard let context = CGContext(consumer: sink, mediaBox: &box, nil) else { throw IntakeCheckFailure(name: "fixture-context") }
        for _ in 1...2 {
            context.beginPDFPage(nil); context.setFillColor(CGColor(gray: 1, alpha: 1)); context.fill(box); context.endPDFPage()
        }
        context.closePDF()
        return bytes as Data
    }

    private static func photoFixture(width: Int = 8, height: Int = 8) throws -> Data {
        guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
              let image = context.makeImage() else { throw IntakeCheckFailure(name: "photo-fixture") }
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data as CFMutableData, "public.png" as CFString, 1, nil) else {
            throw IntakeCheckFailure(name: "photo-fixture")
        }
        CGImageDestinationAddImage(destination, image, nil)
        try check(CGImageDestinationFinalize(destination), "photo-fixture")
        return data as Data
    }

    private static func photoProvider(_ url: URL, type: String = "public.png", delayed: Bool = false, failed: Bool = false) -> NSItemProvider {
        let provider = NSItemProvider()
        provider.suggestedName = "旅先の看板.png"
        provider.registerFileRepresentation(forTypeIdentifier: type, fileOptions: [], visibility: .ownProcess) { reply in
            let respond: @Sendable () -> Void = {
                if failed { reply(nil, false, NSError(domain: "PrivateProviderDetailMustNotEscape", code: 123)) }
                else { reply(url, false, nil) }
            }
            if delayed { DispatchQueue.global().asyncAfter(deadline: .now() + 0.1, execute: respond) }
            else { respond() }
            return Progress(totalUnitCount: 1)
        }
        return provider
    }

    private static func photoLoad(_ provider: NSItemProvider, timeout: TimeInterval = 2, cancel: Bool = false,
                                  count: PhotoCompletionCount = PhotoCompletionCount()) async -> Result<NativeIntakeFile, NativeTextExtractionError> {
        await withCheckedContinuation { continuation in
            let load = NativePhotoIntakeLoad { result in
                if count.take() == 1 { continuation.resume(returning: result) }
            }
            load.start(provider: provider, timeout: timeout)
            if cancel { load.cancel(); load.cancel() }
        }
    }

    private static func photoRefused(_ result: Result<NativeIntakeFile, NativeTextExtractionError>, code: String) throws {
        guard case .failure(let error) = result else { throw IntakeCheckFailure(name: "photo-unexpected-acceptance") }
        try check(error.code == code, "photo-wrong-refusal-code")
    }

    private static func sharedContainer(_ name: String, in root: URL) throws -> URL {
        let container = root.appendingPathComponent(name, isDirectory: true)
        try FileManager.default.createDirectory(at: container, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        return container
    }

    // Public producer APIs only: the native callback delivers selected bytes,
    // and each check explicitly keeps that completed candidate in its own store.
    private static func sharedCandidate(_ bytes: Data, name: String, type: String, in root: URL) async throws -> SharedFileCandidate {
        let file = root.appendingPathComponent("provider-\(UUID().uuidString)")
        try bytes.write(to: file)
        let provider = NSItemProvider(); provider.suggestedName = name
        provider.registerFileRepresentation(forTypeIdentifier: type, fileOptions: [], visibility: .ownProcess) { reply in
            reply(file, false, nil)
            return Progress(totalUnitCount: 1)
        }
        return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<SharedFileCandidate, Error>) in
            let load = SharedItemProviderLoad { continuation.resume(with: $0.mapError { $0 as Error }) }
            load.start(attachments: [provider])
        }
    }

    private static func sharedStoredURL(_ receipt: SharedFileReceipt, in container: URL) -> URL {
        container.appendingPathComponent("KairoSharedFiles-v1").appendingPathComponent(receipt.id.uuidString.lowercased() + ".share")
    }

    // Controlled on-disk fixture only. Public Keep produced both incarnations;
    // equate the replacement's time so a consumer that compares only time/hash
    // cannot accidentally pass. No production/test clock hook is imported.
    private static func sharedSameTimeFixture(_ receipt: SharedFileReceipt, time: Int64, in container: URL) throws {
        let file = sharedStoredURL(receipt, in: container), data = try Data(contentsOf: file)
        let offset = Data("KAIRO-SHARE-1\n".utf8).count + 4
        let length = data[(offset - 4)..<offset].reduce(0) { ($0 << 8) | Int($1) }
        var header = try JSONSerialization.jsonObject(with: data[offset..<offset + length]) as! [String: Any]
        try check(header["version"] as? Int == 2 && header["incarnation"] as? String == receipt.incarnation.uuidString.lowercased(), "shared-fixture-header")
        header["storedAtMilliseconds"] = time
        let encoded = try JSONSerialization.data(withJSONObject: header, options: [.sortedKeys, .withoutEscapingSlashes])
        let n = UInt32(encoded.count)
        var changed = data.prefix(offset - 4)
        changed.append(contentsOf: [UInt8(n >> 24), UInt8((n >> 16) & 255), UInt8((n >> 8) & 255), UInt8(n & 255)])
        changed.append(encoded); changed.append(data[(offset + length)...])
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
        try changed.write(to: file)
        try FileManager.default.setAttributes([.posixPermissions: 0o400], ofItemAtPath: file.path)
    }

    static func run() async -> [String: Any] {
        var passed: [String] = [], current = "fixture"
        let evidenceHome = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".dharma")
        let configured = ProcessInfo.processInfo.environment["KAIRO_EVIDENCE_DIR"]
        let base = configured.map { URL(fileURLWithPath: $0) } ?? evidenceHome.appendingPathComponent("bunki/ios-intake-checks")
        let root = base.appendingPathComponent("fixtures-\(UUID().uuidString)")
        do {
            let resolved = base.resolvingSymlinksInPath().standardizedFileURL.path
            var allowed = [evidenceHome.resolvingSymlinksInPath().standardizedFileURL.path + "/"]
            let environment = ProcessInfo.processInfo.environment
            if environment["CI"] != nil, let runner = environment["RUNNER_TEMP"], runner.hasPrefix("/") {
                allowed.append(URL(fileURLWithPath: runner).resolvingSymlinksInPath().standardizedFileURL.path + "/")
            }
            try check((configured == nil || configured!.hasPrefix("/")) && allowed.contains(where: { resolved.hasPrefix($0) }), "external-evidence-root")
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            let bytes = try fixture(), url = root.appendingPathComponent("日本語の原本.pdf")
            try bytes.write(to: url)
            let chosen = try NativeIntakeFile.readChosenURL(url), candidate = try object(chosen.file)
            try check(chosen.file.bytes == bytes.count && chosen.file.pageCount == 2 && chosen.file.sha256 == AssetCatalog.hash(bytes), current)
            passed.append(current)

            current = "closed-native-request"
            _ = try NativeFileIntakeRequest.parse(["method": "available"])
            _ = try NativeFileIntakeRequest.parse(["method": "choose", "expected": NSNull()])
            _ = try NativeFileIntakeRequest.parse(["method": "openOriginal", "file": candidate])
            for bad: Any in [NSNull(), [], "choose", ["method": "unknown"], ["method": "choose"],
                             ["method": "available", "path": url.path], ["method": "choose", "expected": NSNull(), "path": url.path],
                             ["method": "openOriginal", "file": candidate, "url": url.absoluteString]] {
                try refused { _ = try NativeFileIntakeRequest.parse(bad) }
            }
            passed.append(current)

            current = "strict-native-reference"
            for (key, value): (String, Any) in [("name", "../source.pdf"), ("name", "bad\n.pdf"), ("sha256", String(repeating: "A", count: 64)),
                                               ("bytes", true), ("bytes", 1.5), ("pageCount", 0), ("kind", "image"), ("mimeType", "text/html"), ("path", url.path)] {
                var bad = candidate; bad[key] = value
                try refused({ _ = try NativeFileIntakeRequest.parse(["method": "openOriginal", "file": bad]) }, code: "invalid-file-reference")
            }
            passed.append(current)

            current = "strict-native-page-range"
            let token = UUID().uuidString.lowercased()
            for bad: Any in [true, "1", 0, -1, -0.0, 1.5, Double.nan, Double.infinity, 10_001] {
                try refused { _ = try NativeFileIntakeRequest.parse(["method": "extract", "token": token, "firstPage": bad, "lastPage": 2]) }
            }
            for (first, last) in [(2, 1), (1, 21), (0, 1)] {
                try refused { _ = try NativeFileIntakeRequest.parse(["method": "extract", "token": token, "firstPage": first, "lastPage": last]) }
            }
            _ = try NativeFileIntakeRequest.parse(["method": "extract", "token": token, "firstPage": 21, "lastPage": 21])
            passed.append(current)

            current = "candidate-fingerprint-is-not-file-authority"
            let renamed = try NativeIntakeFile.inspect(data: bytes, name: "renamed.html")
            try check(renamed.matches(chosen.file), current)
            var changed = candidate; changed["sha256"] = String(repeating: "0", count: 64)
            guard case .openOriginal(let wrong) = try NativeFileIntakeRequest.parse(["method": "openOriginal", "file": changed]) else { throw IntakeCheckFailure(name: current) }
            try check(!renamed.matches(wrong), current)
            passed.append(current)

            current = "native-read-refuses-nonregular-and-oversized-input"
            let link = root.appendingPathComponent("link.pdf"), empty = root.appendingPathComponent("empty.pdf")
            let large = root.appendingPathComponent("large.pdf"), fifo = root.appendingPathComponent("fifo.pdf")
            try FileManager.default.createSymbolicLink(at: link, withDestinationURL: url)
            try Data().write(to: empty); try Data().write(to: large)
            let handle = try FileHandle(forWritingTo: large); try handle.truncate(atOffset: UInt64(NativeTextExtractor.maxFileBytes + 1)); try handle.close()
            try check(mkfifo(fifo.path, 0o600) == 0, current)
            for bad in [link, empty, large, fifo, root, URL(string: "https://example.org/source.pdf")!] {
                try refused { _ = try NativeIntakeFile.readChosenURL(bad) }
            }
            passed.append(current)

            current = "selected-bytes-survive-original-path-change"
            try Data("changed after native selection".utf8).write(to: url)
            let snapshot = try renamed.writePreview(in: root.appendingPathComponent("preview"))
            try check(snapshot.lastPathComponent == "source.pdf" && (try Data(contentsOf: snapshot)) == bytes, current)
            let attributes = try FileManager.default.attributesOfItem(atPath: snapshot.path)
            try check((attributes[.posixPermissions] as? NSNumber)?.intValue == 0o400, current)
            let extracted = try chosen.extract(firstPage: 2, lastPage: 2)
            try check(extracted.file.sha256 == chosen.file.sha256 && extracted.pages.count == 1 && extracted.pages[0].page == 2, current)
            passed.append(current)

            var time: TimeInterval = 100
            let document = UUID(), otherDocument = UUID(), session = NativeFileIntakeSession(ttl: 5, clock: { time })
            current = "issued-selection-and-exact-page-lifetime"
            let choose = try session.begin(document: document)
            let selectedToken = try session.select(chosen, expected: chosen.file, lease: choose, document: document)
            session.finish(choose)
            let extraction = try session.begin(document: document)
            let selected = try session.selected(token: selectedToken, firstPage: 1, lastPage: 2, lease: extraction, document: document)
            try check(selected.matches(chosen.file), current)
            try refused({ _ = try session.selected(token: token, firstPage: 1, lastPage: 2, lease: extraction, document: document) }, code: "file-selection-expired")
            try refused({ _ = try session.selected(token: selectedToken, firstPage: 1, lastPage: 3, lease: extraction, document: document) }, code: "invalid-page-range")
            session.finish(extraction); passed.append(current)

            current = "foreign-document-and-unissued-lease-refused"
            let other = try session.begin(document: otherDocument), foreign = NativeFileIntakeSession()
            try refused({ _ = try session.selected(token: selectedToken, firstPage: 1, lastPage: 2, lease: other, document: otherDocument) }, code: "file-selection-expired")
            try refused({ try session.assertCurrent(other, document: document) }, code: "source-owner-changed")
            try refused({ try foreign.assertCurrent(other, document: otherDocument) }, code: "source-owner-changed")
            session.finish(other); passed.append(current)

            current = "revocation-keeps-running-job-exclusive"
            let old = try session.begin(document: document)
            try refused({ _ = try session.begin(document: document) }, code: "file-intake-busy")
            session.invalidate()
            try check(session.isBusy, current)
            try refused({ _ = try session.begin(document: otherDocument) }, code: "file-intake-busy")
            try refused({ _ = try session.select(chosen, expected: nil, lease: old, document: document) }, code: "source-owner-changed")
            try refused({ try session.assertCurrent(old, document: document) }, code: "source-owner-changed")
            session.finish(old)
            let next = try session.begin(document: otherDocument)
            session.finish(old) // a late duplicate finish cannot release a new job
            try check(session.isBusy, current); try session.assertCurrent(next, document: otherDocument)
            session.finish(next); passed.append(current)

            current = "expiry-and-explicit-clear-remove-byte-selection"
            let renewed = try session.begin(document: document)
            let renewedToken = try session.select(chosen, expected: nil, lease: renewed, document: document)
            time = 105
            try refused({ _ = try session.selected(token: renewedToken, firstPage: 1, lastPage: 1, lease: renewed, document: document) }, code: "file-selection-expired")
            let clearToken = try session.select(chosen, expected: nil, lease: renewed, document: document)
            session.clearSelection()
            try refused({ _ = try session.selected(token: clearToken, firstPage: 1, lastPage: 1, lease: renewed, document: document) }, code: "file-selection-expired")
            session.finish(renewed); passed.append(current)

            current = "late-expiry-cannot-clear-new-selection"
            let replacing = try session.begin(document: document)
            let olderToken = try session.select(chosen, expected: nil, lease: replacing, document: document)
            let newerToken = try session.select(renamed, expected: nil, lease: replacing, document: document)
            session.clearSelection(ifToken: olderToken)
            try check(try session.selected(token: newerToken, firstPage: 1, lastPage: 1, lease: replacing, document: document).matches(chosen.file), current)
            session.clearSelection(ifToken: newerToken)
            try refused({ _ = try session.selected(token: newerToken, firstPage: 1, lastPage: 1, lease: replacing, document: document) }, code: "file-selection-expired")
            session.finish(replacing); passed.append(current)

            current = "wrong-expected-file-cannot-mint-selection"
            let mismatch = try session.begin(document: document)
            try refused({ _ = try session.select(chosen, expected: wrong, lease: mismatch, document: document) }, code: "file-mismatch")
            session.finish(mismatch)
            try refused({ _ = try session.select(chosen, expected: nil, lease: mismatch, document: document) }, code: "source-owner-changed")
            passed.append(current)

            current = "photos-selected-representation-keeps-exact-bytes-and-name"
            let photoBytes = try photoFixture(), photoURL = root.appendingPathComponent("photo.png")
            try photoBytes.write(to: photoURL)
            let photo = try await photoLoad(photoProvider(photoURL)).get()
            try check(photo.file.sha256 == AssetCatalog.hash(photoBytes) && photo.file.bytes == photoBytes.count &&
                      photo.file.name == "旅先の看板.png" && photo.file.mimeType == "image/png" && photo.file.pageCount == 1, current)
            try Data("the provider source changed".utf8).write(to: photoURL)
            let photoPreview = try photo.writePreview(in: root.appendingPathComponent("photo-preview"))
            try check(try Data(contentsOf: photoPreview) == photoBytes, current)
            try photoBytes.write(to: photoURL)
            passed.append(current)

            current = "photos-refuse-unsupported-mislabeled-pdf-and-oversized-representations"
            try photoRefused(await photoLoad(photoProvider(photoURL, type: "public.camera-raw-image")), code: "unsupported-image")
            try photoRefused(await photoLoad(photoProvider(photoURL, type: "public.jpeg")), code: "unsupported-image")
            let pdfAsPhoto = root.appendingPathComponent("not-a-photo.png")
            try bytes.write(to: pdfAsPhoto)
            try photoRefused(await photoLoad(photoProvider(pdfAsPhoto)), code: "unsupported-image")
            try photoRefused(await photoLoad(photoProvider(large)), code: "file-size")
            passed.append(current)

            current = "photos-provider-failure-is-bounded-and-redacted"
            try photoRefused(await photoLoad(photoProvider(photoURL, failed: true)), code: "file-intake-unavailable")
            let invalidName = photoProvider(photoURL); invalidName.suggestedName = "../private.png"
            try photoRefused(await photoLoad(invalidName), code: "file-name")
            passed.append(current)

            current = "photos-cancellation-and-timeout-reject-late-provider-results-once"
            let cancelledCount = PhotoCompletionCount(), timeoutCount = PhotoCompletionCount()
            try photoRefused(await photoLoad(photoProvider(photoURL, delayed: true), cancel: true, count: cancelledCount), code: "source-owner-changed")
            try photoRefused(await photoLoad(photoProvider(photoURL, delayed: true), timeout: 0.01, count: timeoutCount), code: "file-intake-unavailable")
            try await Task.sleep(for: .milliseconds(200))
            try check(cancelledCount.value == 1 && timeoutCount.value == 1, current)
            try check(try await photoLoad(photoProvider(photoURL)).get().matches(photo.file), current)
            passed.append(current)

            current = "photos-stale-owner-and-wrong-original-cannot-mint-selection"
            let photoSession = NativeFileIntakeSession(), photoDocument = UUID()
            let photoLease = try photoSession.begin(document: photoDocument)
            photoSession.invalidate()
            let latePhoto = try await photoLoad(photoProvider(photoURL, delayed: true)).get()
            try refused({ _ = try photoSession.select(latePhoto, expected: nil, lease: photoLease, document: photoDocument) }, code: "source-owner-changed")
            photoSession.finish(photoLease)
            let nextPhoto = try photoSession.begin(document: photoDocument)
            try refused({ _ = try photoSession.select(photo, expected: chosen.file, lease: nextPhoto, document: photoDocument) }, code: "file-mismatch")
            let photoToken = try photoSession.select(photo, expected: photo.file, lease: nextPhoto, document: photoDocument)
            try check(try photoSession.selected(token: photoToken, firstPage: 1, lastPage: 1, lease: nextPhoto, document: photoDocument).matches(photo.file), current)
            photoSession.finish(nextPhoto)
            passed.append(current)

            current = "camera-encoding-preserves-eight-orientations-without-source-metadata"
            let cameraBytes = try photoFixture(width: 16, height: 8)
            guard let imageSource = CGImageSourceCreateWithData(cameraBytes as CFData, nil),
                  let bitmap = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
                throw IntakeCheckFailure(name: current)
            }
            var captured: NativeIntakeFile?
            for orientation: UInt32 in 1...8 {
                let capture = try NativeCameraImage(image: bitmap, orientation: orientation)
                let encoded = try capture.encode(name: "camera-\(orientation).jpg")
                let copy = try encoded.writePreview(in: root.appendingPathComponent("camera-orientations"))
                let data = try Data(contentsOf: copy)
                guard let source = CGImageSourceCreateWithData(data as CFData, nil),
                      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any] else {
                    throw IntakeCheckFailure(name: current)
                }
                let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                                               kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 32]
                guard let oriented = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
                    throw IntakeCheckFailure(name: current)
                }
                try check(encoded.file.mimeType == "image/jpeg" && encoded.file.kind == "image" && encoded.file.pageCount == 1 &&
                          encoded.file.bytes == data.count && encoded.file.sha256 == AssetCatalog.hash(data) &&
                          ((properties[kCGImagePropertyOrientation] as? NSNumber)?.uint32Value ?? 1) == orientation &&
                          properties[kCGImagePropertyGPSDictionary] == nil &&
                          oriented.width == (orientation >= 5 ? 8 : 16) && oriented.height == (orientation >= 5 ? 16 : 8), current)
                captured = encoded
            }
            passed.append(current)

            current = "camera-rejects-invalid-orientation-dimensions-and-encoded-byte-overflow"
            for bad: UInt32 in [0, 9, UInt32.max] {
                try refused({ _ = try NativeCameraImage(image: bitmap, orientation: bad) }, code: "image-orientation")
            }
            guard let wideContext = CGContext(data: nil, width: 40_001, height: 1, bitsPerComponent: 8, bytesPerRow: 40_001 * 4,
                                             space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
                  let wide = wideContext.makeImage() else { throw IntakeCheckFailure(name: current) }
            try refused({ _ = try NativeCameraImage(image: wide, orientation: 1) }, code: "image-size")
            let bounded = try NativeCameraImage(image: bitmap, orientation: 1)
            for limit in [0, 32, NativeTextExtractor.maxFileBytes + 1] {
                try refused({ _ = try bounded.encode(name: "camera.jpg", maximumBytes: limit) }, code: "file-size")
            }
            try refused({ _ = try bounded.encode(name: "../camera.jpg") }, code: "file-name")
            passed.append(current)

            current = "camera-original-copy-reopens-after-temporary-source-removal"
            guard let captured else { throw IntakeCheckFailure(name: current) }
            let temporaryCamera = try captured.writePreview(in: root.appendingPathComponent("camera-export"))
            let savedCamera = root.appendingPathComponent("saved-camera.jpg")
            try FileManager.default.copyItem(at: temporaryCamera, to: savedCamera)
            let savedImage = try NativeIntakeFile.readChosenURL(savedCamera)
            try check(savedImage.matches(captured.file), current)
            try FileManager.default.removeItem(at: temporaryCamera.deletingLastPathComponent())
            let reopenedCamera = try NativeIntakeFile.readChosenURL(savedCamera)
            try check(reopenedCamera.matches(captured.file), current)
            try photoBytes.write(to: savedCamera, options: .atomic)
            let replacedCamera = try NativeIntakeFile.readChosenURL(savedCamera)
            try check(!replacedCamera.matches(captured.file), current)
            passed.append(current)

            current = "camera-encoded-bytes-cannot-revive-a-revoked-intake-owner"
            let cameraSession = NativeFileIntakeSession(), cameraDocument = UUID()
            let cameraLease = try cameraSession.begin(document: cameraDocument)
            cameraSession.invalidate()
            try refused({ _ = try cameraSession.select(captured, expected: nil, lease: cameraLease, document: cameraDocument) }, code: "source-owner-changed")
            try check(cameraSession.isBusy, current)
            try refused({ _ = try cameraSession.begin(document: cameraDocument) }, code: "file-intake-busy")
            cameraSession.finish(cameraLease)
            let replacementCameraLease = try cameraSession.begin(document: cameraDocument)
            let cameraToken = try cameraSession.select(reopenedCamera, expected: captured.file, lease: replacementCameraLease, document: cameraDocument)
            try check(try cameraSession.selected(token: cameraToken, firstPage: 1, lastPage: 1, lease: replacementCameraLease, document: cameraDocument).matches(captured.file), current)
            cameraSession.finish(replacementCameraLease)
            passed.append(current)

            current = "shared-file-pdf-and-image-reinspect-exact-selected-bytes"
            let sharedRoot = try sharedContainer("shared-holding", in: root)
            let producer = try SharedFileInbox(container: sharedRoot), shared = try NativeSharedFileIntake(container: sharedRoot)
            try check(try shared.choices().isEmpty, current)
            let sharedPDFCandidate = try await sharedCandidate(bytes, name: "共有した原本.pdf", type: "com.adobe.pdf", in: root)
            let sharedImageCandidate = try await sharedCandidate(photoBytes, name: "共有した写真.png", type: "public.png", in: root)
            let sharedPDFReceipt = try producer.keep(sharedPDFCandidate, id: UUID())
            let sharedImageReceipt = try producer.keep(sharedImageCandidate, id: UUID())
            let choices = try shared.choices()
            guard choices.count == 2, let sharedPDFChoice = choices.first(where: { $0.name == sharedPDFCandidate.metadata.name }),
                  let sharedImageChoice = choices.first(where: { $0.name == sharedImageCandidate.metadata.name }) else {
                throw IntakeCheckFailure(name: current)
            }
            let sharedPDF = try shared.readSelected(sharedPDFChoice), sharedImage = try shared.readSelected(sharedImageChoice)
            try check(sharedPDF.file.name == sharedPDFCandidate.metadata.name && sharedPDF.file.sha256 == AssetCatalog.hash(bytes) &&
                      sharedPDF.file.bytes == bytes.count && sharedPDF.file.mimeType == "application/pdf" && sharedPDF.file.kind == "pdf" && sharedPDF.file.pageCount == 2 &&
                      sharedPDFChoice.bytes == bytes.count && sharedPDFChoice.offeredType == "com.adobe.pdf" &&
                      sharedPDFChoice.storedAtMilliseconds == sharedPDFReceipt.storedAtMilliseconds, current)
            try check(sharedImage.file.name == sharedImageCandidate.metadata.name && sharedImage.file.sha256 == AssetCatalog.hash(photoBytes) &&
                      sharedImage.file.bytes == photoBytes.count && sharedImage.file.mimeType == "image/png" && sharedImage.file.kind == "image" && sharedImage.file.pageCount == 1, current)
            let sharedImageCopy = try sharedImage.writePreview(in: root.appendingPathComponent("shared-image-copy"))
            try check(try Data(contentsOf: sharedImageCopy) == photoBytes, current)
            try FileManager.default.removeItem(at: sharedImageCopy.deletingLastPathComponent())
            passed.append(current)

            current = "shared-checksum-valid-malformed-and-mislabeled-content-refused"
            let badRepresentations: [(Data, String)] = [(photoBytes, "com.adobe.pdf"), (bytes, "public.png"),
                                                       (photoBytes, "public.jpeg"), (Data("not a PDF or image".utf8), "com.adobe.pdf")]
            for (index, entry) in badRepresentations.enumerated() {
                let container = try sharedContainer("shared-bad-\(index)", in: root)
                let stored = try SharedFileInbox(container: container), consumer = try NativeSharedFileIntake(container: container)
                let candidate = try await sharedCandidate(entry.0, name: "未検証の版", type: entry.1, in: root)
                let receipt = try stored.keep(candidate, id: UUID())
                guard let choice = try consumer.choices().first else { throw IntakeCheckFailure(name: current) }
                try refused({ _ = try consumer.readSelected(choice) }, code: index < 3 ? "file-mismatch" : nil)
                let stillStored = try stored.read(id: receipt.id)
                try check(stillStored.receipt == receipt && stillStored.candidate.bytes == entry.0, current)
            }
            passed.append(current)

            current = "shared-choice-is-bound-to-its-native-adapter"
            let otherAdapter = try NativeSharedFileIntake(container: sharedRoot)
            try refused({ _ = try otherAdapter.readSelected(sharedPDFChoice) }, code: "file-selection")
            let otherContainer = try sharedContainer("shared-other-container", in: root)
            let foreignAdapter = try NativeSharedFileIntake(container: otherContainer)
            try refused({ _ = try foreignAdapter.readSelected(sharedPDFChoice) }, code: "file-selection")
            try check(try producer.read(id: sharedPDFReceipt.id).receipt == sharedPDFReceipt, current)
            passed.append(current)

            current = "shared-removed-id-cannot-replay-cached-selected-bytes"
            try check(try shared.readSelected(sharedPDFChoice).matches(sharedPDF.file), current)
            try check(try producer.remove(sharedPDFReceipt), current)
            try refused({ _ = try shared.readSelected(sharedPDFChoice) }, code: "file-selection-expired")
            try check(try producer.list() == [sharedImageReceipt], current)
            // A previously selected immutable copy remains that snapshot; a new
            // choice/read may not resurrect the deleted holding entry.
            try check(sharedPDF.matches(chosen.file), current)
            passed.append(current)

            current = "shared-same-content-same-time-new-incarnation-refuses-old-choice"
            let replacement = try producer.keep(sharedPDFCandidate, id: sharedPDFReceipt.id)
            try sharedSameTimeFixture(replacement, time: sharedPDFReceipt.storedAtMilliseconds, in: sharedRoot)
            let currentReceipt = try producer.read(id: sharedPDFReceipt.id).receipt
            try check(currentReceipt.id == sharedPDFReceipt.id && currentReceipt.metadata == sharedPDFReceipt.metadata &&
                      currentReceipt.storedAtMilliseconds == sharedPDFReceipt.storedAtMilliseconds &&
                      currentReceipt.incarnation != sharedPDFReceipt.incarnation, current)
            try refused({ _ = try shared.readSelected(sharedPDFChoice) }, code: "file-changed")
            guard let freshSharedChoice = try shared.choices().first(where: { $0.name == sharedPDFCandidate.metadata.name }) else {
                throw IntakeCheckFailure(name: current)
            }
            let freshSharedPDF = try shared.readSelected(freshSharedChoice)
            try check(freshSharedPDF.matches(sharedPDF.file), current)
            let identityWitness: [String: Any] = ["sameId": true, "sameTime": true, "sameMetadata": true,
                "oldIncarnation": sharedPDFReceipt.incarnation.uuidString.lowercased(), "newIncarnation": currentReceipt.incarnation.uuidString.lowercased(),
                "oldChoiceRefused": true, "freshChoiceSha256": freshSharedPDF.file.sha256,
                "fixture": "Public provider/Keep publications; replacement timestamp normalized only in task-owned closed header"]
            try JSONSerialization.data(withJSONObject: identityWitness, options: [.prettyPrinted, .sortedKeys])
                .write(to: root.appendingPathComponent("shared-incarnation-witness.json"))
            passed.append(current)

            current = "shared-selection-extraction-and-preview-preserve-stored-original"
            let keptBefore = try producer.list(), sharedSession = NativeFileIntakeSession(), sharedDocument = UUID()
            let sharedLease = try sharedSession.begin(document: sharedDocument)
            let sharedToken = try sharedSession.select(freshSharedPDF, expected: chosen.file, lease: sharedLease, document: sharedDocument)
            sharedSession.finish(sharedLease)
            let sharedExtractLease = try sharedSession.begin(document: sharedDocument)
            let sharedSelected = try sharedSession.selected(token: sharedToken, firstPage: 1, lastPage: 2,
                                                           lease: sharedExtractLease, document: sharedDocument)
            let sharedText = try sharedSelected.extract(firstPage: 1, lastPage: 2)
            try check(sharedText.file.sha256 == freshSharedPDF.file.sha256 && sharedText.pages.count == 2, current)
            sharedSession.finish(sharedExtractLease)
            let sharedCopy = try sharedSelected.writePreview(in: root.appendingPathComponent("shared-preview"))
            try check(try Data(contentsOf: sharedCopy) == bytes, current)
            try FileManager.default.removeItem(at: sharedCopy.deletingLastPathComponent())
            try check(try producer.list() == keptBefore && producer.read(id: currentReceipt.id).candidate.bytes == bytes &&
                      shared.readSelected(freshSharedChoice).matches(freshSharedPDF.file), current)
            passed.append(current)

            current = "shared-pending-and-corrupt-files-are-neither-selected-nor-cleaned"
            let guardContainer = try sharedContainer("shared-storage-guards", in: root)
            let guardProducer = try SharedFileInbox(container: guardContainer), guardConsumer = try NativeSharedFileIntake(container: guardContainer)
            let guardReceipt = try guardProducer.keep(sharedPDFCandidate, id: UUID()), pendingID = UUID()
            let pending = guardContainer.appendingPathComponent("KairoSharedFiles-v1").appendingPathComponent(".pending-" + pendingID.uuidString.lowercased())
            let pendingBytes = Data("unfinished task-owned write".utf8)
            try pendingBytes.write(to: pending)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: pending.path)
            let guardChoices = try guardConsumer.choices()
            guard guardChoices.count == 1, let guardChoice = guardChoices.first else { throw IntakeCheckFailure(name: current) }
            try check(try guardConsumer.readSelected(guardChoice).matches(sharedPDF.file) && guardProducer.unfinishedWrites() == [pendingID], current)
            let guardFile = sharedStoredURL(guardReceipt, in: guardContainer)
            var changedBytes = try Data(contentsOf: guardFile); changedBytes[changedBytes.count - 1] ^= 1
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: guardFile.path)
            try changedBytes.write(to: guardFile)
            try FileManager.default.setAttributes([.posixPermissions: 0o400], ofItemAtPath: guardFile.path)
            try refused({ _ = try guardConsumer.readSelected(guardChoice) }, code: "file-changed")
            try refused({ _ = try guardConsumer.choices() }, code: "file-changed")
            try check(try Data(contentsOf: guardFile) == changedBytes && Data(contentsOf: pending) == pendingBytes &&
                      guardProducer.unfinishedWrites() == [pendingID], current)
            passed.append(current)

            current = "shared-cancellation-and-stale-session-cannot-mint-selection"
            // This task cannot run on MainActor until the current actor yields,
            // so cancellation is deterministic rather than a scheduler race.
            let cancelledRead = Task { @MainActor in try shared.readSelected(freshSharedChoice) }
            cancelledRead.cancel()
            do { _ = try await cancelledRead.value; throw IntakeCheckFailure(name: current) }
            catch let error as NativeTextExtractionError { try check(error.code == "source-owner-changed", current) }
            let staleSharedLease = try sharedSession.begin(document: sharedDocument)
            let lateSharedRead = Task.detached { try shared.readSelected(freshSharedChoice) }
            sharedSession.invalidate()
            try check(sharedSession.isBusy, current)
            try refused({ _ = try sharedSession.begin(document: UUID()) }, code: "file-intake-busy")
            let lateSharedFile = try await lateSharedRead.value
            try refused({ _ = try sharedSession.select(lateSharedFile, expected: nil, lease: staleSharedLease, document: sharedDocument) }, code: "source-owner-changed")
            sharedSession.finish(staleSharedLease)
            try check(try producer.list() == keptBefore, current)
            passed.append(current)

            current = "shared-original-and-document-checks-remain-required"
            let nextSharedLease = try sharedSession.begin(document: sharedDocument)
            try refused({ _ = try sharedSession.select(freshSharedPDF, expected: sharedImage.file, lease: nextSharedLease, document: sharedDocument) }, code: "file-mismatch")
            try refused({ _ = try sharedSession.select(freshSharedPDF, expected: chosen.file, lease: nextSharedLease, document: UUID()) }, code: "source-owner-changed")
            let currentSharedToken = try sharedSession.select(freshSharedPDF, expected: chosen.file, lease: nextSharedLease, document: sharedDocument)
            try check(try sharedSession.selected(token: currentSharedToken, firstPage: 1, lastPage: 1, lease: nextSharedLease, document: sharedDocument).matches(chosen.file), current)
            sharedSession.finish(nextSharedLease)
            try check(try producer.list() == keptBefore, current)
            passed.append(current)

            return ["status": "passed", "platform": "macOS-shared-native-intake", "passed": passed.count, "checks": passed,
                    "fixtureDirectory": root.path, "fixtureSha256": chosen.file.sha256,
                    "scope": "Actual shared request/read/PDF extraction, NSItemProvider loading, camera-image encoding, injected shared-file consumer, exact publication/content checks, and document/expiry/revocation contracts. Public share producer APIs; synthetic files/providers and explicitly labeled storage fixtures. No learner Save, camera hardware/permission, Photos library, UIKit, picker/share UI, App Group, iOS build or physical acceptance."]
        } catch {
            return ["status": "failed", "platform": "macOS-shared-native-intake", "passed": passed.count, "checks": passed,
                    "failedCheck": current, "failure": (error as? IntakeCheckFailure)?.name ?? (error as? NativeTextExtractionError)?.code ?? "native-check-failed", "fixtureDirectory": root.path]
        }
    }
}
