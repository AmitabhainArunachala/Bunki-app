import CloudKit
import Foundation
import Testing
@testable import KairoAppleSync

private let nativeAccountA = try! CloudAccountIdentity(containerIdentifier: "iCloud.example.native-bootstrap-fixture", userRecordName: "fixture-account-a")
private let nativeAccountB = try! CloudAccountIdentity(containerIdentifier: nativeAccountA.containerIdentifier, userRecordName: "fixture-account-b")
private let nativeProfile = try! NativeSyncProfile(scope: JournalScope(accountID: "account-a", learnerID: "learner-a"), label: "Fixture learner")

private final class NativeMemoryStore: NativePairingStorage, @unchecked Sendable {
    private let lock = NSLock()
    private var rows: [String: Data] = [:]
    private var readError = false; private var writeError = false; private var deleteError = false
    private var afterAdd: (@Sendable () -> Void)?
    var snapshot: [String: Data] { lock.withLock { rows } }
    func setFailure(read: Bool = false, write: Bool = false, delete: Bool = false) {
        lock.withLock { readError = read; writeError = write; deleteError = delete }
    }
    func setAfterAdd(_ action: @escaping @Sendable () -> Void) { lock.withLock { afterAdd = action } }
    func replace(_ values: [String: Data]) { lock.withLock { rows = values } }
    func read(key: String) throws -> Data? {
        try lock.withLock { if readError { throw NativeBootstrapError.pairingUnavailable }; return rows[key] }
    }
    func add(key: String, value: Data) throws {
        let callback = try lock.withLock { () throws -> (@Sendable () -> Void)? in
            if writeError { throw NativeBootstrapError.pairingUnavailable }
            if let old = rows[key], old != value { throw NativeBootstrapError.pairedToDifferentAccount }
            rows[key] = value; return afterAdd
        }
        callback?()
    }
    func remove(key: String) throws {
        try lock.withLock { if deleteError { throw NativeBootstrapError.pairingUnavailable }; rows.removeValue(forKey: key) }
    }
    func list() throws -> [Data] {
        try lock.withLock { if readError { throw NativeBootstrapError.pairingUnavailable }; return Array(rows.values) }
    }
}
private actor NativeLatch {
    var started = false
    var continuation: CheckedContinuation<Void, Never>?
    func hold() async { started = true; await withCheckedContinuation { continuation = $0 } }
    func release() { continuation?.resume(); continuation = nil }
}
private actor NativeFixtureBackend: JournalBackend {
    var account = nativeAccountA
    var identityError: JournalError?
    var identityHold: NativeLatch?
    var zoneHold: NativeLatch?
    var pullHold: NativeLatch?
    var identityCalls = 0; var zoneCalls = 0; var saves = 0; var pulls = 0
    func changeAccount(_ value: CloudAccountIdentity) { account = value }
    func failIdentity(_ error: JournalError) { identityError = error }
    func holdNextIdentity(_ latch: NativeLatch) { identityHold = latch }
    func holdZone(_ latch: NativeLatch) { zoneHold = latch }
    func holdPull(_ latch: NativeLatch) { pullHold = latch }
    func accountIdentity() async throws -> CloudAccountIdentity {
        identityCalls += 1
        if let identityError { throw identityError }
        let result = account; let latch = identityHold; identityHold = nil
        await latch?.hold(); return result
    }
    func prepareZone() async throws { zoneCalls += 1; await zoneHold?.hold() }
    func save(_ envelopes: [JournalEnvelope], scope: JournalScope, zoneName: String, limits: JournalLimits) async throws -> [String: RecordSaveResult] {
        saves += 1; return Dictionary(uniqueKeysWithValues: envelopes.map { ($0.reference.opId, .saved($0)) })
    }
    func changes(since token: Data?, scope: JournalScope, zoneName: String, limit: Int, limits: JournalLimits) async throws -> BackendPage {
        pulls += 1
        await pullHold?.hold()
        return BackendPage(records: [:], deletionIDs: [], token: Data("fixture-checkpoint".utf8), hasMore: false)
    }
}
private final class NativeCallbackCount: @unchecked Sendable {
    private let lock = NSLock(); private var count = 0
    var value: Int { lock.withLock { count } }
    func increment() { lock.withLock { count += 1 } }
}
private struct NativeFixtureContext: Sendable {
    let store: NativeMemoryStore; let backend: NativeFixtureBackend
    let repository: NativePairingRepository; let bootstrap: NativeCloudSyncBootstrap
}
private func nativeContext(store: NativeMemoryStore = NativeMemoryStore(), backend: NativeFixtureBackend = NativeFixtureBackend(), observeAccountChanges: Bool = false) -> NativeFixtureContext {
    let repository = NativePairingRepository(storage: store)
    let bootstrap = NativeCloudSyncBootstrap(containerIdentifier: nativeAccountA.containerIdentifier, repository: repository,
        observeAccountChanges: observeAccountChanges,
        identity: { try await backend.accountIdentity() }, prepareFirstPairing: { _, _, check in try check(); try await backend.prepareZone(); try check() },
        makeTransport: { ForegroundJournalTransport(backend: backend, authorize: $0) })
    return NativeFixtureContext(store: store, backend: backend, repository: repository, bootstrap: bootstrap)
}
private func nativeOpen(_ context: NativeFixtureContext, profile: NativeSyncProfile = nativeProfile) async throws -> NativeCloudSyncConnection {
    let challenge = try await context.bootstrap.begin(profile: profile, connectionID: UUID())
    return try await context.bootstrap.complete(challenge, decision: challenge.requiresPairing ? .pairNew : .connectExisting)
}
private func nativeWait(_ latch: NativeLatch) async throws {
    for _ in 0..<400 { if await latch.started { return }; try await Task.sleep(for: .milliseconds(5)) }
    throw JournalRPCError.ioFailure
}
private func nativeError<E: Error & Equatable>(_ expected: E, _ body: () async throws -> Void) async {
    do { try await body(); Issue.record("Expected fixed native bootstrap refusal") }
    catch { #expect(error as? E == expected) }
}
private func nativeDescribe(_ connection: NativeCloudSyncConnection, id: String = "1") async throws -> [String: Any] {
    let request = try JSONSerialization.data(withJSONObject: ["format": "kairo-journal-rpc", "v": 1, "id": id, "method": "describe", "params": [:]])
    try await connection.adapter.submit(request, from: connection.connectionID)
    for _ in 0..<3 {
        guard let bytes = await connection.adapter.nextOutput() else { throw JournalRPCError.connectionLost }
        let row = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
        if row["type"] as? String == "reply" { return row }
    }
    throw JournalRPCError.ioFailure
}

@Test func nativeBootstrapRemainsDormantUntilExplicitBeginAndConfirmation() async throws {
    let context = nativeContext()
    #expect(await context.backend.identityCalls == 0)
    #expect(context.store.snapshot.isEmpty)
    let challenge = try await context.bootstrap.begin(profile: nativeProfile, connectionID: UUID())
    #expect(challenge.requiresPairing)
    #expect(await context.backend.zoneCalls == 0)
    #expect(context.store.snapshot.isEmpty)
    await nativeError(NativeBootstrapError.confirmationRequired) {
        _ = try await context.bootstrap.complete(challenge, decision: .connectExisting)
    }
    await nativeError(NativeBootstrapError.staleChallenge) {
        _ = try await context.bootstrap.complete(challenge, decision: .pairNew)
    }
    #expect(context.store.snapshot.isEmpty)
    #expect(await context.backend.zoneCalls == 0)
}

@Test func nativePairingPersistsExactScopeAndReconnectNeverReprovisions() async throws {
    let context = nativeContext()
    let connection = try await nativeOpen(context)
    #expect(connection.isCurrent)
    #expect(connection.descriptor.scope == nativeProfile.scope)
    #expect(await context.backend.zoneCalls == 1)
    let bytes = context.store.snapshot
    #expect(bytes.count == 1)
    #expect(!String(data: bytes.values.first!, encoding: .utf8)!.contains("fixture-account-a"))
    let reply = try await nativeDescribe(connection)
    #expect(reply["ok"] as? Bool == true)
    connection.invalidate(.shutdown)
    let next = nativeContext(store: context.store)
    let challenge = try await next.bootstrap.begin(profile: nativeProfile, connectionID: UUID())
    #expect(!challenge.requiresPairing)
    let restored = try await next.bootstrap.complete(challenge, decision: .connectExisting)
    #expect(restored.descriptor.leaseId != connection.descriptor.leaseId)
    #expect(restored.descriptor.channelId == connection.descriptor.channelId)
    #expect(await next.backend.zoneCalls == 0)
    #expect(context.store.snapshot == bytes)
    restored.invalidate(.shutdown)
}

@Test func nativePairingRejectsDifferentAccountAndUnavailableAccountWithoutAdoption() async throws {
    let context = nativeContext()
    let connection = try await nativeOpen(context)
    let original = context.store.snapshot
    await context.backend.changeAccount(nativeAccountB)
    await nativeError(NativeBootstrapError.pairedToDifferentAccount) {
        _ = try await context.bootstrap.begin(profile: nativeProfile, connectionID: UUID())
    }
    #expect(!connection.isCurrent)
    #expect(context.store.snapshot == original)
    await context.backend.failIdentity(.accountUnavailable)
    await nativeError(JournalError.accountUnavailable) {
        _ = try await context.bootstrap.begin(profile: nativeProfile, connectionID: UUID())
    }
    #expect(context.store.snapshot == original)
    #expect(await context.backend.zoneCalls == 1)
}

@Test func nativeAccountChangeBeforeConfirmationCannotPersistOrOpen() async throws {
    let context = nativeContext()
    let challenge = try await context.bootstrap.begin(profile: nativeProfile, connectionID: UUID())
    await context.backend.changeAccount(nativeAccountB)
    await nativeError(JournalError.staleSession) { _ = try await context.bootstrap.complete(challenge, decision: .pairNew) }
    #expect(context.store.snapshot.isEmpty)
    #expect(await context.backend.zoneCalls == 0)
}

@Test func nativeAccountNotificationSynchronouslyRevokesPendingAndActiveLeases() async throws {
    let context = nativeContext(observeAccountChanges: true)
    let connection = try await nativeOpen(context)
    let calls = NativeCallbackCount()
    try connection.setInvalidationHandler { _ in calls.increment() }
    NotificationCenter.default.post(name: .CKAccountChanged, object: nil)
    #expect(!connection.isCurrent)
    #expect(calls.value == 1)
    let reply = try await nativeDescribe(connection)
    #expect(reply["ok"] as? Bool == false)
    let challenge = try await context.bootstrap.begin(profile: nativeProfile, connectionID: UUID())
    NotificationCenter.default.post(name: .CKAccountChanged, object: nil)
    await nativeError(NativeBootstrapError.staleChallenge) { _ = try await context.bootstrap.complete(challenge, decision: .connectExisting) }
}

@Test func nativePendingAccountAndZoneWorkCannotSurviveProfileRevocation() async throws {
    let context = nativeContext()
    let latch = NativeLatch(); await context.backend.holdNextIdentity(latch)
    let pending = Task { try await context.bootstrap.begin(profile: nativeProfile, connectionID: UUID()) }
    try await nativeWait(latch)
    context.bootstrap.revoke(.profileChanged)
    await latch.release()
    await nativeError(NativeBootstrapError.staleChallenge) { _ = try await pending.value }
    let challenge = try await context.bootstrap.begin(profile: nativeProfile, connectionID: UUID())
    let zone = NativeLatch(); await context.backend.holdZone(zone)
    let confirming = Task { try await context.bootstrap.complete(challenge, decision: .pairNew) }
    try await nativeWait(zone)
    context.bootstrap.revoke(.connectionLost)
    await zone.release()
    await nativeError(NativeBootstrapError.staleChallenge) { _ = try await confirming.value }
    #expect(context.store.snapshot.isEmpty)
}

@Test func nativeStorageRefusalAndCorruptionNeverPublishAGrantOrLease() async throws {
    let context = nativeContext()
    context.store.setFailure(read: true)
    await nativeError(NativeBootstrapError.pairingUnavailable) {
        _ = try await context.bootstrap.begin(profile: nativeProfile, connectionID: UUID())
    }
    context.store.setFailure(write: true)
    let challenge = try await context.bootstrap.begin(profile: nativeProfile, connectionID: UUID())
    await nativeError(NativeBootstrapError.pairingUnavailable) { _ = try await context.bootstrap.complete(challenge, decision: .pairNew) }
    #expect(context.store.snapshot.isEmpty)
    context.store.setFailure()
    let key = try NativePairingRecord.key(container: nativeAccountA.containerIdentifier, scope: nativeProfile.scope)
    context.store.replace([key: Data("{\"version\":1}".utf8)])
    await nativeError(NativeBootstrapError.invalidPairing) {
        _ = try await context.bootstrap.begin(profile: nativeProfile, connectionID: UUID())
    }
    await nativeError(NativeBootstrapError.invalidPairing) { _ = try await context.bootstrap.listPairedProfiles() }
}

@Test func nativeRevocationDuringProtectedWriteCannotPublishLateConnection() async throws {
    let context = nativeContext()
    context.store.setAfterAdd { context.bootstrap.revoke(.accountChanged) }
    let challenge = try await context.bootstrap.begin(profile: nativeProfile, connectionID: UUID())
    await nativeError(NativeBootstrapError.staleChallenge) { _ = try await context.bootstrap.complete(challenge, decision: .pairNew) }
    #expect(try await context.repository.authorizes(nativeAccountA, nativeProfile.scope))
    #expect(try await !context.repository.authorizes(nativeAccountB, nativeProfile.scope))
    // The already confirmed old-account grant may have committed, but its late
    // completion is not a connection. Future native confirmation is still needed.
    #expect(await context.backend.saves == 0)
    #expect(await context.backend.pulls == 0)
}

@Test func nativeOpaqueUnicodeScopesAndCompetingPairingsNeverAlias() async throws {
    let store = NativeMemoryStore()
    let repository = NativePairingRepository(storage: store)
    let composed = try NativeSyncProfile(scope: JournalScope(accountID: "a-\u{e9}", learnerID: "l-\u{e9}"), label: "One")
    let decomposed = try NativeSyncProfile(scope: JournalScope(accountID: "a-e\u{301}", learnerID: "l-e\u{301}"), label: "Two")
    try await repository.pair(account: nativeAccountA, profile: composed)
    #expect(try await !repository.authorizes(nativeAccountA, decomposed.scope))
    let before = store.snapshot
    await nativeError(NativeBootstrapError.pairedToDifferentAccount) { try await repository.pair(account: nativeAccountB, profile: composed) }
    #expect(store.snapshot == before)
    try await repository.pair(account: nativeAccountB, profile: decomposed)
    #expect(store.snapshot.count == 2)
}

@Test func nativeConnectionRevocationIsIdempotentAndOldOwnerCannotRevokeReplacement() async throws {
    let context = nativeContext()
    let one = try await nativeOpen(context)
    one.invalidate(.profileChanged)
    let calls = NativeCallbackCount()
    try one.setInvalidationHandler { _ in calls.increment() }
    #expect(calls.value == 1)
    let two = try await nativeOpen(context)
    one.invalidate(.logout)
    #expect(two.isCurrent)
    #expect(calls.value == 1)
    #expect(throws: JournalRPCError.busy) { try one.setInvalidationHandler { _ in } }
    context.bootstrap.revoke(.shutdown)
    #expect(!two.isCurrent)
    weak var releasedCallbackCapture: NativeCallbackCount?
    do {
        let capture = NativeCallbackCount(); releasedCallbackCapture = capture
        try two.setInvalidationHandler { _ in capture.increment() }
        #expect(capture.value == 1)
    }
    #expect(releasedCallbackCapture == nil)
}

@Test func nativeForgetRevokesEvenWhenProtectedDeletionFails() async throws {
    let context = nativeContext()
    let connection = try await nativeOpen(context)
    let before = context.store.snapshot
    context.store.setFailure(delete: true)
    await nativeError(NativeBootstrapError.pairingUnavailable) { try await context.bootstrap.forgetPairing(for: nativeProfile) }
    #expect(!connection.isCurrent)
    #expect(context.store.snapshot == before)
    context.store.setFailure()
    try await context.bootstrap.forgetPairing(for: nativeProfile)
    #expect(context.store.snapshot.isEmpty)
    let challenge = try await context.bootstrap.begin(profile: nativeProfile, connectionID: UUID())
    #expect(challenge.requiresPairing)
}

@Test func nativeCandidateTransferAndListingNeverImportAuthority() async throws {
    let profile = try NativeSyncProfile.createCandidate(label: "Selected in native UI")
    let bytes = try profile.exportCandidate()
    let imported = try NativeSyncProfile.importCandidate(bytes)
    #expect(imported == profile)
    let source = nativeContext(); let connection = try await nativeOpen(source, profile: profile)
    let profiles = try await source.bootstrap.listPairedProfiles()
    #expect(profiles.count == 1 && profiles[0].profile == profile)
    let destination = nativeContext()
    let challenge = try await destination.bootstrap.begin(profile: imported, connectionID: UUID())
    #expect(challenge.requiresPairing)
    #expect(destination.store.snapshot.isEmpty)
    #expect(await destination.backend.zoneCalls == 0)
    var object = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
    object["authorized"] = true
    let forged = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys, .withoutEscapingSlashes])
    #expect(throws: NativeBootstrapError.invalidProfile) { _ = try NativeSyncProfile.importCandidate(forged) }
    connection.invalidate(.shutdown)
}

private func nativeControlBytes() throws -> Data {
    try JSONSerialization.data(withJSONObject: ["format": "kairo-native-bootstrap", "v": 1, "type": "connect",
        "requestId": "00000000-0000-4000-8000-000000000001", "connectionId": "00000000-0000-4000-8000-000000000002",
        "containerIdentifier": nativeAccountA.containerIdentifier, "keychainService": "example.fixture.bootstrap",
        "profileLabel": nativeProfile.label, "binding": ["accountId": nativeProfile.scope.accountID,
            "learnerId": nativeProfile.scope.learnerID, "sessionId": "local-session-exact"]], options: [.sortedKeys])
}

@Test func nativeControlFramingAndReadyBindEveryOwnerField() async throws {
    let bytes = try nativeControlBytes()
    let frame = try JournalRPCFrameDecoder.frame(bytes, limits: NativeBootstrapControlRequest.limits)
    var decoder = JournalRPCFrameDecoder(limits: NativeBootstrapControlRequest.limits); var values: [Data] = []
    for byte in frame { values += try decoder.append(Data([byte])) }
    try decoder.endOfInput()
    #expect(values == [bytes])
    let request = try NativeBootstrapControlRequest.decode(values[0])
    let context = nativeContext()
    let challenge = try await context.bootstrap.begin(profile: request.profile, connectionID: request.connectionID)
    let connection = try await context.bootstrap.complete(challenge, decision: .pairNew)
    let ready = try JSONSerialization.jsonObject(with: request.ready(connection)) as! [String: Any]
    #expect(ready["type"] as? String == "ready")
    #expect(ready["connectionId"] as? String == request.connectionID.uuidString.lowercased())
    #expect(ready["leaseId"] as? String == connection.descriptor.leaseId)
    #expect((ready["binding"] as? [String: String]) == ["accountId": nativeProfile.scope.accountID,
        "learnerId": nativeProfile.scope.learnerID, "sessionId": "local-session-exact"])
    connection.invalidate(.logout)
    #expect(throws: NativeBootstrapError.staleChallenge) { _ = try request.ready(connection) }
}

@Test func nativeControlRejectsDuplicateKeysAuthorityFieldsAndForeignRevocation() throws {
    let bytes = try nativeControlBytes(); let text = String(data: bytes, encoding: .utf8)!
    let duplicates = text.replacingOccurrences(of: "\"v\":1", with: "\"v\":1,\"\\u0076\":1")
    #expect(throws: NativeBootstrapError.invalidControl) { _ = try NativeBootstrapControlRequest.decode(Data(duplicates.utf8)) }
    var object = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
    object["authorized"] = true
    #expect(throws: NativeBootstrapError.invalidControl) {
        _ = try NativeBootstrapControlRequest.decode(JSONSerialization.data(withJSONObject: object))
    }
    object.removeValue(forKey: "authorized"); object["v"] = true
    #expect(throws: NativeBootstrapError.invalidControl) { _ = try NativeBootstrapControlRequest.decode(JSONSerialization.data(withJSONObject: object)) }
    let request = try NativeBootstrapControlRequest.decode(bytes)
    let revoke: [String: Any] = ["format": "kairo-native-bootstrap", "v": 1, "type": "revoke",
        "requestId": request.requestID.uuidString.lowercased(), "connectionId": UUID().uuidString.lowercased()]
    #expect(throws: NativeBootstrapError.invalidControl) { try request.validateRevocation(JSONSerialization.data(withJSONObject: revoke)) }
    var decoder = JournalRPCFrameDecoder(limits: NativeBootstrapControlRequest.limits)
    #expect(throws: JournalRPCError.limitsExceeded) { _ = try decoder.append(Data([0, 0, 64, 1])) }
}

@Test func nativeEntitlementAdmissionRequiresActualConfiguredCloudKitCapability() throws {
    try NativeCloudEntitlements.validate(containerIdentifier: nativeAccountA.containerIdentifier,
        containers: [nativeAccountA.containerIdentifier], services: ["CloudKit"], team: "A1B2C3D4E5", environment: "Development")
    for variant in 0..<5 {
        #expect(throws: NativeBootstrapError.configurationUnavailable) {
            try NativeCloudEntitlements.validate(containerIdentifier: nativeAccountA.containerIdentifier,
                containers: variant == 0 ? ["iCloud.someone-else"] : [nativeAccountA.containerIdentifier],
                services: variant == 1 ? [] : ["CloudKit"], team: variant == 2 ? nil : variant == 3 ? "invented" : "A1B2C3D4E5",
                environment: variant == 4 ? nil : "Development")
        }
    }
}

@Test func nativeZoneBootstrapCreatesOnlyTheExactFirstPairingZone() async throws {
    let context = nativeContext(); let connection = try await nativeOpen(context)
    let zoneID = CloudKitRecordCodec.zoneID("kairo-v1-" + connection.descriptor.channelId.suffix(64))
    let writes = NativeCallbackCount()
    try await NativeCloudBootstrapBackend.prepareFirstPairing(account: nativeAccountA, scope: nativeProfile.scope,
        assertCurrent: {}, identity: { nativeAccountA },
        lookup: { id in #expect(id == zoneID); return [id: .failure(CKError(.zoneNotFound))] },
        save: { zone in
            #expect(zone.zoneID == zoneID); writes.increment()
            return ([zoneID: .success(zone)], [:])
        })
    #expect(writes.value == 1)
    try await NativeCloudBootstrapBackend.prepareFirstPairing(account: nativeAccountA, scope: nativeProfile.scope,
        assertCurrent: {}, identity: { nativeAccountA },
        lookup: { [ $0: .success(CKRecordZone(zoneID: $0)) ] },
        save: { _ in writes.increment(); throw JournalError.invalidResponse })
    #expect(writes.value == 1)
    connection.invalidate(.shutdown)
}

@Test func nativeZoneLookupAfterRevocationCannotStartANewCloudWrite() async throws {
    let fence = NativeBootstrapFence(); let epoch = fence.current(); let latch = NativeLatch()
    let writes = NativeCallbackCount()
    let pending = Task {
        try await NativeCloudBootstrapBackend.prepareFirstPairing(account: nativeAccountA, scope: nativeProfile.scope,
            assertCurrent: { guard fence.isCurrent(epoch) else { throw NativeBootstrapError.staleChallenge } },
            identity: { nativeAccountA }, lookup: { id in await latch.hold(); return [id: .failure(CKError(.zoneNotFound))] },
            save: { _ in writes.increment(); throw JournalError.invalidResponse })
    }
    try await nativeWait(latch)
    fence.revoke(.profileChanged)
    await latch.release()
    await nativeError(NativeBootstrapError.staleChallenge) { try await pending.value }
    #expect(writes.value == 0)
}

@Test func nativeZoneFailuresAndUnexpectedResultsDoNotPretendProvisioningSucceeded() async throws {
    let writes = NativeCallbackCount()
    await nativeError(JournalError.journalReset) {
        try await NativeCloudBootstrapBackend.prepareFirstPairing(account: nativeAccountA, scope: nativeProfile.scope,
            assertCurrent: {}, identity: { nativeAccountA }, lookup: { [ $0: .failure(CKError(.userDeletedZone)) ] },
            save: { _ in writes.increment(); throw JournalError.invalidResponse })
    }
    #expect(writes.value == 0)
    await nativeError(JournalError.invalidResponse) {
        try await NativeCloudBootstrapBackend.prepareFirstPairing(account: nativeAccountA, scope: nativeProfile.scope,
            assertCurrent: {}, identity: { nativeAccountA }, lookup: { _ in [:] },
            save: { _ in writes.increment(); throw JournalError.invalidResponse })
    }
    #expect(writes.value == 0)
    await nativeError(JournalError.invalidResponse) {
        try await NativeCloudBootstrapBackend.prepareFirstPairing(account: nativeAccountA, scope: nativeProfile.scope,
            assertCurrent: {}, identity: { nativeAccountA }, lookup: { [ $0: .failure(CKError(.zoneNotFound)) ] },
            save: { zone in
                writes.increment()
                return ([zone.zoneID: .success(zone)], [zone.zoneID: .success(())])
            })
    }
    #expect(writes.value == 1)
}

@Test func nativeDirectOperationsUseTheCapturedTransportAndRevokeOnAccountLoss() async throws {
    let context = nativeContext(); let connection = try await nativeOpen(context)
    let file = Bundle.module.url(forResource: "operations", withExtension: "json", subdirectory: "Fixtures")!
    let rows = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as! [[String: Any]]
    let row = rows.first { $0["name"] as? String == "first" }!
    let envelope = try JournalEnvelope(reference: OperationReference(opId: row["opId"] as! String, sha256: row["sha256"] as! String),
        bytes: Data(base64Encoded: row["envelopeBase64"] as! String)!, scope: nativeProfile.scope)
    let pushed = try await connection.push([envelope])
    #expect(pushed.accepted == [envelope.reference])
    #expect(pushed.failures.isEmpty)
    let page = try await connection.pull(checkpoint: nil, limit: 1)
    #expect(page.envelopes.isEmpty && !page.nextCheckpoint.isEmpty)
    #expect(await context.backend.saves == 1)
    #expect(await context.backend.pulls == 1)
    await context.backend.changeAccount(nativeAccountB)
    await nativeError(JournalError.staleSession) { _ = try await connection.pull(checkpoint: page.nextCheckpoint, limit: 1) }
    #expect(!connection.isCurrent)
    #expect(await context.backend.pulls == 1)
}

@Test func nativeDirectOperationsRejectLateSuccessAndRetainOriginalBounds() async throws {
    let context = nativeContext(); let connection = try await nativeOpen(context)
    await nativeError(JournalError.invalidInput) { _ = try await connection.pull(checkpoint: nil, limit: 101) }
    await nativeError(JournalError.invalidInput) { _ = try await connection.push([]) }
    #expect(connection.isCurrent)
    #expect(await context.backend.pulls == 0)
    #expect(await context.backend.saves == 0)
    let latch = NativeLatch(); await context.backend.holdPull(latch)
    let pending = Task { try await connection.pull(checkpoint: nil, limit: 1) }
    try await nativeWait(latch)
    connection.invalidate(.profileChanged)
    #expect(!connection.isCurrent)
    await latch.release()
    await nativeError(JournalError.staleSession) { _ = try await pending.value }
}

@Test func nativeJavaScriptCandidateBytesRoundTripWithoutCanonicalChanges() throws {
    // This fixture was produced by Node JSON.stringify with ASCII-sorted keys,
    // UTF-8 Japanese label, literal slash and no trailing newline.
    let file = Bundle.module.url(forResource: "native-profile-candidate", withExtension: "json", subdirectory: "Fixtures")!
    let bytes = try Data(contentsOf: file)
    let profile = try NativeSyncProfile.importCandidate(bytes)
    #expect(profile.label == "日本語の学習 / 一人目「海」")
    #expect(profile.scope.accountID == "local-account:10000000-0000-4000-8000-000000000001")
    #expect(profile.scope.learnerID == "local-learner:20000000-0000-4000-8000-000000000002")
    #expect(try profile.exportCandidate() == bytes)
}
