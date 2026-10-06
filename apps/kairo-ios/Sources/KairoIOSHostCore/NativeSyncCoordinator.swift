import Foundation
import KairoAppleSync

public struct IOSSyncBinding: Sendable, Equatable {
    public let accountId: String
    public let learnerId: String
    public let sessionId: String
    public var json: [String: String] { ["accountId": accountId, "learnerId": learnerId, "sessionId": sessionId] }
    public var scope: JournalScope { try! JournalScope(accountID: accountId, learnerID: learnerId) }
    public init(_ value: [String: String]) throws {
        guard Set(value.keys) == ["accountId", "learnerId", "sessionId"],
              value.values.allSatisfy({ !$0.isEmpty && $0.utf8.count <= 256 && $0.unicodeScalars.allSatisfy { $0.value >= 32 } }) else { throw IOSSyncError("binding-mismatch") }
        accountId = value["accountId"]!; learnerId = value["learnerId"]!; sessionId = value["sessionId"]!
    }
    public static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.accountId.utf8.elementsEqual(rhs.accountId.utf8) && lhs.learnerId.utf8.elementsEqual(rhs.learnerId.utf8) && lhs.sessionId.utf8.elementsEqual(rhs.sessionId.utf8)
    }
}

public struct IOSSyncError: Error, Sendable {
    public let code: String
    public let targetCommitDurable: Bool
    public init(_ code: String, targetCommitDurable: Bool = false) { self.code = code; self.targetCommitDurable = targetCommitDurable }
}

/// Data-only store boundary. The implementation fences exact WK main-frame,
/// registration and document ownership before dispatch and before accepting a
/// reply. These requests invoke the existing JS planner; Swift never merges.
@MainActor
public protocol IOSSyncStore: AnyObject {
    var isCurrent: Bool { get }
    func request(method: String, request: Data?) async throws -> Data
    func confirmMutation()
}
public extension IOSSyncStore { func confirmMutation() {} }

struct IOSPullPage: Sendable { let envelopes: [JournalEnvelope]; let next: String; let hasMore: Bool }
@MainActor
protocol IOSJournalTransport: AnyObject {
    var isCurrent: Bool { get }
    var scope: JournalScope { get }
    var channelId: String { get }
    func push(_ envelopes: [JournalEnvelope]) async throws -> [OperationReference]
    func pull(checkpoint: String?) async throws -> IOSPullPage
}

@MainActor
private final class CapturedNativeTransport: IOSJournalTransport {
    let connection: NativeCloudSyncConnection
    init(_ connection: NativeCloudSyncConnection) { self.connection = connection }
    var isCurrent: Bool { connection.isCurrent }
    var scope: JournalScope { connection.descriptor.scope }
    var channelId: String { connection.descriptor.channelId }
    func push(_ envelopes: [JournalEnvelope]) async throws -> [OperationReference] { try await connection.push(envelopes).accepted }
    func pull(checkpoint: String?) async throws -> IOSPullPage {
        let page = try await connection.pull(checkpoint: checkpoint, limit: 100)
        return IOSPullPage(envelopes: page.envelopes, next: page.nextCheckpoint, hasMore: page.hasMore)
    }
}

private struct NativeSnapshot {
    let revision: Int
    let outboxCount: Int
    let pendingCausal: Int
    let checkpoints: [String: String]
    let envelopes: [JournalEnvelope]
}

/// One bounded foreground push/ack/pull/atomic-receive cycle. Native connection
/// authority is checked synchronously here before and after every awaited step.
/// There is no timer, background sync, local merge, or uncertain-commit retry.
@MainActor
public final class IOSNativeSyncCoordinator {
    private let transport: any IOSJournalTransport
    private let store: any IOSSyncStore
    private let binding: IOSSyncBinding
    private var running = false
    private var cancelled = false

    public convenience init(connection: NativeCloudSyncConnection, binding: IOSSyncBinding, store: any IOSSyncStore) throws {
        try self.init(transport: CapturedNativeTransport(connection), binding: binding, store: store)
    }
    // Test injection is module-internal; production construction requires the
    // unforgeable SDK/bootstrap connection from KairoAppleSync.
    init(transport: any IOSJournalTransport, binding: IOSSyncBinding, store: any IOSSyncStore) throws {
        guard transport.isCurrent, transport.scope == binding.scope else { throw IOSSyncError("session-required") }
        self.transport = transport; self.binding = binding; self.store = store
    }
    public func cancel() { cancelled = true }

    private func guardCurrent() throws {
        guard !cancelled, store.isCurrent, transport.isCurrent, transport.scope == binding.scope else { throw IOSSyncError("stale-session") }
    }
    private func json(_ value: Any) throws -> Data { try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .withoutEscapingSlashes]) }
    private func object(_ data: Data, max: Int = 32 * 1024 * 1024) throws -> [String: Any] {
        guard data.count <= max, let row = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw IOSSyncError("invalid-response") }
        return row
    }
    private func integer(_ value: Any?) throws -> Int {
        guard let value = value as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID(),
              value.doubleValue >= 0, value.doubleValue <= 9_007_199_254_740_991,
              value.doubleValue.rounded(.towardZero) == value.doubleValue else { throw IOSSyncError("invalid-response") }
        return value.intValue
    }
    private func storeCall(_ method: String, _ input: [String: Any]? = nil) async throws -> [String: Any] {
        try guardCurrent()
        let request = try input.map(json)
        let mutation = method == "commitReceive" || method == "acknowledgeOutbox"
        let bytes: Data
        do { bytes = try await store.request(method: method, request: request) }
        catch {
            if let known = error as? IOSSyncError { throw known }
            throw IOSSyncError(mutation ? "reopen-required" : "storage-failure", targetCommitDurable: mutation)
        }
        do { try guardCurrent() }
        catch { throw IOSSyncError(mutation ? "reopen-required" : "stale-session", targetCommitDurable: mutation) }
        let row: [String: Any]
        do { row = try object(bytes) }
        catch { throw IOSSyncError(mutation ? "reopen-required" : "invalid-response", targetCommitDurable: mutation) }
        guard let ok = row["ok"] as? NSNumber, CFGetTypeID(ok) == CFBooleanGetTypeID(),
              Set(row.keys) == (ok.boolValue ? ["ok", "value"] : ["ok", "error"]) else {
            throw IOSSyncError(mutation ? "reopen-required" : "invalid-response", targetCommitDurable: mutation)
        }
        if !ok.boolValue {
            guard let detail = row["error"] as? [String: Any], let raw = detail["code"] as? String,
                  Set(detail.keys) == (detail["targetCommitDurable"] == nil ? ["code"] : ["code", "targetCommitDurable"]) else {
                throw IOSSyncError(mutation ? "reopen-required" : "invalid-response", targetCommitDurable: mutation)
            }
            if let durability = detail["targetCommitDurable"] {
                guard let flag = durability as? NSNumber, CFGetTypeID(flag) == CFBooleanGetTypeID() else {
                    throw IOSSyncError(mutation ? "reopen-required" : "invalid-response", targetCommitDurable: mutation)
                }
            }
            let durable = detail["targetCommitDurable"] as? Bool == true
            let code = ["stale-revision", "checkpoint-conflict", "closed", "reopen-required", "recovery-required", "writer-required", "session-changed", "binding-mismatch", "batch-too-large", "busy"].contains(raw) ? raw : "storage-failure"
            let uncertain = durable || (mutation && ["storage-failure", "reopen-required", "recovery-required"].contains(code))
            if mutation && !uncertain { store.confirmMutation() }
            throw IOSSyncError(uncertain ? "reopen-required" : code, targetCommitDurable: uncertain)
        }
        guard let value = row["value"] as? [String: Any] else { throw IOSSyncError(mutation ? "reopen-required" : "invalid-response", targetCommitDurable: mutation) }
        return value
    }

    private func snapshot(preparing: Bool = false) async throws -> NativeSnapshot {
        let value = try await storeCall(preparing ? "prepareNativeSnapshot" : "snapshot")
        guard let row = preparing ? value["snapshot"] as? [String: Any] : value,
              let policy = row["policy"] as? [String: Any], let offeredBinding = policy["binding"] as? [String: String],
              try IOSSyncBinding(offeredBinding) == binding, let documents = row["documents"] as? [Any], documents.isEmpty,
              let outbox = row["outbox"] as? [[String: Any]], let replica = row["replica"] as? [String: Any],
              let pending = replica["pending"] as? [Any], let checkpoints = row["checkpoints"] as? [[String: Any]],
              outbox.count <= 100_000, checkpoints.count <= 100_000 else { throw IOSSyncError("invalid-response") }
        var marks: [String: String] = [:]
        for checkpoint in checkpoints {
            guard let channel = checkpoint["channelId"] as? String, let token = checkpoint["value"] as? String,
                  channel.utf8.count <= 1024, token.utf8.count <= 8192, marks[channel] == nil else { throw IOSSyncError("invalid-response") }
            marks[channel] = token
        }
        var envelopes: [JournalEnvelope] = []
        if preparing {
            guard let rows = value["envelopes"] as? [[String: Any]], rows.count <= 100 else { throw IOSSyncError("invalid-response") }
            var ordered: [(id: String, sequence: Int)] = []
            for operation in outbox {
                guard let id = operation["opId"] as? String, let actor = operation["actor"] as? [String: Any] else { throw IOSSyncError("invalid-response") }
                let sequence = try integer(actor["sequence"])
                ordered.append((id: id, sequence: sequence))
            }
            ordered.sort { $0.sequence == $1.sequence ? $0.id < $1.id : $0.sequence < $1.sequence }
            var count = 0; var seen = Set<OperationReference>()
            for (index, row) in rows.enumerated() {
                guard let reference = row["reference"] as? [String: String], Set(reference.keys) == ["opId", "sha256"],
                      let opId = reference["opId"], let sha = reference["sha256"], let text = row["canonicalText"] as? String,
                      index < ordered.count, ordered[index].id == opId else { throw IOSSyncError("invalid-response") }
                let ref = try OperationReference(opId: opId, sha256: sha)
                guard seen.insert(ref).inserted else { throw IOSSyncError("invalid-response") }
                let envelope = try JournalEnvelope(reference: ref, bytes: Data(text.utf8), scope: binding.scope)
                count += envelope.bytes.count
                guard count <= 1024 * 1024 else { throw IOSSyncError("batch-too-large") }
                envelopes.append(envelope)
            }
            guard outbox.isEmpty || !envelopes.isEmpty else { throw IOSSyncError("batch-too-large") }
        }
        return NativeSnapshot(revision: try integer(row["revision"]), outboxCount: outbox.count, pendingCausal: pending.count, checkpoints: marks, envelopes: envelopes)
    }

    private func refs(_ references: [OperationReference]) -> [[String: String]] { references.map { ["opId": $0.opId, "sha256": $0.sha256] } }
    private func identity(_ kind: String, _ value: Any) throws -> String { "ios-sync-\(kind):" + AssetCatalog.hash(try json(value)) }
    private func validateReceipt(_ receipt: [String: Any], id: String, revision: Int) throws -> [OperationReference] {
        guard Set(receipt.keys) == ["changeId", "committedRevision", "operations", "outcome", "runtimeLabel"],
              ["browser", "native", "ci-substitute"].contains(receipt["runtimeLabel"] as? String ?? ""),
              receipt["changeId"] as? String == id, ["committed", "duplicate"].contains(receipt["outcome"] as? String ?? ""),
              let rows = receipt["operations"] as? [[String: String]], rows.count <= 100_000 else { throw IOSSyncError("reopen-required", targetCommitDurable: true) }
        guard let committed = try? integer(receipt["committedRevision"]) else { throw IOSSyncError("reopen-required", targetCommitDurable: true) }
        guard receipt["outcome"] as? String == "duplicate" ? committed <= revision : committed == revision + 1 else { throw IOSSyncError("reopen-required", targetCommitDurable: true) }
        return try rows.map { row in
            guard Set(row.keys) == ["opId", "sha256"], let id = row["opId"], let hash = row["sha256"] else { throw IOSSyncError("reopen-required", targetCommitDurable: true) }
            guard let reference = try? OperationReference(opId: id, sha256: hash) else { throw IOSSyncError("reopen-required", targetCommitDurable: true) }
            return reference
        }
    }

    public func syncOnce() async throws -> Data {
        guard !running else { throw IOSSyncError("busy") }
        try guardCurrent(); running = true
        defer { running = false }
        let initial = try await snapshot(preparing: true)
        var accepted: [OperationReference] = []
        if !initial.envelopes.isEmpty {
            try guardCurrent(); accepted = try await transport.push(initial.envelopes); try guardCurrent()
            let offered = Set(initial.envelopes.map(\.reference))
            guard accepted.count <= offered.count, Set(accepted).count == accepted.count, accepted.allSatisfy(offered.contains) else { throw IOSSyncError("invalid-response") }
            accepted.sort { $0.opId < $1.opId }
            if !accepted.isEmpty {
                let fresh = try await snapshot()
                let id = try identity("ack", ["binding": binding.json, "channelId": transport.channelId, "accepted": refs(accepted)])
                let receipt = try await storeCall("acknowledgeOutbox", ["acknowledgementId": id, "binding": binding.json, "expectedRevision": fresh.revision, "operations": refs(accepted)])
                let confirmed = try validateReceipt(receipt, id: id, revision: fresh.revision)
                guard Set(confirmed) == Set(accepted), confirmed.count == accepted.count else { throw IOSSyncError("reopen-required", targetCommitDurable: true) }
                store.confirmMutation()
            }
        }
        let beforePull = try await snapshot()
        let checkpoint = beforePull.checkpoints[transport.channelId]
        try guardCurrent(); let page = try await transport.pull(checkpoint: checkpoint); try guardCurrent()
        guard page.envelopes.count <= 100, !page.next.isEmpty, page.next.utf8.count <= 8192,
              page.envelopes.reduce(0, { $0 + $1.bytes.count }) <= 1024 * 1024 else { throw IOSSyncError("invalid-response") }
        var operations: [[String: Any]] = []
        for envelope in page.envelopes {
            _ = try JournalEnvelope(reference: envelope.reference, bytes: envelope.bytes, scope: binding.scope)
            operations.append(try object(envelope.bytes, max: 256 * 1024))
        }
        var received: [OperationReference] = []
        if page.next == checkpoint {
            guard operations.isEmpty, !page.hasMore else { throw IOSSyncError("invalid-response") }
        } else {
            let fresh = try await snapshot()
            guard fresh.checkpoints[transport.channelId] == checkpoint else { throw IOSSyncError("checkpoint-conflict") }
            let id = try identity("receive", ["binding": binding.json, "channelId": transport.channelId,
                "previous": checkpoint as Any? ?? NSNull(), "next": page.next, "references": refs(page.envelopes.map(\.reference))])
            let receipt = try await storeCall("commitReceive", ["deliveryId": id, "expectedRevision": fresh.revision,
                "delivery": ["binding": binding.json, "operations": operations],
                "checkpoint": ["channelId": transport.channelId, "expected": checkpoint as Any? ?? NSNull(), "next": page.next]])
            received = try validateReceipt(receipt, id: id, revision: fresh.revision)
            let pageReferences = page.envelopes.map(\.reference)
            guard Set(pageReferences).count == pageReferences.count, Set(received) == Set(pageReferences),
                  received.count == pageReferences.count else { throw IOSSyncError("reopen-required", targetCommitDurable: true) }
            store.confirmMutation()
        }
        let final = try await snapshot()
        return try json(["offered": refs(initial.envelopes.map(\.reference)), "acknowledged": refs(accepted), "received": refs(received),
            "checkpoint": final.checkpoints[transport.channelId] as Any? ?? NSNull(), "pendingOutbox": final.outboxCount,
            "pendingCausal": final.pendingCausal, "hasMore": page.hasMore || final.outboxCount > 0])
    }
}
