import CloudKit
import Foundation

/// This lock protects only a monotonically invalidated lease epoch. The
/// notification may arrive on any queue, before an actor can process a Task.
final class SessionFence: @unchecked Sendable {
    private let lock = NSLock()
    private var epoch: UInt64 = 0
    func current() -> UInt64 { lock.withLock { epoch } }
    func invalidate() { lock.withLock { epoch &+= 1 } }
}
private final class AccountChangeObservation: @unchecked Sendable {
    private let token: any NSObjectProtocol
    init(fence: SessionFence) {
        token = NotificationCenter.default.addObserver(forName: .CKAccountChanged, object: nil, queue: nil) { _ in
            fence.invalidate()
        }
    }
    deinit { NotificationCenter.default.removeObserver(token) }
}

struct CursorPayload: Codable, Equatable {
    let version: Int
    let accountFingerprint: String
    let scope: JournalScope
    let channelID: String
    let token: Data
}
private struct CursorWrapper: Codable {
    let payload: CursorPayload
    let sha256: String
}
struct JournalCursorCodec {
    static func encode(token: Data, session: JournalSession, maxBytes: Int) throws -> String {
        guard !token.isEmpty, token.count <= maxBytes else { throw JournalError.invalidCursor }
        let payload = CursorPayload(version: 1, accountFingerprint: session.account.fingerprint,
            scope: session.scope, channelID: session.channelID, token: token)
        let text = try encoded(CursorWrapper(payload: payload, sha256: digest(try encoded(payload)))).base64EncodedString()
        guard text.utf8.count <= maxBytes else { throw JournalError.limitsExceeded }
        return text
    }
    static func decode(_ text: String, session: JournalSession, maxBytes: Int) throws -> Data {
        guard !text.isEmpty, text.utf8.count <= maxBytes, let data = Data(base64Encoded: text),
              data.base64EncodedString() == text else { throw JournalError.invalidCursor }
        do {
            guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  Set(root.keys) == ["payload", "sha256"],
                  let payload = root["payload"] as? [String: Any],
                  Set(payload.keys) == ["version", "accountFingerprint", "scope", "channelID", "token"],
                  let scope = payload["scope"] as? [String: Any], Set(scope.keys) == ["accountID", "learnerID"] else {
                throw JournalError.invalidCursor
            }
            let wrapper = try JSONDecoder().decode(CursorWrapper.self, from: data)
            let value = wrapper.payload
            guard value.version == 1, value.accountFingerprint == session.account.fingerprint,
                  value.scope == session.scope, value.channelID == session.channelID,
                  !value.token.isEmpty, digest(try encoded(value)) == wrapper.sha256 else { throw JournalError.invalidCursor }
            return value.token
        } catch { throw JournalError.invalidCursor }
    }
}

/// Native foreground journal transport. A completed result never mutates a
/// caller checkpoint; TypeScript must validate/admit and commit the whole page.
public actor ForegroundJournalTransport {
    public typealias ScopeAuthorizer = @Sendable (CloudAccountIdentity, JournalScope) async throws -> Bool
    private let backend: any JournalBackend
    private let authorize: ScopeAuthorizer
    private let limits: JournalLimits
    private let fence: SessionFence
    private let observation: AccountChangeObservation?
    private var active: JournalSession?
    private var workID: UUID?

    /// Constructs the SDK adapter only. openSession performs explicit account
    /// calls when the host is entitled/configured and the learner opens sync.
    public init(containerIdentifier: String, limits: JournalLimits = try! JournalLimits(),
                authorize: @escaping ScopeAuthorizer) throws {
        guard validID(containerIdentifier) else { throw JournalError.invalidInput }
        let fence = SessionFence()
        self.backend = CloudKitBackend(containerIdentifier: containerIdentifier)
        self.authorize = authorize; self.limits = limits; self.fence = fence
        self.observation = AccountChangeObservation(fence: fence)
    }
    init(backend: any JournalBackend, limits: JournalLimits = try! JournalLimits(),
         fence: SessionFence = SessionFence(), authorize: @escaping ScopeAuthorizer) {
        self.backend = backend; self.authorize = authorize; self.limits = limits
        self.fence = fence; self.observation = nil
    }

    public func invalidateSession() { fence.invalidate(); active = nil }

    public func openSession(for scope: JournalScope) async throws -> JournalSession {
        invalidateSession()
        let epoch = fence.current()
        do {
            try Task.checkCancellation()
            guard validID(scope.accountID), validID(scope.learnerID) else { throw JournalError.invalidInput }
            let account = try await backend.accountIdentity()
            guard try await authorize(account, scope) else { throw JournalError.unauthorizedScope }
            try Task.checkCancellation()
            guard fence.current() == epoch else { throw JournalError.staleSession }
            let channel = "ck-private-v1:" + digest(try encoded([account.containerIdentifier, account.fingerprint, scope.accountID, scope.learnerID]))
            let session = JournalSession(id: UUID(), scope: scope, account: account, channelID: channel, epoch: epoch)
            active = session
            return session
        } catch { throw CloudKitBackend.failure(error) }
    }

    private func check(_ session: JournalSession) throws {
        try Task.checkCancellation()
        guard active == session, fence.current() == session.epoch else { throw JournalError.staleSession }
    }
    private func validate(_ session: JournalSession) async throws {
        try check(session)
        let current = try await backend.accountIdentity()
        try check(session)
        guard current == session.account else { invalidateSession(); throw JournalError.staleSession }
        guard try await authorize(current, session.scope) else { invalidateSession(); throw JournalError.unauthorizedScope }
        try check(session)
    }
    private func begin(_ session: JournalSession) throws -> UUID {
        try check(session)
        guard workID == nil else { throw JournalError.busy }
        let id = UUID(); workID = id; return id
    }
    private func finish(_ id: UUID) { if workID == id { workID = nil } }
    private func zoneName(_ session: JournalSession) -> String { "kairo-v1-" + String(session.channelID.suffix(64)) }

    public func push(_ envelopes: [JournalEnvelope], session: JournalSession) async throws -> JournalPushResult {
        let id: UUID
        do { id = try begin(session) } catch { throw CloudKitBackend.failure(error) }
        defer { finish(id) }
        do {
            guard !envelopes.isEmpty, envelopes.count <= limits.maxOperations,
                  Set(envelopes.map { $0.reference.opId }).count == envelopes.count else { throw JournalError.invalidInput }
            var byteCount = 0
            for envelope in envelopes {
                _ = try JournalEnvelope(reference: envelope.reference, bytes: envelope.bytes,
                    scope: session.scope, maxBytes: limits.maxEnvelopeBytes)
                byteCount += envelope.bytes.count
                guard byteCount <= limits.maxBatchBytes else { throw JournalError.limitsExceeded }
            }
            try await validate(session)
            let response = try await backend.save(envelopes, scope: session.scope, zoneName: zoneName(session), limits: limits)
            try await validate(session)
            let originals = Dictionary(uniqueKeysWithValues: envelopes.map { ($0.reference.opId, $0) })
            guard Set(response.keys).isSubset(of: Set(originals.keys)) else { throw JournalError.invalidResponse }
            var accepted: [OperationReference] = []
            var failures: [String: JournalError] = [:]
            for original in envelopes {
                switch response[original.reference.opId] {
                case .saved(let value), .existing(let value):
                    guard value == original else { failures[original.reference.opId] = .conflictingOperation; continue }
                    accepted.append(original.reference)
                case .failed(let error): failures[original.reference.opId] = error
                case nil: failures[original.reference.opId] = .invalidResponse
                }
            }
            try check(session)
            return JournalPushResult(accepted: accepted, failures: failures)
        } catch { throw CloudKitBackend.failure(error) }
    }

    public func pull(checkpoint: String?, limit: Int, session: JournalSession) async throws -> JournalPullResult {
        let id: UUID
        do { id = try begin(session) } catch { throw CloudKitBackend.failure(error) }
        defer { finish(id) }
        do {
            guard (1...limits.maxOperations).contains(limit) else { throw JournalError.invalidInput }
            let prior = try checkpoint.map { try JournalCursorCodec.decode($0, session: session, maxBytes: limits.maxCursorBytes) }
            try await validate(session)
            let response = try await backend.changes(since: prior, scope: session.scope, zoneName: zoneName(session), limit: limit, limits: limits)
            try await validate(session)
            guard response.deletionIDs.isEmpty else { throw JournalError.physicalDeletion }
            guard response.records.count <= limit else { throw JournalError.limitsExceeded }
            var envelopes: [JournalEnvelope] = []
            var byteCount = 0
            for (opID, result) in response.records.sorted(by: { $0.key < $1.key }) {
                let envelope = try result.get()
                guard envelope.reference.opId == opID else { throw JournalError.invalidResponse }
                _ = try JournalEnvelope(reference: envelope.reference, bytes: envelope.bytes,
                    scope: session.scope, maxBytes: limits.maxEnvelopeBytes)
                byteCount += envelope.bytes.count
                guard byteCount <= limits.maxBatchBytes else { throw JournalError.limitsExceeded }
                envelopes.append(envelope)
            }
            if response.token == prior && (!envelopes.isEmpty || response.hasMore) { throw JournalError.invalidResponse }
            let cursor = try JournalCursorCodec.encode(token: response.token, session: session, maxBytes: limits.maxCursorBytes)
            try check(session)
            return JournalPullResult(envelopes: envelopes, nextCheckpoint: cursor, hasMore: response.hasMore)
        } catch { throw CloudKitBackend.failure(error) }
    }
}
