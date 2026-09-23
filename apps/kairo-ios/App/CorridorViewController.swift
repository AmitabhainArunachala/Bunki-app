import AVFoundation
import KairoAppleSync
import KairoIOSHostCore
import UIKit
import UniformTypeIdentifiers
import WebKit

@MainActor
private final class BridgeProxy: NSObject, WKScriptMessageHandler, WKScriptMessageHandlerWithReply {
    weak var owner: CorridorViewController?
    init(_ owner: CorridorViewController) { self.owner = owner }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        owner?.receiveGesture(message)
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard let owner else { replyHandler(nil, "host-unavailable"); return }
        owner.receiveFileRequest(message, reply: replyHandler)
    }
}

/// UIKit owns navigation, capture permission, and file UI. The bundled renderer
/// has no arbitrary filesystem, networking or profile-authority bridge.
@MainActor
final class CorridorViewController: UIViewController, WKNavigationDelegate, WKUIDelegate,
                                    UIDocumentPickerDelegate, WKDownloadDelegate {
    private var webView: WKWebView!
    private var bridge: BridgeProxy!
    private var server: LoopbackServer?
    private var document = UUID()
    private var navigating = false
    private var trustedAt = -Double.infinity
    private var saveReply: ((Any?, String?) -> Void)?
    private var exportURL: URL?
    private var exportDocument: UUID?
    private var download: WKDownload?
    private var failureView: UIStackView?
    private var lifecycleObservers: [NSObjectProtocol] = []
    private var syncOwner: WKSyncOwner?
    private var intakeOwner: WKIntakeOwner?
    private let sharedFileIntake: NativeSharedFileIntake?
    private var initialProfile: NativeSyncProfile?
    private var importingProfile = false
    private var pairingInitialProfile = false
    private var didStart = false
    private var initialPairingEpoch = UUID()
    private var initialBootstrap: NativeCloudSyncBootstrap?

    /// Native composition may supply an existing consumer. Ordinary launch and
    /// decoded view controllers have no container discovery or fallback route.
    init(sharedFileIntake: NativeSharedFileIntake? = nil) {
        self.sharedFileIntake = sharedFileIntake
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        sharedFileIntake = nil
        super.init(coder: coder)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        if let bytes = UserDefaults.standard.data(forKey: "kairo.native.initial-profile-v1") {
            initialProfile = try? NativeSyncProfile.importCandidate(bytes)
        }
        view.backgroundColor = UIColor(red: 0.95, green: 0.92, blue: 0.85, alpha: 1)
        bridge = BridgeProxy(self)
        let configuration = WKWebViewConfiguration()
        // Never replace with nonPersistent(), clear data on launch, or derive a
        // data-store identifier from a build version or a CloudKit account.
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = .all
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.limitsNavigationsToAppBoundDomains = true
        let scripts = configuration.userContentController
        scripts.add(bridge, contentWorld: .defaultClient, name: "kairoGesture")
        scripts.addScriptMessageHandler(bridge, contentWorld: .page, name: "kairoFiles")
        scripts.addUserScript(WKUserScript(source: Self.gestureScript, injectionTime: .atDocumentStart,
                                          forMainFrameOnly: true, in: .defaultClient))
        guard let bridgeURL = Bundle.main.url(forResource: "HostBridge", withExtension: "js"),
              let source = try? String(contentsOf: bridgeURL, encoding: .utf8) else {
            showFailure("The bundled app is incomplete. Install a complete build."); return
        }
        scripts.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        let intakeOwner = WKIntakeOwner(webView: webView, presenter: self,
            documentID: { [weak self] in self?.document ?? UUID() },
            documentCurrent: { [weak self] in
                guard let self else { return false }
                return !self.navigating && HostPolicy.isAppURL(self.webView?.url)
            },
            consumeGesture: { [weak self] in
                guard let self, self.recentGesture(within: 30), self.saveReply == nil, self.download == nil,
                      !self.importingProfile, !self.pairingInitialProfile else { return false }
                self.trustedAt = -Double.infinity
                return true
            }, sharedFileIntake: sharedFileIntake)
        self.intakeOwner = intakeOwner
        scripts.addScriptMessageHandler(intakeOwner, contentWorld: .page, name: "kairoIntake")
        let syncOwner = WKSyncOwner(webView: webView, presenter: self, initialProfile: initialProfile,
            documentID: { [weak self] in self?.document ?? UUID() },
            trustedGesture: { [weak self] in self?.recentGesture() == true })
        self.syncOwner = syncOwner
        scripts.addScriptMessageHandler(syncOwner, contentWorld: .page, name: "kairoSync")
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor
        webView.scrollView.backgroundColor = view.backgroundColor
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        lifecycleObservers.append(NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.trustedAt = -Double.infinity
                self?.initialPairingEpoch = UUID()
                self?.initialBootstrap?.revoke(.shutdown)
                self?.initialBootstrap = nil
                self?.syncOwner?.invalidate(documentChanged: false)
                if self?.saveReply != nil || self?.download != nil { self?.finishExport(saved: false, error: "document-changed") }
            }
        })
        lifecycleObservers.append(NotificationCenter.default.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.trustedAt = -Double.infinity
                self?.intakeOwner?.invalidate()
            }
        })
        lifecycleObservers.append(NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.didStart, self.initialBootstrap == nil, self.presentedViewController == nil,
                      !UserDefaults.standard.bool(forKey: "kairo.native.start-chosen-v1") else { return }
                self.showStartChoice()
            }
        })
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !didStart else { recoverStartChoice(); return }; didStart = true
        if UserDefaults.standard.bool(forKey: "kairo.native.start-chosen-v1") { startHost() }
        else { showStartChoice() }
    }

    private func showStartChoice() {
        guard UIApplication.shared.applicationState == .active, presentedViewController == nil,
              initialBootstrap == nil, !importingProfile, !pairingInitialProfile,
              !UserDefaults.standard.bool(forKey: "kairo.native.start-chosen-v1") else { return }
        let alert = UIAlertController(title: "Start KAIRO", message: "Start a record on this iPhone, or link your notes using a profile file from your other device.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Start on this iPhone", style: .default) { [weak self] _ in
            UserDefaults.standard.set(true, forKey: "kairo.native.start-chosen-v1"); self?.startHost()
        })
        let link = UIAlertAction(title: "Use another device’s profile", style: .default) { [weak self, weak alert] _ in
            guard let self, let alert else { return }
            self.importingProfile = true
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.json], asCopy: true)
            picker.delegate = self
            alert.dismiss(animated: true) { self.present(picker, animated: true) }
        }
        link.isEnabled = WKSyncOwner.configured
        alert.addAction(link)
        present(alert, animated: true)
    }

    private func recoverStartChoice() {
        guard didStart, initialBootstrap == nil, !importingProfile, !pairingInitialProfile else { return }
        showStartChoice()
    }

    private func startHost() {
        failureView?.removeFromSuperview(); failureView = nil
        guard let root = Bundle.main.resourceURL?.appendingPathComponent("site", isDirectory: true),
              let artifact = Bundle.main.object(forInfoDictionaryKey: "KairoArtifactSHA256") as? String,
              let manifest = Bundle.main.object(forInfoDictionaryKey: "KairoManifestSHA256") as? String else {
            showFailure("The app’s build identity is missing. Install a complete build."); return
        }
        do {
            let catalog = try AssetCatalog(root: root, expectedArtifactSHA256: artifact, expectedManifestSHA256: manifest)
            let server = LoopbackServer(catalog: catalog)
            self.server = server
            server.start { [weak self, weak server] result in
                DispatchQueue.main.async {
                    guard let self, let server, self.server === server else { return }
                    switch result {
                    case .success: self.webView.load(URLRequest(url: HostPolicy.entryURL))
                    case .failure:
                        self.server = nil
                        self.showFailure("KAIRO could not open its local library. Close any other running KAIRO build and try again. Your saved record has not been reset.")
                    }
                }
            }
        } catch { showFailure("The bundled library does not match this app build. Install a complete build. Your saved record has not been reset.") }
    }

    @objc private func retryHost() {
        if server != nil {
            failureView?.removeFromSuperview(); failureView = nil
            webView.load(URLRequest(url: HostPolicy.entryURL))
        } else { startHost() }
    }

    private func showFailure(_ message: String) {
        failureView?.removeFromSuperview()
        let label = UILabel()
        label.text = message; label.numberOfLines = 0; label.textAlignment = .center
        label.font = .preferredFont(forTextStyle: .body)
        label.adjustsFontForContentSizeCategory = true
        let retry = UIButton(type: .system)
        retry.setTitle("Try again", for: .normal)
        retry.addTarget(self, action: #selector(retryHost), for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [label, retry])
        stack.axis = .vertical; stack.spacing = 24; stack.translatesAutoresizingMaskIntoConstraints = false
        stack.backgroundColor = view.backgroundColor
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerYAnchor.constraint(equalTo: view.safeAreaLayoutGuide.centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 28),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -28),
        ])
        failureView = stack
    }

    private func isOwned(_ frame: WKFrameInfo) -> Bool {
        !navigating && frame.isMainFrame && HostPolicy.isAppURL(frame.request.url) && HostPolicy.isAppURL(webView?.url)
    }

    private func recentGesture(within seconds: Double = 2) -> Bool {
        let age = ProcessInfo.processInfo.systemUptime - trustedAt
        return UIApplication.shared.applicationState == .active && age >= 0 && age < seconds
    }

    fileprivate func receiveGesture(_ message: WKScriptMessage) {
        guard message.name == "kairoGesture", message.webView === webView, isOwned(message.frameInfo),
              message.body as? String == "trusted-input" else { return }
        trustedAt = ProcessInfo.processInfo.systemUptime
    }

    fileprivate func receiveFileRequest(_ message: WKScriptMessage, reply: @escaping (Any?, String?) -> Void) {
        guard message.webView === webView, isOwned(message.frameInfo), recentGesture(within: 30),
              saveReply == nil, intakeOwner?.isBusy != true, presentedViewController == nil,
              let body = message.body as? [String: Any], Set(body.keys) == ["filename", "mimeType", "text"],
              let name = body["filename"] as? String, let mime = body["mimeType"] as? String,
              let text = body["text"] as? String,
              let filename = HostPolicy.exportFilename(name, mimeType: mime),
              text.utf8.count > 0, text.utf8.count <= HostPolicy.maximumFileBytes else {
            reply(nil, "file-export-unavailable"); return
        }
        // The 30-second window covers async backup hashing after a real click.
        // Only the isolated content-world listener may arm it, and it is used once.
        trustedAt = -Double.infinity
        saveReply = reply; exportDocument = document
        do {
            let url = try temporaryExport(filename)
            exportURL = url
            try Data(text.utf8).write(to: url, options: [.atomic, .completeFileProtection])
            presentExport(url)
        } catch { finishExport(saved: false, error: "file-export-unavailable") }
    }

    private func temporaryExport(_ filename: String) throws -> URL {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("KairoExports", isDirectory: true).appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appendingPathComponent(filename)
    }

    private func presentExport(_ url: URL) {
        let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: true)
        picker.delegate = self
        picker.modalPresentationStyle = .formSheet
        present(picker, animated: true)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        if importingProfile {
            importingProfile = false
            guard let url = urls.first else { showStartChoice(); return }
            pairingInitialProfile = true
            controller.dismiss(animated: true) { [weak self] in self?.acceptInitialProfile(url) }
            return
        }
        finishExport(saved: !urls.isEmpty && exportDocument == document)
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        if importingProfile {
            importingProfile = false
            controller.dismiss(animated: true) { [weak self] in self?.showStartChoice() }
        } else { finishExport(saved: false) }
    }

    private func acceptInitialProfile(_ url: URL) {
        let epoch = UUID()
        initialPairingEpoch = epoch
        let current = { [weak self] in self?.initialPairingEpoch == epoch && UIApplication.shared.applicationState == .active }
        Task {
            defer { pairingInitialProfile = false; recoverStartChoice() }
            do {
                guard current() else { throw IOSSyncError("stale-session") }
                let accessing = url.startAccessingSecurityScopedResource()
                defer { if accessing { url.stopAccessingSecurityScopedResource() } }
                let values = try url.resourceValues(forKeys: [.fileSizeKey])
                guard let size = values.fileSize, size > 0, size <= 4096 else { throw IOSSyncError("invalid-profile") }
                let bytes = try Data(contentsOf: url)
                let profile = try NativeSyncProfile.importCandidate(bytes)
                guard HostPolicy.isInitialScope(accountId: profile.scope.accountID, learnerId: profile.scope.learnerID) else { throw IOSSyncError("invalid-profile") }
                let occupied = await withCheckedContinuation { continuation in
                    WKWebsiteDataStore.default().fetchDataRecords(ofTypes: [WKWebsiteDataTypeIndexedDBDatabases, WKWebsiteDataTypeLocalStorage]) { records in
                        continuation.resume(returning: records.contains { $0.displayName.lowercased() == "localhost" })
                    }
                }
                guard current(), !occupied else { throw IOSSyncError("target-occupied") }
                let bootstrap = try WKSyncOwner.makeBootstrap()
                initialBootstrap = bootstrap
                defer { if initialBootstrap === bootstrap { initialBootstrap = nil } }
                try await WKSyncOwner.pairInitialProfile(profile, bootstrap: bootstrap, presenter: self, assertCurrent: current)
                guard current(), initialBootstrap === bootstrap else { throw IOSSyncError("stale-session") }
                UserDefaults.standard.set(bytes, forKey: "kairo.native.initial-profile-v1")
                UserDefaults.standard.set(true, forKey: "kairo.native.start-chosen-v1")
                // Recreate only the unstarted view/bridge. No page or learner
                // store has been opened yet, so there is no identity replacement.
                initialProfile = profile
                webView.configuration.userContentController.removeScriptMessageHandler(forName: "kairoSync", contentWorld: .page)
                let owner = WKSyncOwner(webView: webView, presenter: self, initialProfile: profile,
                    documentID: { [weak self] in self?.document ?? UUID() },
                    trustedGesture: { [weak self] in self?.recentGesture() == true })
                syncOwner = owner
                webView.configuration.userContentController.addScriptMessageHandler(owner, contentWorld: .page, name: "kairoSync")
                startHost()
            } catch {
                guard current() else { return }
                let alert = UIAlertController(title: "Profile could not be linked", message: "Choose a KAIRO profile file from your other device and use the same iCloud account. Your existing record has not been changed.", preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "Continue", style: .default) { [weak self, weak alert] _ in
                    alert?.dismiss(animated: true) { self?.showStartChoice() }
                })
                present(alert, animated: true)
            }
        }
    }

    private func finishExport(saved: Bool, error: String? = nil) {
        let reply = saveReply; saveReply = nil; exportDocument = nil
        let previousDownload = download; download = nil
        let previousURL = exportURL; exportURL = nil
        if let previousDownload {
            previousDownload.cancel { _ in
                if let url = previousURL { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
            }
        } else if let url = previousURL { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        reply?(saved, error)
    }

    private func suspendDocument() {
        navigating = true; trustedAt = -Double.infinity
        intakeOwner?.invalidate()
        syncOwner?.navigationStarted()
        // Native CloudKit attachment also revokes here; it may never survive
        // a renderer replacement, navigation, or loss of foreground ownership.
        if saveReply != nil || download != nil { finishExport(saved: false, error: "document-changed") }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        guard navigationAction.targetFrame?.isMainFrame != false else { decisionHandler(.cancel); return }
        if navigationAction.shouldPerformDownload && HostPolicy.isAppBlobURL(url) && recentGesture(within: 30) {
            decisionHandler(.download); return
        }
        if HostPolicy.isAppURL(url) && navigationAction.targetFrame != nil { decisionHandler(.allow); return }
        if navigationAction.navigationType == .linkActivated, recentGesture(), let raw = url?.absoluteString,
           let external = HostPolicy.publisherURL(raw) {
            // Publisher pages are handled by the user's browser, without any
            // KAIRO bridge or access to the KAIRO WebKit data store.
            UIApplication.shared.open(external, options: [:])
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { suspendDocument() }
    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        // A provisional load can fail while the old RecordController remains.
        // Only an actual replacement document may own a fresh uncertainty fence.
        document = UUID(); navigating = false
        syncOwner?.navigationFinished(committed: true)
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        suspendDocument()
        showFailure("KAIRO’s web view stopped. Tap Try again to reopen your saved record.")
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        navigating = false
        syncOwner?.navigationFinished(committed: false)
        guard (error as NSError).code != NSURLErrorCancelled else { return }
        showFailure("The local library could not be opened. Tap Try again. Your saved record has not been reset.")
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { nil }

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        guard type == .microphone, isOwned(frame), origin.protocol == "http", origin.host == "localhost",
              origin.port == Int(HostPolicy.port), recentGesture() else { decisionHandler(.deny); return }
        let capturedDocument = document
        trustedAt = -Double.infinity
        AVCaptureDevice.requestAccess(for: .audio) { [weak self] allowed in
            DispatchQueue.main.async {
                guard let self, allowed, self.document == capturedDocument, self.isOwned(frame),
                      UIApplication.shared.applicationState == .active else { decisionHandler(.deny); return }
                decisionHandler(.grant)
            }
        }
    }

    // WK handles the existing HTML input[type=file] with its system picker;
    // the canonical renderer retains all size/schema/merge checks. WKDownload
    // covers the existing markdown-note export without widening the file bridge.
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        guard self.download == nil, saveReply == nil, intakeOwner?.isBusy != true, recentGesture(within: 30) else { download.cancel { _ in }; return }
        trustedAt = -Double.infinity
        self.download = download; exportDocument = document
        download.delegate = self
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        guard self.download === download, HostPolicy.isAppBlobURL(response.url),
              response.expectedContentLength <= Int64(HostPolicy.maximumFileBytes),
              let mime = response.mimeType, let filename = HostPolicy.exportFilename(suggestedFilename, mimeType: mime),
              let url = try? temporaryExport(filename) else { completionHandler(nil); return }
        exportURL = url; completionHandler(url)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard self.download === download, UIApplication.shared.applicationState == .active,
              exportDocument == document, let url = exportURL,
              let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize,
              size > 0, size <= HostPolicy.maximumFileBytes, presentedViewController == nil else {
            finishExport(saved: false); return
        }
        presentExport(url)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        guard self.download === download else { return }
        finishExport(saved: false)
    }

    private static let gestureScript = """
    (() => {
      if (location.origin !== 'http://localhost:43187' || window !== top) return;
      for (const type of ['pointerdown', 'keydown']) {
        addEventListener(type, event => {
          if (event.isTrusted) webkit.messageHandlers.kairoGesture.postMessage('trusted-input');
        }, true);
      }
    })();
    """
}
