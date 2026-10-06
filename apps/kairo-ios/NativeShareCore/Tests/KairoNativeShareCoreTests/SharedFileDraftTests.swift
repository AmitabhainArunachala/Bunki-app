import CryptoKit
import Foundation
@testable import KairoNativeShareCore

private enum DraftCheckError: Error { case unexpectedAdmission, unexpectedOutcome }

private final class DraftValueBox<Value>: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: Value?
    func set(_ value: Value) { lock.lock(); defer { lock.unlock() }; stored = value }
    var value: Value? { lock.lock(); defer { lock.unlock() }; return stored }
    func take() -> Value? { lock.lock(); defer { stored = nil; lock.unlock() }; return stored }
}

private final class DraftProviderGate: @unchecked Sendable {
    let entered = DispatchSemaphore(value: 0)
    private let reply = DraftValueBox<@Sendable (URL) -> Void>()
    func hold(_ completion: @escaping @Sendable (URL) -> Void) {
        reply.set(completion); entered.signal()
    }
    func release(_ file: URL) { reply.take()?(file) }
}

private final class DraftStorageGate: @unchecked Sendable {
    let entered = DispatchSemaphore(value: 0)
    private let resume = DispatchSemaphore(value: 0)
    private let lock = NSLock()
    private var count = 0
    private let target: SharedFileCheckpoint
    init(_ target: SharedFileCheckpoint) { self.target = target }
    var hits: Int { lock.lock(); defer { lock.unlock() }; return count }
    func checkpoint(_ phase: SharedFileCheckpoint) {
        guard phase == target else { return }
        lock.lock(); count += 1; lock.unlock()
        entered.signal()
        if resume.wait(timeout: .now() + 5) != .success { fail("Draft storage gate timed out") }
    }
    func release() { resume.signal() }
}

private func draftWait(_ semaphore: DispatchSemaphore) async -> Bool {
    await withCheckedContinuation { continuation in
        DispatchQueue.global().async {
            continuation.resume(returning: semaphore.wait(timeout: .now() + 5) == .success)
        }
    }
}

/// These checks use actual NSItemProvider callbacks and inbox operations. Only
/// the existing DEBUG storage checkpoints control scheduling. No candidate is
/// minted with @testable and no provider, inbox or outcome backend is replaced.
@MainActor
final class SharedFileDraftTests {
    private func fixture(_ label: String) throws -> URL {
        let root = try shareTestDirectory("draft-" + label)
        let file = root.appendingPathComponent("選んだ版.png")
        // Synthetic representation bytes, deliberately not image validation.
        try Data([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]).write(to: file)
        return file
    }

    private func provider(_ file: URL, type: String = "public.png", name: String = "選んだ版.png",
                          gate: DraftProviderGate? = nil, failure: Bool = false,
                          nilValue: Bool = false) -> NSItemProvider {
        let provider = NSItemProvider(); provider.suggestedName = name
        provider.registerFileRepresentation(forTypeIdentifier: type, fileOptions: [], visibility: .ownProcess) { reply in
            if let gate { gate.hold { reply($0, false, nil) } }
            else if failure { reply(nil, false, NSError(domain: "private-provider-error-not-authority", code: 321)) }
            else { reply(nilValue ? nil : file, false, nil) }
            return Progress(totalUnitCount: 1)
        }
        return provider
    }

    private func accepted(_ admission: SharedFileDraftLoadAdmission) throws -> SharedFileLoadAttempt {
        guard case .accepted(let attempt) = admission else { throw DraftCheckError.unexpectedAdmission }
        return attempt
    }

    private func accepted(_ admission: SharedFileDraftKeepAdmission) throws -> SharedFileKeepAttempt {
        guard case .accepted(let attempt) = admission else { throw DraftCheckError.unexpectedAdmission }
        return attempt
    }

    private func refused(_ admission: SharedFileDraftLoadAdmission, _ expected: SharedFileDraftRefusal) {
        if case .refused(let reason) = admission { checkEqual(reason, expected) }
        else { fail("Unexpected load admission") }
    }

    private func refused(_ admission: SharedFileDraftKeepAdmission, _ expected: SharedFileDraftRefusal) {
        if case .refused(let reason) = admission { checkEqual(reason, expected) }
        else { fail("Unexpected Keep admission") }
    }

    private func receipt(_ outcome: SharedFileDraftKeepOutcome) throws -> SharedFileReceipt {
        guard case .receipt(let receipt) = outcome else { throw DraftCheckError.unexpectedOutcome }
        return receipt
    }

    private func ready(_ inbox: SharedFileInbox, _ file: URL) async throws -> SharedFileDraft {
        let draft = SharedFileDraft(inbox: inbox)
        let attempt = try accepted(draft.startLoading(attachments: [provider(file)]))
        guard case .loaded = await attempt.outcome() else { throw DraftCheckError.unexpectedOutcome }
        let state = await draft.awaitCurrentWork()
        checkEqual(state.phase, .loaded); checkTrue(state.canKeep); checkFalse(state.isBusy)
        return draft
    }

    private func publicCandidate(_ file: URL) async throws -> SharedFileCandidate {
        let selected = provider(file)
        let result: Result<SharedFileCandidate, SharedFileError> = await withCheckedContinuation { continuation in
            let loader = SharedItemProviderLoad { continuation.resume(returning: $0) }
            loader.start(attachments: [selected])
        }
        return try result.get()
    }

    func testProviderCompletionIsNotKeepAndBytesOutliveOriginal() async throws {
        let file = try fixture("explicit"), bytes = try Data(contentsOf: file)
        let inbox = try SharedFileInbox(container: file.deletingLastPathComponent())
        let draft = SharedFileDraft(inbox: inbox), foreign = SharedFileDraft(inbox: inbox)
        checkEqual(draft.snapshot.phase, .idle); refused(draft.keep(), .notReady)
        let load = try accepted(draft.startLoading(attachments: [provider(file)]))
        guard case .loaded(let metadata) = await load.outcome() else { throw DraftCheckError.unexpectedOutcome }
        let state = await draft.awaitCurrentWork()
        checkEqual(metadata.name, "選んだ版.png"); checkEqual(metadata.offeredType, "public.png")
        checkEqual(metadata.bytes, bytes.count)
        checkEqual(metadata.sha256, SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined())
        checkEqual(state.selectedMetadata, metadata); checkTrue(state.canKeep)
        checkTrue(draft.mayDeliver(load)); checkFalse(foreign.mayDeliver(load))
        refused(draft.startLoading(attachments: [provider(file)]), .alreadyStarted)
        try FileManager.default.removeItem(at: file)
        checkEqual(try inbox.list(), []); checkEqual(try inbox.unfinishedWrites(), [])
        let keep = try accepted(draft.keep())
        checkFalse(draft.mayDeliver(load)); checkTrue(draft.mayDeliver(keep)); checkFalse(foreign.mayDeliver(keep))
        let kept = try receipt(await keep.outcome())
        let final = await draft.awaitCurrentWork()
        checkEqual(final.phase, .settled(operationID: keep.operationID, outcome: .receipt(kept)))
        checkEqual(kept.id, keep.operationID); checkEqual(kept.metadata, metadata)
        checkEqual(try inbox.read(id: kept.id).candidate.bytes, bytes)
        checkEqual(try inbox.list(), [kept]); checkFalse(final.canKeep); checkFalse(final.isBusy)
        refused(draft.keep(), .alreadySubmitted)
    }

    func testLoadingRefusalsAndActualRedactedErrors() async throws {
        let file = try fixture("errors")
        let inbox = try SharedFileInbox(container: file.deletingLastPathComponent())
        let huge = file.deletingLastPathComponent().appendingPathComponent("oversize.pdf")
        try Data().write(to: huge)
        let handle = try FileHandle(forWritingTo: huge)
        try handle.truncate(atOffset: UInt64(SharedFileLimits.fileBytes + 1)); try handle.close()
        let cases: [([NSItemProvider], SharedFileError)] = [
            ([], .attachmentCount), ([provider(file), provider(file)], .attachmentCount),
            ([provider(file, type: "public.url")], .unsupportedRepresentation),
            ([provider(file, name: "../private.png")], .invalidInput),
            ([provider(file, failure: true)], .providerUnavailable),
            ([provider(file, nilValue: true)], .providerUnavailable),
            ([provider(huge, type: "com.adobe.pdf")], .fileSize),
        ]
        for (attachments, expected) in cases {
            let draft = SharedFileDraft(inbox: inbox)
            refused(draft.keep(), .notReady)
            let load = try accepted(draft.startLoading(attachments: attachments))
            let outcome = await load.outcome(), state = await draft.awaitCurrentWork()
            checkEqual(outcome, .failed(expected)); checkEqual(state.phase, .loadFailed(expected))
            checkFalse(state.canKeep); checkFalse(state.isBusy); checkEqual(state.selectedMetadata, nil)
            refused(draft.keep(), .notReady)
            refused(draft.startLoading(attachments: [provider(file)]), .alreadyStarted)
        }
        checkEqual(try inbox.list(), []); checkEqual(try inbox.unfinishedWrites(), [])
    }

    func testLoadingRevocationBeforeURLAndLateReply() async throws {
        let file = try fixture("load-cancel"), gate = DraftProviderGate()
        let inbox = try SharedFileInbox(container: file.deletingLastPathComponent())
        let idle = SharedFileDraft(inbox: inbox)
        idle.revoke(); idle.revoke()
        checkEqual(idle.snapshot.phase, .idle); refused(idle.keep(), .revoked)
        refused(idle.startLoading(attachments: [provider(file)]), .revoked)
        let beforeStart = SharedFileDraft(inbox: inbox), unstartedGate = DraftProviderGate()
        let unstarted = try accepted(beforeStart.startLoading(attachments: [provider(file, gate: unstartedGate)]))
        beforeStart.revoke()
        checkTrue(beforeStart.snapshot.isBusy)
        let unstartedResult = await unstarted.outcome()
        checkEqual(unstartedResult, .failed(.cancelled))
        checkFalse(unstartedGate.entered.wait(timeout: .now()) == .success, "Revoked pre-start load invoked provider")
        let draft = SharedFileDraft(inbox: inbox)
        let load = try accepted(draft.startLoading(attachments: [provider(file, gate: gate)]))
        defer { gate.release(file) }
        let entered = await draftWait(gate.entered); checkTrue(entered)
        refused(draft.startLoading(attachments: [provider(file)]), .alreadyStarted)
        draft.revoke(); checkTrue(draft.snapshot.isBusy)
        let outcome = await load.outcome(), state = await draft.awaitCurrentWork()
        checkEqual(outcome, .failed(.cancelled)); checkTrue(state.isRevoked); checkFalse(state.isBusy)
        gate.release(file)
        await Task.yield()
        let late = await load.outcome()
        checkEqual(late, outcome); checkFalse(draft.snapshot.canKeep); checkFalse(draft.mayDeliver(load))
        checkEqual(draft.snapshot.selectedMetadata, nil); refused(draft.keep(), .revoked)
        checkEqual(try inbox.list(), []); checkEqual(try inbox.unfinishedWrites(), [])
    }

    func testTimeoutAndObservationalCancellation() async throws {
        let file = try fixture("observer"), deadlineGate = DraftProviderGate()
        let inbox = try SharedFileInbox(container: file.deletingLastPathComponent())
        let timed = SharedFileDraft(inbox: inbox)
        let timedLoad = try accepted(timed.startLoading(attachments: [provider(file, gate: deadlineGate)], timeout: 0.02))
        defer { deadlineGate.release(file) }
        let timeout = await timedLoad.outcome()
        checkEqual(timeout, .failed(.timeout)); checkFalse(timed.snapshot.canKeep)
        deadlineGate.release(file); await Task.yield()
        let late = await timedLoad.outcome(); checkEqual(late, timeout)
        let gate = DraftProviderGate(), draft = SharedFileDraft(inbox: inbox)
        let load = try accepted(draft.startLoading(attachments: [provider(file, gate: gate)]))
        defer { gate.release(file) }
        let entered = await draftWait(gate.entered); checkTrue(entered)
        let observer = Task.detached { await load.outcome() }
        observer.cancel(); gate.release(file)
        guard case .loaded = await observer.value else { throw DraftCheckError.unexpectedOutcome }
        checkFalse(draft.snapshot.isRevoked); checkTrue(draft.snapshot.canKeep); checkTrue(draft.mayDeliver(load))
        let storageGate = DraftStorageGate(.temporaryFlushed)
        let gatedInbox = try SharedFileInbox(container: try shareTestDirectory("draft-keep-observer"), lockTimeout: 2,
                                             checkpoint: { storageGate.checkpoint($0) })
        let keeping = try await ready(gatedInbox, file), attempt = try accepted(keeping.keep())
        defer { storageGate.release() }
        let held = await draftWait(storageGate.entered); checkTrue(held)
        let keepObserver = Task.detached { await attempt.outcome() }
        let settlementObserver = Task { @MainActor in await keeping.awaitCurrentWork() }
        keepObserver.cancel(); settlementObserver.cancel(); storageGate.release()
        let kept = try receipt(await keepObserver.value), state = await settlementObserver.value
        checkEqual(state.phase, .settled(operationID: kept.id, outcome: .receipt(kept)))
        checkFalse(state.isRevoked); checkTrue(keeping.mayDeliver(attempt))
        checkEqual(try gatedInbox.list(), [kept])
    }

    func testConcurrentKeepAdmissionIsSingleAndTerminal() async throws {
        let file = try fixture("duplicate"), gate = DraftStorageGate(.temporaryFlushed)
        let inbox = try SharedFileInbox(container: file.deletingLastPathComponent(), lockTimeout: 2,
                                        checkpoint: { gate.checkpoint($0) })
        let draft = try await ready(inbox, file)
        defer { gate.release() }
        let first = Task { @MainActor in draft.keep() }, second = Task { @MainActor in draft.keep() }
        let admissions = await [first.value, second.value]
        var issued: [SharedFileKeepAttempt] = [], rejected = 0
        for admission in admissions {
            switch admission {
            case .accepted(let attempt): issued.append(attempt)
            case .refused(let reason): checkEqual(reason, .alreadySubmitted); rejected += 1
            }
        }
        checkEqual(issued.count, 1); checkEqual(rejected, 1)
        let keep = try requireValue(issued.first)
        let held = await draftWait(gate.entered); checkTrue(held)
        checkTrue(draft.snapshot.isBusy); refused(draft.keep(), .alreadySubmitted)
        gate.release()
        let kept = try receipt(await keep.outcome()), state = await draft.awaitCurrentWork()
        checkEqual(gate.hits, 1); checkEqual(try inbox.list(), [kept]); checkEqual(kept.id, keep.operationID)
        checkFalse(state.isBusy); refused(draft.keep(), .alreadySubmitted)
    }

    func testPrepublicationRevocationKeepsBusyUntilSettlement() async throws {
        let file = try fixture("before-publish"), gate = DraftStorageGate(.temporaryFlushed)
        let inbox = try SharedFileInbox(container: file.deletingLastPathComponent(), lockTimeout: 2,
                                        checkpoint: { gate.checkpoint($0) })
        let draft = try await ready(inbox, file), keep = try accepted(draft.keep())
        defer { gate.release() }
        let held = await draftWait(gate.entered); checkTrue(held)
        draft.revoke(); checkTrue(draft.snapshot.isBusy); refused(draft.keep(), .revoked)
        checkEqual(draft.snapshot.phase, .keeping(operationID: keep.operationID))
        gate.release()
        let outcome = await keep.outcome(), state = await draft.awaitCurrentWork()
        checkEqual(outcome, .failedWithoutReceipt(.cancelled))
        checkEqual(state.phase, .settled(operationID: keep.operationID, outcome: outcome))
        checkTrue(state.isRevoked); checkFalse(state.isBusy); checkFalse(draft.mayDeliver(keep))
        // This fixture started empty; an error in general is not absence proof.
        checkEqual(try inbox.list(), []); checkEqual(try inbox.unfinishedWrites(), [])
    }

    func testPostpublicationRevocationRemainsUnknownWithoutDeletion() async throws {
        let file = try fixture("after-publish"), gate = DraftStorageGate(.published)
        let bytes = try Data(contentsOf: file)
        let inbox = try SharedFileInbox(container: file.deletingLastPathComponent(), lockTimeout: 2,
                                        checkpoint: { gate.checkpoint($0) })
        let draft = try await ready(inbox, file), keep = try accepted(draft.keep())
        defer { gate.release() }
        let held = await draftWait(gate.entered); checkTrue(held)
        draft.revoke(); checkTrue(draft.snapshot.isBusy); gate.release()
        let outcome = await keep.outcome(), state = await draft.awaitCurrentWork()
        checkEqual(outcome, .outcomeUnknown(.reportedCommitOutcomeUnknown))
        checkEqual(state.phase, .settled(operationID: keep.operationID, outcome: outcome))
        let stored = try inbox.read(id: keep.operationID)
        checkEqual(stored.candidate.bytes, bytes); checkEqual(try inbox.list(), [stored.receipt])
        checkEqual(try inbox.unfinishedWrites(), [])
        checkEqual(draft.snapshot, state, "An external read must not promote the owner's unknown outcome")
        checkFalse(state.isBusy); checkTrue(state.isRevoked); checkFalse(draft.mayDeliver(keep))
        refused(draft.keep(), .revoked)
    }

    func testKnownRawReceiptSurvivesRevocationBeforeOwnerHarvest() async throws {
        let file = try fixture("receipt-before-harvest"), gate = DraftStorageGate(.published)
        let inbox = try SharedFileInbox(container: file.deletingLastPathComponent(), lockTimeout: 2,
                                        checkpoint: { gate.checkpoint($0) })
        let draft = try await ready(inbox, file), keep = try accepted(draft.keep())
        defer { gate.release() }
        let held = await draftWait(gate.entered); checkTrue(held)
        let observed = DraftValueBox<SharedFileDraftKeepOutcome>(), observedSignal = DispatchSemaphore(value: 0)
        let observer = Task.detached {
            let outcome = await keep.outcome(); observed.set(outcome); observedSignal.signal()
        }
        // Intentional, bounded CLI scheduling control: hold the main actor so
        // raw result observation happens before owner harvest can resume.
        gate.release()
        checkTrue(observedSignal.wait(timeout: .now() + 5) == .success, "Raw result incorrectly depends on owner actor")
        let kept = try receipt(try requireValue(observed.value))
        checkEqual(draft.snapshot.phase, .keeping(operationID: keep.operationID))
        checkTrue(draft.snapshot.isBusy)
        draft.revoke()
        let state = await draft.awaitCurrentWork(), again = await keep.outcome()
        await observer.value
        checkEqual(state.phase, .settled(operationID: keep.operationID, outcome: .receipt(kept)))
        checkEqual(again, .receipt(kept)); checkTrue(state.isRevoked); checkFalse(state.isBusy)
        checkFalse(draft.mayDeliver(keep)); checkEqual(try inbox.list(), [kept])
    }

    func testReceiptKnowledgeAndStrongSettlementOutliveDismissal() async throws {
        let file = try fixture("lifetime"), inbox = try SharedFileInbox(container: file.deletingLastPathComponent())
        var completed: SharedFileDraft? = try await ready(inbox, file)
        let keep = try accepted(try requireValue(completed).keep())
        let kept = try receipt(await keep.outcome())
        _ = await completed?.awaitCurrentWork()
        completed?.revoke(); completed?.revoke()
        checkEqual(completed?.snapshot.phase, .settled(operationID: kept.id, outcome: .receipt(kept)))
        completed = nil
        let retained = await keep.outcome(); checkEqual(retained, .receipt(kept))

        let gate = DraftStorageGate(.published)
        let gatedInbox = try SharedFileInbox(container: try shareTestDirectory("draft-dismissed"), lockTimeout: 2,
                                             checkpoint: { gate.checkpoint($0) })
        var disappearing: SharedFileDraft? = try await ready(gatedInbox, file)
        let retainedForSettlement = { [weak disappearing] in disappearing != nil }
        let pending = try accepted(try requireValue(disappearing).keep())
        defer { gate.release() }
        let held = await draftWait(gate.entered); checkTrue(held)
        disappearing?.revoke(); disappearing = nil
        checkTrue(retainedForSettlement(), "Owner was lost before the operation could settle")
        gate.release()
        let outcome = await pending.outcome()
        checkEqual(outcome, .outcomeUnknown(.reportedCommitOutcomeUnknown))
        let deadline = ProcessInfo.processInfo.systemUptime + 5
        while retainedForSettlement() && ProcessInfo.processInfo.systemUptime < deadline {
            try await Task.sleep(for: .milliseconds(1))
        }
        checkFalse(retainedForSettlement(), "Settled operation retained the draft indefinitely")
        let stillKnown = await pending.outcome(); checkEqual(stillKnown, outcome)
        checkEqual(try gatedInbox.read(id: pending.operationID).candidate.bytes, try Data(contentsOf: file))
    }

    func testFailuresPreserveStorageAndRemovedIDsCannotReplay() async throws {
        let file = try fixture("capacity"), inbox = try SharedFileInbox(container: file.deletingLastPathComponent())
        let candidate = try await publicCandidate(file)
        var originals: [SharedFileReceipt] = []
        for _ in 0..<SharedFileLimits.items { originals.append(try inbox.keep(candidate, id: UUID())) }
        let before = try inbox.list(), full = try await ready(inbox, file)
        let attempt = try accepted(full.keep()), outcome = await attempt.outcome()
        _ = await full.awaitCurrentWork()
        checkEqual(outcome, .failedWithoutReceipt(.capacity)); refused(full.keep(), .alreadySubmitted)
        checkEqual(try inbox.list(), before); checkEqual(originals.count, SharedFileLimits.items)
        for original in originals { checkEqual(try inbox.read(id: original.id).receipt, original) }
        checkEqual(try inbox.unfinishedWrites(), [])

        let busyRoot = try shareTestDirectory("draft-storage-busy"), gate = DraftStorageGate(.temporaryFlushed)
        let holder = try SharedFileInbox(container: busyRoot, lockTimeout: 2, checkpoint: { gate.checkpoint($0) })
        let short = try SharedFileInbox(container: busyRoot, lockTimeout: 0.02)
        let busy = try await ready(short, file), writerID = UUID()
        let writer = Task.detached { try holder.keep(candidate, id: writerID) }
        defer { gate.release() }
        let held = await draftWait(gate.entered); checkTrue(held)
        let busyAttempt = try accepted(busy.keep()), busyOutcome = await busyAttempt.outcome()
        _ = await busy.awaitCurrentWork()
        checkEqual(busyOutcome, .failedWithoutReceipt(.storageBusy)); refused(busy.keep(), .alreadySubmitted)
        gate.release()
        let written = try await writer.value
        checkEqual(try short.list(), [written]); checkEqual(try short.unfinishedWrites(), [])

        let removedInbox = try SharedFileInbox(container: try shareTestDirectory("draft-explicit-removal"))
        let old = try await ready(removedInbox, file), oldAttempt = try accepted(old.keep())
        let oldReceipt = try receipt(await oldAttempt.outcome())
        _ = await old.awaitCurrentWork()
        checkTrue(try removedInbox.remove(oldReceipt)); refused(old.keep(), .alreadySubmitted)
        checkEqual(old.snapshot.phase, .settled(operationID: oldReceipt.id, outcome: .receipt(oldReceipt)))
        let new = SharedFileDraft(inbox: removedInbox)
        checkEqual(new.snapshot.phase, .idle); refused(new.keep(), .notReady)
        let idle = await new.awaitCurrentWork(); checkEqual(idle.phase, .idle)
        checkEqual(try removedInbox.list(), [], "Constructing or observing a draft must not replay removed bytes")
        let freshLoad = try accepted(new.startLoading(attachments: [provider(file)]))
        guard case .loaded = await freshLoad.outcome() else { throw DraftCheckError.unexpectedOutcome }
        let freshAttempt = try accepted(new.keep()), fresh = try receipt(await freshAttempt.outcome())
        _ = await new.awaitCurrentWork()
        checkFalse(fresh.id == oldReceipt.id); checkFalse(fresh.incarnation == oldReceipt.incarnation)
        checkEqual(try removedInbox.list(), [fresh])
        checkEqual(old.snapshot.phase, .settled(operationID: oldReceipt.id, outcome: .receipt(oldReceipt)))
    }
}
