import CloudKit
import Foundation

public enum NativePairingDecision: Sendable { case connectExisting, pairNew }

/// Created only by begin after an SDK identity check. Not Codable and not an RPC
/// value. A native alert must show this exact profile and pairing action.
public struct NativePairingChallenge: Sendable {
    public let profile: NativeSyncProfile
    public let account: CloudAccountIdentity
    public let requiresPairing: Bool
    let id: UUID
    let epoch: UUID
    let connectionID: UUID
}

final class NativeBootstrapFence: @unchecked Sendable {
    private let lock = NSLock()
    private var epoch = UUID()
    private var active: NativeCloudSyncConnection?
    func current() -> UUID { lock.withLock { epoch } }
    func isCurrent(_ value: UUID) -> Bool { lock.withLock { epoch == value } }
    func install(_ connection: NativeCloudSyncConnection, epoch: UUID) -> Bool {
        lock.withLock {
            guard self.epoch == epoch, active == nil else { return false }
            active = connection; return true
        }
    }
    func revoke(_ reason: JournalRPCInvalidationReason) {
        let prior = lock.withLock { () -> NativeCloudSyncConnection? in
            epoch = UUID(); let old = active; active = nil; return old
        }
        prior?.invalidate(reason)
    }
    func revokeIfCurrent(_ value: UUID, reason: JournalRPCInvalidationReason) {
        let prior = lock.withLock { () -> NativeCloudSyncConnection? in
            guard epoch == value else { return nil }
            epoch = UUID(); let old = active; active = nil; return old
        }
        prior?.invalidate(reason)
    }
}

private final class NativeBootstrapAccountObservation: @unchecked Sendable {
    let token: any NSObjectProtocol
    init(fence: NativeBootstrapFence) {
        token = NotificationCenter.default.addObserver(forName: .CKAccountChanged, object: nil, queue: nil) { _ in
            fence.revoke(.accountChanged)
        }
    }
    deinit { NotificationCenter.default.removeObserver(token) }
}

/// One native lease and RPC channel. The native embedding must still compare
/// document/local-session ownership immediately before delivering each reply.
public final class NativeCloudSyncConnection: @unchecked Sendable {
    public let descriptor: JournalRPCSessionDescriptor
    public let connectionID: UUID
    public let adapter: JournalRPCAdapter
    private let transport: ForegroundJournalTransport
    private let sessions: JournalRPCSessionGate
    private let fence: NativeBootstrapFence
    private let epoch: UUID
    private let lock = NSLock()
    private var reason: JournalRPCInvalidationReason?
    private var handler: (@Sendable (JournalRPCInvalidationReason) -> Void)?
    private var handlerInstalled = false
    init(descriptor: JournalRPCSessionDescriptor, connectionID: UUID, adapter: JournalRPCAdapter,
         transport: ForegroundJournalTransport, sessions: JournalRPCSessionGate,
         fence: NativeBootstrapFence, epoch: UUID) {
        self.descriptor = descriptor; self.connectionID = connectionID; self.adapter = adapter
        self.transport = transport; self.sessions = sessions; self.fence = fence; self.epoch = epoch
    }
    public var isCurrent: Bool {
        fence.isCurrent(epoch) && lock.withLock { reason == nil }
            && (try? sessions.capture(connectionID: connectionID).lease) == descriptor.leaseId
    }
    private func captureSession() throws -> JournalSession {
        guard isCurrent else { throw JournalError.staleSession }
        let capture = try sessions.capture(connectionID: connectionID, lease: descriptor.leaseId)
        guard isCurrent else { throw JournalError.staleSession }
        return capture.session
    }
    private func invalidateIfAuthorityLost(_ error: any Error) {
        if let error = error as? JournalError,
           error == .staleSession || error == .accountUnavailable || error == .unauthorizedScope {
            invalidate(.nativeSessionLost)
        }
    }
    /// Native foreground coordinator convenience. Canonical envelopes and all
    /// local admission/merge decisions still belong to the shared sync core.
    public func push(_ envelopes: [JournalEnvelope]) async throws -> JournalPushResult {
        do {
            let session = try captureSession()
            let result = try await transport.push(envelopes, session: session)
            guard isCurrent else { throw JournalError.staleSession }
            return result
        } catch { invalidateIfAuthorityLost(error); throw error }
    }
    public func pull(checkpoint: String?, limit: Int) async throws -> JournalPullResult {
        do {
            let session = try captureSession()
            let result = try await transport.pull(checkpoint: checkpoint, limit: limit, session: session)
            guard isCurrent else { throw JournalError.staleSession }
            return result
        } catch { invalidateIfAuthorityLost(error); throw error }
    }
    /// One native control-channel observer; late installation receives the
    /// already terminal reason. Callbacks never execute under the state lock.
    public func setInvalidationHandler(_ callback: @escaping @Sendable (JournalRPCInvalidationReason) -> Void) throws {
        let prior = try lock.withLock { () throws -> JournalRPCInvalidationReason? in
            guard !handlerInstalled else { throw JournalRPCError.busy }
            handlerInstalled = true
            if reason == nil { handler = callback }
            return reason
        }
        if let prior { callback(prior) }
    }
    public func invalidate(_ next: JournalRPCInvalidationReason) {
        let result = lock.withLock { () -> (Bool, (@Sendable (JournalRPCInvalidationReason) -> Void)?) in
            guard reason == nil else { return (false, nil) }
            reason = next; let callback = handler; handler = nil; return (true, callback)
        }
        guard result.0 else { return }
        fence.revokeIfCurrent(epoch, reason: next)
        sessions.revoke(next)
        result.1?(next)
        let transport = transport
        Task { await transport.invalidateSession() }
    }
}

struct NativeCloudBootstrapBackend: Sendable {
    let backend: CloudKitBackend
    func prepareFirstPairing(account: CloudAccountIdentity, scope: JournalScope,
                             assertCurrent: @escaping @Sendable () throws -> Void) async throws {
        try await Self.prepareFirstPairing(account: account, scope: scope, assertCurrent: assertCurrent,
            identity: { try await backend.accountIdentity() },
            lookup: { try await backend.database.recordZones(for: [$0]) },
            save: { try await backend.database.modifyRecordZones(saving: [$0], deleting: []) })
    }
    // Real SDK values and per-zone result admission are shared with no-network
    // tests. Tests cannot provide this seam through the public initializer.
    static func prepareFirstPairing(account: CloudAccountIdentity, scope: JournalScope,
        assertCurrent: @escaping @Sendable () throws -> Void,
        identity: @escaping @Sendable () async throws -> CloudAccountIdentity,
        lookup: @escaping @Sendable (CKRecordZone.ID) async throws -> [CKRecordZone.ID: Result<CKRecordZone, any Error>],
        save: @escaping @Sendable (CKRecordZone) async throws -> (saveResults: [CKRecordZone.ID: Result<CKRecordZone, any Error>], deleteResults: [CKRecordZone.ID: Result<Void, any Error>])) async throws {
        try assertCurrent(); try Task.checkCancellation()
        guard try await identity() == account else { throw JournalError.staleSession }
        try assertCurrent()
        let channel = digest(try encoded([account.containerIdentifier, account.fingerprint, scope.accountID, scope.learnerID]))
        let id = CloudKitRecordCodec.zoneID("kairo-v1-" + channel)
        // Only an explicit FIRST pairing may create this exact private zone.
        // A normal reconnect never recreates a missing/deleted journal.
        let existing = try await lookup(id)
        try assertCurrent(); try Task.checkCancellation()
        guard Set(existing.keys) == [id], let result = existing[id] else { throw JournalError.invalidResponse }
        switch result {
        case .success(let zone):
            guard zone.zoneID == id else { throw JournalError.invalidResponse }
        case .failure(let error):
            guard let ck = error as? CKError, ck.code == .zoneNotFound else { throw CloudKitBackend.failure(error) }
            guard try await identity() == account else { throw JournalError.staleSession }
            try assertCurrent(); try Task.checkCancellation()
            let response = try await save(CKRecordZone(zoneID: id))
            try assertCurrent(); try Task.checkCancellation()
            guard response.deleteResults.isEmpty, Set(response.saveResults.keys) == [id],
                  let saved = response.saveResults[id] else { throw JournalError.invalidResponse }
            let zone = try saved.get()
            guard zone.zoneID == id else { throw JournalError.invalidResponse }
        }
        guard try await identity() == account else { throw JournalError.staleSession }
        try assertCurrent(); try Task.checkCancellation()
    }
}

/// Native-only pairing/bootstrap. Initialization performs no SDK account call or
/// Keychain I/O. Neither import nor journal RPC can invoke these methods.
public actor NativeCloudSyncBootstrap {
    private let containerIdentifier: String
    private let repository: NativePairingRepository
    private let identity: @Sendable () async throws -> CloudAccountIdentity
    private let prepareFirstPairing: @Sendable (CloudAccountIdentity, JournalScope, @escaping @Sendable () throws -> Void) async throws -> Void
    private let makeTransport: @Sendable (@escaping ForegroundJournalTransport.ScopeAuthorizer) throws -> ForegroundJournalTransport
    private nonisolated let fence: NativeBootstrapFence
    private let observation: NativeBootstrapAccountObservation?
    private var pending: NativePairingChallenge?

    public init(containerIdentifier: String, keychainService: String) throws {
        guard validID(containerIdentifier), containerIdentifier.hasPrefix("iCloud."),
              validID(keychainService) else { throw NativeBootstrapError.invalidConfiguration }
        try NativeCloudEntitlements.requireCurrentProcess(containerIdentifier: containerIdentifier)
        let sdk = NativeCloudBootstrapBackend(backend: CloudKitBackend(containerIdentifier: containerIdentifier))
        let fence = NativeBootstrapFence()
        self.containerIdentifier = containerIdentifier
        repository = NativePairingRepository(storage: NativeKeychainPairingStorage(service: keychainService))
        identity = { try await sdk.backend.accountIdentity() }
        prepareFirstPairing = { try await sdk.prepareFirstPairing(account: $0, scope: $1, assertCurrent: $2) }
        makeTransport = { try ForegroundJournalTransport(containerIdentifier: containerIdentifier, authorize: $0) }
        self.fence = fence; observation = NativeBootstrapAccountObservation(fence: fence)
    }

    init(containerIdentifier: String, repository: NativePairingRepository, fence: NativeBootstrapFence = NativeBootstrapFence(),
         observeAccountChanges: Bool = false,
         identity: @escaping @Sendable () async throws -> CloudAccountIdentity,
         prepareFirstPairing: @escaping @Sendable (CloudAccountIdentity, JournalScope, @escaping @Sendable () throws -> Void) async throws -> Void,
         makeTransport: @escaping @Sendable (@escaping ForegroundJournalTransport.ScopeAuthorizer) throws -> ForegroundJournalTransport) {
        self.containerIdentifier = containerIdentifier; self.repository = repository; self.fence = fence
        self.identity = identity; self.prepareFirstPairing = prepareFirstPairing; self.makeTransport = makeTransport
        observation = observeAccountChanges ? NativeBootstrapAccountObservation(fence: fence) : nil
    }

    deinit { fence.revoke(.shutdown) }

    /// The host calls this only from an explicit foreground native Sync action,
    /// after selecting a candidate profile through its native UI.
    public func begin(profile: NativeSyncProfile, connectionID: UUID) async throws -> NativePairingChallenge {
        revoke(.replaced); pending = nil
        let epoch = fence.current()
        let account = try await identity()
        try check(epoch)
        guard identicalUTF8(account.containerIdentifier, containerIdentifier) else { throw JournalError.accountUnavailable }
        let old = try await repository.read(container: containerIdentifier, scope: profile.scope)
        try check(epoch)
        if let old, !old.authorizes(account, profile.scope) { throw NativeBootstrapError.pairedToDifferentAccount }
        let challenge = NativePairingChallenge(profile: profile, account: account, requiresPairing: old == nil,
            id: UUID(), epoch: epoch, connectionID: connectionID)
        pending = challenge
        return challenge
    }

    /// The decision must come from native UI displaying the returned challenge.
    /// Each challenge is consumed once, including refusal/failure. It never
    /// changes the logical scope or adopts a different CloudKit account.
    public func complete(_ challenge: NativePairingChallenge, decision: NativePairingDecision) async throws -> NativeCloudSyncConnection {
        guard pending?.id == challenge.id else { throw NativeBootstrapError.staleChallenge }
        pending = nil
        try check(challenge.epoch)
        guard (challenge.requiresPairing && decision == .pairNew)
                || (!challenge.requiresPairing && decision == .connectExisting) else { throw NativeBootstrapError.confirmationRequired }
        guard try await identity() == challenge.account else { throw JournalError.staleSession }
        try check(challenge.epoch)
        if challenge.requiresPairing {
            let fence = fence; let epoch = challenge.epoch
            let assertCurrent: @Sendable () throws -> Void = {
                try Task.checkCancellation()
                guard fence.isCurrent(epoch) else { throw NativeBootstrapError.staleChallenge }
            }
            try await prepareFirstPairing(challenge.account, challenge.profile.scope, assertCurrent)
            try check(challenge.epoch)
            guard try await identity() == challenge.account else { throw JournalError.staleSession }
            try check(challenge.epoch)
            try await repository.pair(account: challenge.account, profile: challenge.profile, assertCurrent: assertCurrent)
            // Account change during Keychain I/O cannot publish a lease. A grant
            // already written records only the explicitly confirmed old account;
            // it requires fresh native confirmation on any later connection.
            try check(challenge.epoch)
        }
        let fence = fence; let repository = repository; let epoch = challenge.epoch
        let account = challenge.account; let scope = challenge.profile.scope
        let transport = try makeTransport { requestedAccount, requestedScope in
            guard fence.isCurrent(epoch), requestedAccount == account, requestedScope == scope else { return false }
            let allowed = try await repository.authorizes(requestedAccount, requestedScope)
            return allowed && fence.isCurrent(epoch)
        }
        do {
            let session = try await transport.openSession(for: scope)
            try check(epoch)
            let sessions = JournalRPCSessionGate(observeAccountChanges: false)
            let adapter = try JournalRPCAdapter(transport: transport, sessions: sessions, connectionID: challenge.connectionID)
            let descriptor = try sessions.attach(session, connectionID: challenge.connectionID)
            let connection = NativeCloudSyncConnection(descriptor: descriptor, connectionID: challenge.connectionID,
                adapter: adapter, transport: transport, sessions: sessions, fence: fence, epoch: epoch)
            guard fence.install(connection, epoch: epoch) else {
                connection.invalidate(.nativeSessionLost); throw NativeBootstrapError.staleChallenge
            }
            return connection
        } catch { await transport.invalidateSession(); throw error }
    }

    private func check(_ epoch: UUID) throws {
        try Task.checkCancellation()
        guard fence.isCurrent(epoch) else { throw NativeBootstrapError.staleChallenge }
    }
    /// Synchronous before any actor hop: account/profile/logout/navigation or
    /// control-channel loss invalidates pending confirmation and active RPC.
    public nonisolated func revoke(_ reason: JournalRPCInvalidationReason) { fence.revoke(reason) }

    /// Separate explicitly confirmed native "Forget pairing" action. Revocation
    /// happens even if protected storage is locked or deletion fails.
    public func forgetPairing(for profile: NativeSyncProfile) async throws {
        revoke(.logout); pending = nil
        try await repository.forget(container: containerIdentifier, scope: profile.scope)
    }

    /// Explicit native profile chooser reads only this device's protected saved
    /// pairings. Listing is not a fresh account check and opens no connection.
    public func listPairedProfiles() async throws -> [NativePairedProfile] {
        try await repository.profiles(container: containerIdentifier)
    }
}
