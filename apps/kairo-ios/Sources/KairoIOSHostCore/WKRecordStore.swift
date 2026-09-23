import Foundation
import WebKit

/// Shared by iOS and the macOS WebKit probe. Exact registration/document/action
/// fencing comes from native ownership. A stale/failed mutation reply is always
/// uncertain and cannot be automatically repeated.
@MainActor
public final class WKRecordStore: IOSSyncStore {
    private weak var webView: WKWebView?
    private let registrationId: String
    private let assertCurrent: () -> Bool
    private let mutationFence: IOSStoreMutationFence
    public init(webView: WKWebView, registrationId: String, mutationFence: IOSStoreMutationFence,
                assertCurrent: @escaping () -> Bool) {
        self.webView = webView; self.registrationId = registrationId; self.assertCurrent = assertCurrent
        self.mutationFence = mutationFence
    }
    public var isCurrent: Bool { webView != nil && !mutationFence.requiresReopen && assertCurrent() }
    public func confirmMutation() { mutationFence.confirm() }
    public func request(method: String, request: Data?) async throws -> Data {
        guard isCurrent, let webView, HostPolicy.isAppURL(webView.url),
              ["snapshot", "prepareNativeSnapshot", "acknowledgeOutbox", "commitReceive"].contains(method) else { throw IOSSyncError("stale-session") }
        var message: [String: Any] = ["requestId": UUID().uuidString.lowercased(), "method": method]
        if let request {
            guard request.count <= 8 * 1024 * 1024 else { throw IOSSyncError("batch-too-large") }
            message["request"] = try JSONSerialization.jsonObject(with: request)
        }
        let mutation = method == "commitReceive" || method == "acknowledgeOutbox"
        if mutation { try mutationFence.submit() }
        return try await withCheckedThrowingContinuation { continuation in
            let pending = PendingStoreReply(continuation)
            DispatchQueue.main.asyncAfter(deadline: .now() + 30) {
                pending.finish(.failure(IOSSyncError(mutation ? "reopen-required" : "storage-failure", targetCommitDurable: mutation)))
            }
            webView.callAsyncJavaScript("return await window.__kairoIOSStoreDispatch(registrationId, request)",
                arguments: ["registrationId": registrationId, "request": message], in: nil, in: .page) { [weak self] result in
                guard let self, self.isCurrent else {
                    pending.finish(.failure(IOSSyncError(mutation ? "reopen-required" : "stale-session", targetCommitDurable: mutation))); return
                }
                do {
                    let value = try result.get()
                    guard JSONSerialization.isValidJSONObject(value) else { throw IOSSyncError("invalid-response") }
                    let bytes = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .withoutEscapingSlashes])
                    guard bytes.count <= 32 * 1024 * 1024 else { throw IOSSyncError("batch-too-large") }
                    pending.finish(.success(bytes))
                } catch { pending.finish(.failure(IOSSyncError(mutation ? "reopen-required" : "invalid-response", targetCommitDurable: mutation))) }
            }
        }
    }
}

@MainActor
private final class PendingStoreReply {
    private var continuation: CheckedContinuation<Data, Error>?
    init(_ continuation: CheckedContinuation<Data, Error>) { self.continuation = continuation }
    func finish(_ result: Result<Data, Error>) { let current = continuation; continuation = nil; current?.resume(with: result) }
}
