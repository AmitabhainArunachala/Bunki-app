import Foundation
import KairoAppleSync
import KairoIOSHostCore
import UIKit
import WebKit

@MainActor
final class WKSyncOwner: NSObject, WKScriptMessageHandlerWithReply {
    private weak var webView: WKWebView?
    private weak var presenter: UIViewController?
    private let documentID: () -> UUID
    private let trustedGesture: () -> Bool
    private let initialProfile: NativeSyncProfile?
    private var registration: (id: String, document: UUID, binding: IOSSyncBinding)?
    private var bootstrap: NativeCloudSyncBootstrap?
    private var connection: NativeCloudSyncConnection?
    private var coordinator: IOSNativeSyncCoordinator?
    private var state = "disconnected"
    private var lastCode: String?
    private var actionEpoch = UUID()
    private var mutationDocument: UUID?
    private var mutationFence = IOSStoreMutationFence()
    private var documentReady = true

    init(webView: WKWebView, presenter: UIViewController, initialProfile: NativeSyncProfile?,
         documentID: @escaping () -> UUID, trustedGesture: @escaping () -> Bool) {
        self.webView = webView; self.presenter = presenter; self.initialProfile = initialProfile
        self.documentID = documentID; self.trustedGesture = trustedGesture
    }

    static var configured: Bool {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "KairoCloudKitContainer") as? String else { return false }
        return value.hasPrefix("iCloud.") && !value.contains("$(")
    }

    static func makeBootstrap() throws -> NativeCloudSyncBootstrap {
        guard configured, let container = Bundle.main.object(forInfoDictionaryKey: "KairoCloudKitContainer") as? String,
              let bundle = Bundle.main.bundleIdentifier else { throw IOSSyncError("configuration-unavailable") }
        return try NativeCloudSyncBootstrap(containerIdentifier: container, keychainService: bundle + ".native-sync")
    }

    /// Used before the first page is loaded. Import is a candidate; only this
    /// separate native confirmation can pair it to the actual SDK account.
    static func pairInitialProfile(_ profile: NativeSyncProfile, bootstrap: NativeCloudSyncBootstrap,
                                   presenter: UIViewController, assertCurrent: () -> Bool) async throws {
        defer { bootstrap.revoke(.shutdown) }
        guard assertCurrent() else { throw IOSSyncError("stale-session") }
        let challenge = try await bootstrap.begin(profile: profile, connectionID: UUID())
        guard assertCurrent() else { throw IOSSyncError("stale-session") }
        guard await confirm(challenge, presenter: presenter) else { throw IOSSyncError("cancelled") }
        guard assertCurrent() else { throw IOSSyncError("stale-session") }
        let connection = try await bootstrap.complete(challenge, decision: challenge.requiresPairing ? .pairNew : .connectExisting)
        guard assertCurrent(), connection.isCurrent else { connection.invalidate(.shutdown); throw IOSSyncError("stale-session") }
        connection.invalidate(.shutdown)
    }

    private static func confirm(_ challenge: NativePairingChallenge, presenter: UIViewController) async -> Bool {
        guard UIApplication.shared.applicationState == .active, presenter.presentedViewController == nil else { return false }
        return await withCheckedContinuation { continuation in
            let message = "\(challenge.profile.label)\n\nAccount: \(challenge.profile.scope.accountID)\nLearner: \(challenge.profile.scope.learnerID)\n\niCloud account fingerprint:\n\(challenge.account.fingerprint)\n\nLink this exact profile to this iCloud account?"
            let alert = UIAlertController(title: challenge.requiresPairing ? "Link this profile" : "Connect notes", message: message, preferredStyle: .alert)
            let finish: (Bool) -> Void = { [weak alert] accepted in
                guard let alert else { continuation.resume(returning: false); return }
                alert.dismiss(animated: true) { continuation.resume(returning: accepted) }
            }
            let cancel = UIAlertAction(title: "Cancel", style: .cancel) { _ in finish(false) }
            alert.addAction(cancel)
            alert.addAction(UIAlertAction(title: challenge.requiresPairing ? "Link profile" : "Connect", style: .default) { _ in finish(true) })
            alert.preferredAction = cancel
            presenter.present(alert, animated: true)
        }
    }

    func invalidate(documentChanged: Bool) {
        mutationFence.invalidate()
        if mutationDocument != documentID() {
            mutationDocument = documentID()
            mutationFence = IOSStoreMutationFence()
        }
        actionEpoch = UUID()
        coordinator?.cancel(); coordinator = nil
        bootstrap?.revoke(documentChanged ? .connectionLost : .shutdown)
        connection?.invalidate(documentChanged ? .connectionLost : .shutdown)
        connection = nil; state = "disconnected"; lastCode = nil
        if documentChanged { registration = nil }
    }

    func navigationStarted() {
        documentReady = false
        invalidate(documentChanged: true)
    }

    func navigationFinished(committed: Bool) {
        documentReady = true
        if committed { invalidate(documentChanged: true) }
    }

    private func owned(_ id: String? = nil) -> Bool {
        guard documentReady, let webView, HostPolicy.isAppURL(webView.url), UIApplication.shared.applicationState == .active,
              let registration, registration.document == documentID() else { return false }
        return id == nil || id == registration.id
    }
    private func status() -> [String: Any] {
        if mutationFence.requiresReopen { return ["state": "error", "code": "reopen-required"] }
        if !Self.configured { return ["state": "unavailable", "code": "configuration-unavailable"] }
        if state == "ready", connection?.isCurrent != true { state = "disconnected" }
        var row: [String: Any] = ["state": state]
        if let lastCode { row["code"] = lastCode }
        return row
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard let webView, message.webView === webView, message.frameInfo.isMainFrame,
              HostPolicy.isAppURL(message.frameInfo.request.url), HostPolicy.isAppURL(webView.url),
              let body = message.body as? [String: Any], let method = body["method"] as? String else {
            replyHandler(nil, "invalid-request"); return
        }
        if method == "initialScope", Set(body.keys) == ["method"] {
            if let initialProfile { replyHandler(["accountId": initialProfile.scope.accountID, "learnerId": initialProfile.scope.learnerID], nil) }
            else { replyHandler(NSNull(), nil) }
            return
        }
        if method == "register", Set(body.keys) == ["method", "binding"] {
            guard documentReady, UIApplication.shared.applicationState == .active else { replyHandler(nil, "stale-session"); return }
            guard let raw = body["binding"] as? [String: String], let binding = try? IOSSyncBinding(raw),
                  initialProfile == nil || initialProfile?.scope == binding.scope else { replyHandler(nil, "binding-mismatch"); return }
            invalidate(documentChanged: true)
            let id = UUID().uuidString.lowercased()
            registration = (id, documentID(), binding)
            replyHandler(["registrationId": id], nil); return
        }
        guard Set(body.keys) == ["method", "registrationId"], let id = body["registrationId"] as? String,
              owned(id) else { replyHandler(nil, "stale-session"); return }
        if method == "status" { replyHandler(status(), nil); return }
        if method == "unregister" || method == "disconnect" {
            invalidate(documentChanged: method == "unregister")
            replyHandler(status(), nil); return
        }
        guard !mutationFence.requiresReopen else { replyHandler(status(), nil); return }
        guard method == "connect" || method == "sync", trustedGesture(), state != "connecting", state != "syncing" else {
            replyHandler(nil, "sync-unavailable"); return
        }
        let capturedDocument = documentID()
        let capturedFence = mutationFence
        let action = UUID()
        actionEpoch = action
        Task {
            do {
                var result: [String: Any]?
                if method == "connect" { try await connect(id: id, action: action) }
                else { result = try await sync(id: id, action: action) }
                guard owned(id), actionEpoch == action, documentID() == capturedDocument else { replyHandler(nil, "stale-session"); return }
                var value = status()
                if let result { value["result"] = result }
                replyHandler(value, nil)
            } catch {
                let known = error as? IOSSyncError
                if known?.targetCommitDurable == true || known?.code == "reopen-required" { capturedFence.markUncertain() }
                guard owned(id), actionEpoch == action, documentID() == capturedDocument else { replyHandler(nil, "stale-session"); return }
                lastCode = known?.targetCommitDurable == true ? "reopen-required" : known?.code ?? "sync-unavailable"
                state = lastCode == "cancelled" ? "disconnected" : "error"
                replyHandler(status(), nil)
            }
        }
    }

    private func connect(id: String, action: UUID) async throws {
        guard owned(id), actionEpoch == action, let registration, let presenter else { throw IOSSyncError("stale-session") }
        invalidate(documentChanged: false)
        actionEpoch = action
        state = "connecting"
        let bootstrap = try Self.makeBootstrap()
        self.bootstrap = bootstrap
        let profile = try NativeSyncProfile(scope: registration.binding.scope, label: "KAIRO notes")
        let challenge = try await bootstrap.begin(profile: profile, connectionID: UUID())
        guard owned(id), actionEpoch == action, self.bootstrap === bootstrap else { throw IOSSyncError("stale-session") }
        guard await Self.confirm(challenge, presenter: presenter) else { bootstrap.revoke(.shutdown); throw IOSSyncError("cancelled") }
        guard owned(id), actionEpoch == action, self.bootstrap === bootstrap else { bootstrap.revoke(.connectionLost); throw IOSSyncError("stale-session") }
        let connection = try await bootstrap.complete(challenge, decision: challenge.requiresPairing ? .pairNew : .connectExisting)
        guard owned(id), actionEpoch == action, self.bootstrap === bootstrap, connection.isCurrent else { connection.invalidate(.connectionLost); throw IOSSyncError("stale-session") }
        self.connection = connection
        try connection.setInvalidationHandler { [weak self, weak connection] _ in
            DispatchQueue.main.async {
                guard let self, let connection, self.connection === connection else { return }
                self.mutationFence.invalidate()
                self.actionEpoch = UUID()
                self.coordinator?.cancel(); self.coordinator = nil; self.connection = nil; self.state = "disconnected"
            }
        }
        state = "ready"; lastCode = nil
    }

    private func sync(id: String, action: UUID) async throws -> [String: Any] {
        guard owned(id), actionEpoch == action, let registration, let connection, connection.isCurrent, let webView else { throw IOSSyncError("session-required") }
        let capturedDocument = documentID()
        let store = WKRecordStore(webView: webView, registrationId: id, mutationFence: mutationFence) { [weak self] in
            self?.owned(id) == true && self?.documentID() == capturedDocument && self?.actionEpoch == action
        }
        let coordinator = try IOSNativeSyncCoordinator(connection: connection, binding: registration.binding, store: store)
        self.coordinator = coordinator; state = "syncing"; lastCode = nil
        defer { if self.coordinator === coordinator { self.coordinator = nil } }
        let data = try await coordinator.syncOnce()
        guard owned(id), actionEpoch == action, connection.isCurrent, self.connection === connection,
              let result = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw IOSSyncError("stale-session") }
        state = "ready"
        return result
    }

}
