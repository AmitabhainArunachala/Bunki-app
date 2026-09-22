import Foundation

public enum SharedFileDraftRefusal: Equatable, Sendable {
    case revoked, alreadyStarted, notReady, alreadySubmitted
}

public enum SharedFileDraftLoadOutcome: Equatable, Sendable {
    case loaded(SharedFileMetadata)
    case failed(SharedFileError)
}

public enum SharedFileDraftUnknownReason: Equatable, Sendable {
    case reportedCommitOutcomeUnknown
    case unclassifiedError
}

/// An observation of one Keep call, not a promise about current file presence
/// or permission to create a learner record. Even a failure without a receipt
/// is not proof that an item with that ID is absent from storage.
public enum SharedFileDraftKeepOutcome: Equatable, Sendable {
    case receipt(SharedFileReceipt)
    case failedWithoutReceipt(SharedFileError)
    case outcomeUnknown(SharedFileDraftUnknownReason)
}

public enum SharedFileDraftPhase: Equatable, Sendable {
    case idle, loading, loaded
    case loadFailed(SharedFileError)
    case keeping(operationID: UUID)
    case settled(operationID: UUID, outcome: SharedFileDraftKeepOutcome)
}

public struct SharedFileDraftSnapshot: Equatable, Sendable {
    public let isRevoked: Bool
    public let phase: SharedFileDraftPhase
    public let selectedMetadata: SharedFileMetadata?
    public let isBusy: Bool
    public let canKeep: Bool
}

// Identity is private to this module/file and is never restored from an ID or
// caller-provided result. Handles observe work; they cannot start or cancel it.
fileprivate final class SharedFileDraftIdentity: Sendable {}

public struct SharedFileLoadAttempt: Sendable {
    fileprivate let owner: SharedFileDraftIdentity
    fileprivate let loadID: UUID
    fileprivate let work: Task<SharedFileDraftLoadOutcome, Never>

    /// Cancelling an observational waiter does not cancel the native owner.
    public func outcome() async -> SharedFileDraftLoadOutcome { await work.value }
}

public struct SharedFileKeepAttempt: Sendable {
    public let operationID: UUID
    fileprivate let owner: SharedFileDraftIdentity
    fileprivate let work: Task<SharedFileDraftKeepOutcome, Never>

    /// The actual worker result is available independently of main-actor/UI
    /// harvesting. There is deliberately no trailing cancellation check.
    public func outcome() async -> SharedFileDraftKeepOutcome { await work.value }
}

public enum SharedFileDraftLoadAdmission: Sendable {
    case accepted(SharedFileLoadAttempt)
    case refused(SharedFileDraftRefusal)
}

public enum SharedFileDraftKeepAdmission: Sendable {
    case accepted(SharedFileKeepAttempt)
    case refused(SharedFileDraftRefusal)
}

/// One selected attachment and at most one explicitly admitted Keep. The native
/// owner must revoke on Cancel/dismiss/lifecycle loss before dropping its UI
/// observer. This object does not infer UI lifetime from observer cancellation.
/// It supplies no container resolution, UI, retry, removal, learner assignment
/// or process-restart recovery. A new instance performs no storage operation.
@MainActor
public final class SharedFileDraft {
    private let inbox: SharedFileInbox
    private let identity = SharedFileDraftIdentity()
    private var isRevoked = false
    private var phase = SharedFileDraftPhase.idle
    private var metadata: SharedFileMetadata?
    private var candidate: SharedFileCandidate?
    private var loadID: UUID?
    private var keepID: UUID?
    private var loader: SharedItemProviderLoad?
    private var loadWork: Task<SharedFileDraftLoadOutcome, Never>?
    private var keepWorker: Task<SharedFileDraftKeepOutcome, Never>?
    private var keepSettlement: Task<Void, Never>?

    public init(inbox: SharedFileInbox) { self.inbox = inbox }

    public var snapshot: SharedFileDraftSnapshot {
        let busy: Bool
        switch phase {
        case .loading, .keeping: busy = true
        default: busy = false
        }
        return SharedFileDraftSnapshot(isRevoked: isRevoked, phase: phase,
            selectedMetadata: metadata, isBusy: busy,
            canKeep: !isRevoked && phase == .loaded && candidate != nil && keepID == nil)
    }

    /// Admission is synchronous on the owner actor. No provider completion can
    /// admit a Keep, and a second selection cannot replace this draft's bytes.
    public func startLoading(attachments: [NSItemProvider],
                             timeout: TimeInterval = SharedFileLimits.providerSeconds) -> SharedFileDraftLoadAdmission {
        guard !isRevoked else { return .refused(.revoked) }
        guard loadID == nil else { return .refused(.alreadyStarted) }
        let id = UUID()
        loadID = id
        phase = .loading
        let work = Task { @MainActor [self] in
            let result: Result<SharedFileCandidate, SharedFileError> = await withCheckedContinuation { continuation in
                let loading = SharedItemProviderLoad { result in continuation.resume(returning: result) }
                loader = loading
                // Revocation can precede this task's first actor turn. Route it
                // through the actual loader rather than starting the provider.
                if isRevoked { loading.cancel() }
                else { loading.start(attachments: attachments, timeout: timeout) }
            }
            // Only the actual loader callback settles a load. In particular,
            // revoke never releases a busy slot while its file copy is reading.
            loader = nil
            let outcome: SharedFileDraftLoadOutcome
            switch result {
            case .success(let selected):
                metadata = selected.metadata
                candidate = isRevoked ? nil : selected
                phase = .loaded
                outcome = .loaded(selected.metadata)
            case .failure(let error):
                candidate = nil
                phase = .loadFailed(error)
                outcome = .failed(error)
            }
            loadWork = nil
            return outcome
        }
        loadWork = work
        return .accepted(SharedFileLoadAttempt(owner: identity, loadID: id, work: work))
    }

    /// Every accepted Keep is terminal, including capacity, busy and cancelled
    /// failures. Caller-supplied IDs, retries and restored candidates are absent.
    public func keep() -> SharedFileDraftKeepAdmission {
        guard !isRevoked else { return .refused(.revoked) }
        guard keepID == nil else { return .refused(.alreadySubmitted) }
        guard phase == .loaded, let selected = candidate else { return .refused(.notReady) }
        let id = UUID()
        keepID = id
        phase = .keeping(operationID: id)
        candidate = nil
        let worker = Task.detached { [inbox] () -> SharedFileDraftKeepOutcome in
            do {
                // This is the sole submission. Preserve a returned receipt even
                // if cancellation races with return or subsequent harvesting.
                return .receipt(try inbox.keep(selected, id: id))
            } catch SharedFileError.commitOutcomeUnknown {
                return .outcomeUnknown(.reportedCommitOutcomeUnknown)
            } catch let error as SharedFileError {
                return .failedWithoutReceipt(error)
            } catch {
                return .outcomeUnknown(.unclassifiedError)
            }
        }
        keepWorker = worker
        // Strong ownership lasts until factual settlement. No weak UI callback
        // or revoked-authority guard may discard the worker's observation.
        keepSettlement = Task { @MainActor [self] in
            let outcome = await worker.value
            phase = .settled(operationID: id, outcome: outcome)
            keepWorker = nil
            keepSettlement = nil
        }
        return .accepted(SharedFileKeepAttempt(operationID: id, owner: identity, work: worker))
    }

    /// Revokes delivery/admission, requests real cancellation and drops ready
    /// bytes. It never rewrites factual phase, metadata, operation ID or result.
    public func revoke() {
        isRevoked = true
        candidate = nil
        loader?.cancel()
        keepWorker?.cancel()
    }

    /// Also check the actual native context and observer task immediately before
    /// UI delivery. A later Keep makes the earlier load status obsolete for UI.
    public func mayDeliver(_ attempt: SharedFileLoadAttempt) -> Bool {
        !isRevoked && attempt.owner === identity && attempt.loadID == loadID && keepID == nil
    }

    public func mayDeliver(_ attempt: SharedFileKeepAttempt) -> Bool {
        !isRevoked && attempt.owner === identity && attempt.operationID == keepID
    }

    /// Waits for work captured at entry; does not start, retry or poll storage.
    /// Waiter cancellation cannot replace the operation's factual result.
    public func awaitCurrentWork() async -> SharedFileDraftSnapshot {
        if let settlement = keepSettlement { await settlement.value }
        else if let loading = loadWork { _ = await loading.value }
        return snapshot
    }
}
