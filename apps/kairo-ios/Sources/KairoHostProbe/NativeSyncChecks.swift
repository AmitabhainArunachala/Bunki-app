#if HOST_CHECKS
import Foundation
import KairoAppleSync
@testable import KairoIOSHostCore

/// Module-internal fixture transport tests coordinator ordering and revocation.
/// These fixtures are not an authenticated CloudKit account or a merge test.
@MainActor
enum NativeSyncChecks {
    private enum Failure: Error { case failed }
    private static func bytes(_ value: Any) throws -> Data { try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .withoutEscapingSlashes]) }
    private static func check(_ condition: Bool) throws { if !condition { throw Failure.failed } }
    private static let binding = try! IOSSyncBinding(["accountId": "fixture-account", "learnerId": "fixture-learner", "sessionId": "fixture-session"])

    private static func envelope(_ character: String, sequence: Int = 1, scope: JournalScope = binding.scope) throws -> JournalEnvelope {
        let id = String(repeating: character, count: 64)
        // This minimal native envelope is deliberately only a transport fixture.
        // Browser sync-core integration validates complete operation semantics.
        let data = try bytes(["format": "kairo-sync-operation", "v": 1, "opId": id,
            "scope": ["accountId": scope.accountID, "learnerId": scope.learnerID], "actor": ["sequence": sequence]])
        return try JournalEnvelope(reference: OperationReference(opId: id, sha256: AssetCatalog.hash(data)), bytes: data, scope: scope)
    }

    @MainActor
    private final class Store: IOSSyncStore {
        var isCurrent = true
        var revision = 0
        var outbox: [JournalEnvelope]
        var checkpoint: String?
        var calls: [String] = []
        var failReceiveDurably = false
        var revokeOnAck = false
        var malformedReceipt = false
        var badEnvelope = false
        var numericPrepare = false
        var mutationReply: String?
        var receivedReferences: String?
        var failAckDefinitely = false
        let mutationFence = IOSStoreMutationFence()
        init(outbox: [JournalEnvelope]) { self.outbox = outbox }
        func confirmMutation() { mutationFence.confirm() }
        func reply(_ value: [String: Any]) throws -> Data {
            var root: [String: Any] = ["ok": true, "value": value]
            if mutationReply == "numeric" { root["ok"] = 1 }
            if mutationReply == "contradictory" { root["error"] = ["code": "stale-revision", "targetCommitDurable": true] }
            return try bytes(root)
        }
        func snapshot() throws -> [String: Any] {
            ["policy": ["binding": binding.json], "revision": revision, "documents": [],
             "replica": ["pending": []], "outbox": try outbox.map { try JSONSerialization.jsonObject(with: $0.bytes) },
             "checkpoints": checkpoint.map { [["channelId": "fixture-channel", "value": $0]] } ?? []]
        }
        func request(method: String, request: Data?) async throws -> Data {
            calls.append(method)
            if method == "snapshot" { return try bytes(["ok": true, "value": snapshot()]) }
            if method == "prepareNativeSnapshot" {
                let envelopes: [[String: Any]] = outbox.map { ["reference": ["opId": $0.reference.opId, "sha256": $0.reference.sha256],
                    "canonicalText": badEnvelope ? "tampered" : String(decoding: $0.bytes, as: UTF8.self)] }
                return try bytes(["ok": numericPrepare ? 1 : true as Any, "value": ["snapshot": snapshot(), "envelopes": envelopes]])
            }
            guard let request, let row = try JSONSerialization.jsonObject(with: request) as? [String: Any],
                  row["expectedRevision"] as? Int == revision else { throw Failure.failed }
            try mutationFence.submit()
            if method == "acknowledgeOutbox" && failAckDefinitely { return try bytes(["ok": false, "error": ["code": "stale-revision"]]) }
            revision += 1
            if method == "acknowledgeOutbox" {
                outbox = []
                if revokeOnAck { isCurrent = false }
                return try reply(["changeId": row["acknowledgementId"]!,
                    "committedRevision": malformedReceipt ? "invalid" : revision as Any,
                    "operations": row["operations"]!, "outcome": "committed", "runtimeLabel": "browser"])
            }
            if method == "commitReceive" {
                let mark = row["checkpoint"] as! [String: Any]
                try check((mark["expected"] as? String) == checkpoint)
                checkpoint = mark["next"] as? String
                if failReceiveDurably { return try bytes(["ok": false, "error": ["code": "stale-revision", "targetCommitDurable": true]]) }
                let delivery = row["delivery"] as! [String: Any]
                let operations = delivery["operations"] as! [[String: Any]]
                var references = try operations.map { operation in ["opId": operation["opId"] as! String, "sha256": AssetCatalog.hash(try bytes(operation))] }
                if receivedReferences == "missing" { references = [] }
                if receivedReferences == "duplicate" { references += references }
                if receivedReferences == "foreign" { let foreign = try envelope("f").reference; references = [["opId": foreign.opId, "sha256": foreign.sha256]] }
                return try reply(["changeId": row["deliveryId"]!, "committedRevision": revision,
                    "operations": references, "outcome": "committed", "runtimeLabel": "browser"])
            }
            throw Failure.failed
        }
    }

    @MainActor
    private final class Transport: IOSJournalTransport {
        var isCurrent = true
        var scope = binding.scope
        var channelId = "fixture-channel"
        var offered: [JournalEnvelope] = []
        var page: [JournalEnvelope] = []
        var next = "fixture-cursor"
        var pushCalls = 0
        var pullCalls = 0
        var revokeOnPush = false
        var foreignAck = false
        var onPull: (() -> Void)?
        var onPush: (() -> Void)?
        func push(_ envelopes: [JournalEnvelope]) async throws -> [OperationReference] {
            pushCalls += 1; offered = envelopes; onPush?()
            if revokeOnPush { isCurrent = false }
            if foreignAck { return [try envelope("f").reference] }
            return envelopes.map(\.reference)
        }
        func pull(checkpoint: String?) async throws -> IOSPullPage {
            pullCalls += 1; onPull?()
            return IOSPullPage(envelopes: page, next: next, hasMore: false)
        }
    }

    static func run() async -> [String: Any] {
        var passed: [String] = []
        var name = "setup"
        do {
            func fixture() throws -> (Store, Transport, IOSNativeSyncCoordinator) {
                let store = Store(outbox: [try envelope("a")]); let transport = Transport()
                transport.page = [try envelope("b")]
                return (store, transport, try IOSNativeSyncCoordinator(transport: transport, binding: binding, store: store))
            }
            name = "push-fresh-ack-pull-atomic-receive"
            do {
                let (store, transport, coordinator) = try fixture()
                let result = try JSONSerialization.jsonObject(with: await coordinator.syncOnce()) as! [String: Any]
                try check(store.calls == ["prepareNativeSnapshot", "snapshot", "acknowledgeOutbox", "snapshot", "snapshot", "commitReceive", "snapshot"])
                try check(transport.pushCalls == 1 && transport.pullCalls == 1 && store.checkpoint == "fixture-cursor" && result["pendingOutbox"] as? Int == 0)
                try check(!store.mutationFence.pending && !store.mutationFence.requiresReopen)
            }; passed.append(name)
            name = "revoked-push-cannot-acknowledge"
            do {
                let (store, transport, coordinator) = try fixture(); transport.revokeOnPush = true
                do { _ = try await coordinator.syncOnce(); throw Failure.failed }
                catch let error as IOSSyncError { try check(error.code == "stale-session") }
                try check(!store.calls.contains("acknowledgeOutbox") && transport.pullCalls == 0)
            }; passed.append(name)
            name = "foreign-acknowledgement-refused"
            do {
                let (store, transport, coordinator) = try fixture(); transport.foreignAck = true
                do { _ = try await coordinator.syncOnce(); throw Failure.failed }
                catch let error as IOSSyncError { try check(error.code == "invalid-response") }
                try check(!store.calls.contains("acknowledgeOutbox"))
            }; passed.append(name)
            name = "uncertain-ack-requires-reopen"
            do {
                let (store, transport, coordinator) = try fixture(); store.revokeOnAck = true
                do { _ = try await coordinator.syncOnce(); throw Failure.failed }
                catch let error as IOSSyncError { try check(error.code == "reopen-required" && error.targetCommitDurable) }
                try check(store.calls.filter { $0 == "acknowledgeOutbox" }.count == 1 && transport.pullCalls == 0)
            }; passed.append(name)
            name = "durable-receive-is-never-stale-retried"
            do {
                let (store, _, coordinator) = try fixture(); store.failReceiveDurably = true
                do { _ = try await coordinator.syncOnce(); throw Failure.failed }
                catch let error as IOSSyncError { try check(error.code == "reopen-required" && error.targetCommitDurable) }
                try check(store.calls.filter { $0 == "commitReceive" }.count == 1 && store.checkpoint == "fixture-cursor")
            }; passed.append(name)
            name = "changed-checkpoint-prevents-receive"
            do {
                let (store, transport, coordinator) = try fixture(); transport.onPull = { store.checkpoint = "another-cycle" }
                do { _ = try await coordinator.syncOnce(); throw Failure.failed }
                catch let error as IOSSyncError { try check(error.code == "checkpoint-conflict") }
                try check(!store.calls.contains("commitReceive"))
            }; passed.append(name)
            name = "foreign-scope-pull-refused"
            do {
                let (store, transport, coordinator) = try fixture()
                transport.page = [try envelope("c", scope: JournalScope(accountID: "foreign", learnerID: "foreign"))]
                do { _ = try await coordinator.syncOnce(); throw Failure.failed }
                catch let error as JournalError { try check(error == .wrongScope) }
                try check(!store.calls.contains("commitReceive"))
            }; passed.append(name)
            name = "canonical-envelope-mismatch-refused"
            do {
                let (store, transport, coordinator) = try fixture(); store.badEnvelope = true
                do { _ = try await coordinator.syncOnce(); throw Failure.failed }
                catch is JournalError { }
                try check(transport.pushCalls == 0)
            }; passed.append(name)
            name = "synchronous-cancel-after-push"
            do {
                let (store, transport, coordinator) = try fixture(); transport.onPush = { coordinator.cancel() }
                do { _ = try await coordinator.syncOnce(); throw Failure.failed }
                catch let error as IOSSyncError { try check(error.code == "stale-session") }
                try check(!store.calls.contains("acknowledgeOutbox"))
            }; passed.append(name)
            name = "malformed-commit-receipt-requires-reopen"
            do {
                let (store, _, coordinator) = try fixture(); store.malformedReceipt = true
                do { _ = try await coordinator.syncOnce(); throw Failure.failed }
                catch let error as IOSSyncError { try check(error.code == "reopen-required" && error.targetCommitDurable) }
                try check(store.calls.filter { $0 == "acknowledgeOutbox" }.count == 1)
            }; passed.append(name)
            name = "numeric-success-flag-is-not-boolean"
            do {
                let (store, transport, coordinator) = try fixture(); store.numericPrepare = true
                do { _ = try await coordinator.syncOnce(); throw Failure.failed }
                catch let error as IOSSyncError { try check(error.code == "invalid-response" && !error.targetCommitDurable) }
                try check(store.revision == 0 && transport.pushCalls == 0)
            }; passed.append(name)
            for mode in ["numeric", "contradictory"] {
                name = "\(mode)-mutation-reply-requires-reopen"
                let (store, transport, coordinator) = try fixture(); store.mutationReply = mode
                do { _ = try await coordinator.syncOnce(); throw Failure.failed }
                catch let error as IOSSyncError { try check(error.code == "reopen-required" && error.targetCommitDurable) }
                try check(store.mutationFence.pending && transport.pullCalls == 0)
                passed.append(name)
            }
            for mode in ["missing", "foreign", "duplicate"] {
                name = "\(mode)-receive-references-require-reopen"
                let (store, _, coordinator) = try fixture(); store.receivedReferences = mode
                do { _ = try await coordinator.syncOnce(); throw Failure.failed }
                catch let error as IOSSyncError { try check(error.code == "reopen-required" && error.targetCommitDurable) }
                try check(store.mutationFence.pending && store.calls.filter { $0 == "commitReceive" }.count == 1)
                passed.append(name)
            }
            name = "definite-refusal-settles-pending-mutation"
            do {
                let (store, _, coordinator) = try fixture(); store.failAckDefinitely = true
                do { _ = try await coordinator.syncOnce(); throw Failure.failed }
                catch let error as IOSSyncError { try check(error.code == "stale-revision" && !error.targetCommitDurable) }
                store.mutationFence.invalidate()
                try check(!store.mutationFence.pending && !store.mutationFence.requiresReopen && store.revision == 0)
            }; passed.append(name)
            name = "document-fence-survives-late-confirmation"
            do {
                let fence = IOSStoreMutationFence()
                try fence.submit(); fence.invalidate(); fence.confirm()
                try check(fence.requiresReopen && !fence.pending)
                do { try fence.submit(); throw Failure.failed }
                catch let error as IOSSyncError { try check(error.code == "reopen-required") }
                // Same-document registrations retain the same object. A new
                // document reopens IndexedDB before owning a fresh fence.
                let reopened = IOSStoreMutationFence()
                try reopened.submit(); reopened.confirm(); reopened.invalidate()
                try check(!reopened.requiresReopen)
            }; passed.append(name)
            name = "read-only-invalidation-is-not-uncertain"
            do {
                let fence = IOSStoreMutationFence(); fence.invalidate()
                try check(!fence.pending && !fence.requiresReopen)
            }; passed.append(name)
            return ["status": "passed", "platform": "macOS-native-coordinator-fixtures", "passed": passed.count, "checks": passed]
        } catch { return ["status": "failed", "platform": "macOS-native-coordinator-fixtures", "passed": passed.count, "checks": passed, "failedCheck": name] }
    }
}
#endif
