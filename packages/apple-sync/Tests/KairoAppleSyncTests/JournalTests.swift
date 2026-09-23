import CloudKit
import Foundation
import Testing
@testable import KairoAppleSync

private let scope = try! JournalScope(accountID: "account-a", learnerID: "learner-a")
private let account = try! CloudAccountIdentity(containerIdentifier: "iCloud.example.synthetic", userRecordName: "synthetic-user-record")
private struct OperationFixture: Decodable {
    let name: String
    let opId: String
    let sha256: String
    let envelopeBase64: String
}
private func fixture(_ name: String = "first", expectedScope: JournalScope = scope) throws -> JournalEnvelope {
    let url = Bundle.module.url(forResource: "operations", withExtension: "json", subdirectory: "Fixtures")!
    let rows = try JSONDecoder().decode([OperationFixture].self, from: Data(contentsOf: url))
    let row = rows.first { $0.name == name }!
    return try JournalEnvelope(reference: OperationReference(opId: row.opId, sha256: row.sha256),
        bytes: Data(base64Encoded: row.envelopeBase64)!, scope: expectedScope)
}

private actor Gate {
    private var started = false
    private var released = false
    private var waiters: [CheckedContinuation<Void, Never>] = []
    private var startWaiters: [CheckedContinuation<Void, Never>] = []
    func hold() async {
        started = true
        for waiter in startWaiters { waiter.resume() }
        startWaiters = []
        if !released { await withCheckedContinuation { waiters.append($0) } }
    }
    func waitUntilStarted() async {
        if !started { await withCheckedContinuation { startWaiters.append($0) } }
    }
    func release() {
        released = true
        for waiter in waiters { waiter.resume() }
        waiters = []
    }
}
private actor Counter {
    var value = 0
    func increment() { value += 1 }
}
private actor ScopePermission {
    var allowed = true
    func revoke() { allowed = false }
}
private actor SyntheticBackend: JournalBackend {
    var currentAccount = account
    var accountError: JournalError?
    var transportError: JournalError?
    var stored: [String: JournalEnvelope] = [:]
    var saveOverride: [String: RecordSaveResult]?
    var page = BackendPage(records: [:], deletionIDs: [], token: Data("opaque-token-1".utf8), hasMore: false)
    var gate: Gate?
    var saveCalls = 0
    var pullCalls = 0
    var accountCalls = 0
    var receivedTokens: [Data?] = []

    func setAccount(_ value: CloudAccountIdentity) { currentAccount = value }
    func setAccountError(_ value: JournalError?) { accountError = value }
    func setTransportError(_ value: JournalError?) { transportError = value }
    func setSaved(_ value: [String: RecordSaveResult]?) { saveOverride = value }
    func setPage(_ value: BackendPage) { page = value }
    func setGate(_ value: Gate?) { gate = value }
    func accountIdentity() async throws -> CloudAccountIdentity {
        accountCalls += 1
        if let accountError { throw accountError }
        return currentAccount
    }
    func save(_ envelopes: [JournalEnvelope], scope: JournalScope, zoneName: String,
              limits: JournalLimits) async throws -> [String: RecordSaveResult] {
        saveCalls += 1
        if let transportError { throw transportError }
        var results: [String: RecordSaveResult] = [:]
        for envelope in envelopes {
            if let existing = stored[envelope.reference.opId] { results[envelope.reference.opId] = .existing(existing) }
            else { stored[envelope.reference.opId] = envelope; results[envelope.reference.opId] = .saved(envelope) }
        }
        await gate?.hold()
        return saveOverride ?? results
    }
    func changes(since token: Data?, scope: JournalScope, zoneName: String,
                 limit: Int, limits: JournalLimits) async throws -> BackendPage {
        pullCalls += 1
        receivedTokens.append(token)
        if let transportError { throw transportError }
        let captured = page
        await gate?.hold()
        return captured
    }
}
private func transport(_ backend: SyntheticBackend, limits: JournalLimits = try! JournalLimits(), fence: SessionFence = SessionFence()) -> ForegroundJournalTransport {
    ForegroundJournalTransport(backend: backend, limits: limits, fence: fence) { identity, requested in
        identity == account && requested == scope
    }
}
private func requireError(_ expected: JournalError, _ work: () async throws -> Void) async {
    do { try await work(); Issue.record("Expected fixed error code \(expected.rawValue)") }
    catch { #expect((error as? JournalError) == expected) }
}

@Suite("CloudKit foreground journal — no-network fixtures, real SDK codec")
struct JournalTests {
    @Test(arguments: ["unicode-account", "unicode-learner"])
    func canonicallyEquivalentUnicodeIDsRemainDistinctOpaqueProfiles(variant: String) async throws {
        let composed = try JournalScope(accountID: "account-\u{e9}", learnerID: "learner-\u{e9}")
        let different = try JournalScope(accountID: variant == "unicode-account" ? "account-e\u{301}" : composed.accountID,
            learnerID: variant == "unicode-learner" ? "learner-e\u{301}" : composed.learnerID)
        let allowed: Set<JournalScope> = [composed]
        let one = try fixture("unicode-composed", expectedScope: composed)
        let other = try fixture(variant, expectedScope: different)
        #expect(one.reference.opId != other.reference.opId)
        #expect(composed != different)
        #expect(!allowed.contains(different))
        #expect(throws: JournalError.wrongScope) { try JournalEnvelope(reference: one.reference, bytes: one.bytes, scope: different) }
        #expect(throws: JournalError.wrongScope) { try JournalEnvelope(reference: other.reference, bytes: other.bytes, scope: composed) }
        let backend = SyntheticBackend()
        let native = ForegroundJournalTransport(backend: backend) { identity, requested in
            identity == account && allowed.contains(requested)
        }
        let session = try await native.openSession(for: composed)
        await requireError(.unauthorizedScope) { _ = try await native.openSession(for: different) }
        #expect(await backend.saveCalls == 0)
        let cursor = try JournalCursorCodec.encode(token: Data("opaque".utf8), session: session, maxBytes: 8192)
        let otherScope = JournalSession(id: session.id, scope: different, account: account,
            channelID: session.channelID, epoch: session.epoch)
        #expect(throws: JournalError.invalidCursor) { try JournalCursorCodec.decode(cursor, session: otherScope, maxBytes: 8192) }
        let both: Set<JournalScope> = [composed, different]
        #expect(both.count == 2)
        let authorized = ForegroundJournalTransport(backend: backend) { identity, requested in
            identity == account && both.contains(requested)
        }
        let firstSession = try await authorized.openSession(for: composed)
        let secondSession = try await authorized.openSession(for: different)
        #expect(firstSession.channelID != secondSession.channelID)
    }

    @Test(arguments: [CKAccountStatus.couldNotDetermine, .restricted, .noAccount, .temporarilyUnavailable])
    func unavailableSDKAccountStatusesCannotEstablishACloudIdentity(status: CKAccountStatus) {
        #expect(throws: JournalError.accountUnavailable) { try CloudKitBackend.requireAvailable(status) }
        #expect(CloudKitBackend.failure(CKError(.notAuthenticated)) == .accountUnavailable)
        #expect(CloudKitBackend.failure(CKError(.accountTemporarilyUnavailable)) == .accountUnavailable)
    }

    @Test func actualSDKSaveResultAdmissionPreservesPartialsAndProvesImmutableDuplicates() async throws {
        let one = try fixture(); let two = try fixture("second"); let conflict = try fixture("conflict")
        let firstRecord = CloudKitRecordCodec.encode(one, zoneName: "sdk-fixture")
        let secondRecord = CloudKitRecordCodec.encode(two, zoneName: "sdk-fixture")
        let conflictRecord = CloudKitRecordCodec.encode(conflict, zoneName: "sdk-fixture")
        let expected = [firstRecord.recordID: one, secondRecord.recordID: two]
        let reads = Counter()
        func admit(_ results: [CKRecord.ID: Result<CKRecord, any Error>]) async throws -> [String: RecordSaveResult] {
            try await CloudKitSaveAdmission.admit(results, expected: expected, scope: scope,
                zoneName: "sdk-fixture", limits: JournalLimits()) { id in
                    await reads.increment()
                    guard id == firstRecord.recordID else { throw JournalError.invalidResponse }
                    return firstRecord
                }
        }
        let partial = try await admit([firstRecord.recordID: .success(firstRecord),
            secondRecord.recordID: .failure(CKError(.networkUnavailable))])
        var savedExact = false
        if case .saved(let value) = partial[one.reference.opId] { savedExact = value == one }
        #expect(savedExact)
        if case .failed(let code) = partial[two.reference.opId] { #expect(code == .transportUnavailable) }
        else { Issue.record("Expected fixed per-record failure") }
        let supplied = CKError(.serverRecordChanged, userInfo: [CKRecordChangedErrorServerRecordKey: firstRecord])
        let duplicate = try await admit([firstRecord.recordID: .failure(supplied)])
        var duplicateExact = false
        if case .existing(let value) = duplicate[one.reference.opId] { duplicateExact = value == one }
        #expect(duplicateExact); #expect(await reads.value == 0)
        let changed = CKError(.serverRecordChanged, userInfo: [CKRecordChangedErrorServerRecordKey: conflictRecord])
        let rejected = try await admit([firstRecord.recordID: .failure(changed)])
        if case .failed(let code) = rejected[one.reference.opId] { #expect(code == .conflictingOperation) }
        else { Issue.record("Expected immutable-operation conflict") }
        #expect(await reads.value == 0)
        let fetched = try await admit([firstRecord.recordID: .failure(CKError(.serverRecordChanged))])
        var fetchedExact = false
        if case .existing(let value) = fetched[one.reference.opId] { fetchedExact = value == one }
        #expect(fetchedExact); #expect(await reads.value == 1)
        #expect(try await admit([:]).isEmpty)
        let mismatched = try await admit([firstRecord.recordID: .success(secondRecord)])
        if case .failed(let code) = mismatched[one.reference.opId] { #expect(code == .invalidResponse) }
        else { Issue.record("Expected record-identity rejection") }
        let foreignID = CloudKitRecordCodec.recordID(String(repeating: "0", count: 64), zoneName: "sdk-fixture")
        await requireError(.invalidResponse) { _ = try await admit([foreignID: .success(firstRecord)]) }
        let sensitiveError = NSError(domain: "synthetic-only", code: 99,
            userInfo: [NSLocalizedDescriptionKey: "private diagnostic must not be returned"])
        #expect(CloudKitBackend.failure(sensitiveError) == .transportUnavailable)
    }

    @Test func canonicalTypeScriptEnvelopeAndEncryptedSDKRecordRoundTrip() throws {
        let original = try fixture()
        let record = CloudKitRecordCodec.encode(original, zoneName: "synthetic-zone")
        #expect(record.recordChangeTag == nil)
        #expect(record[CloudKitRecordCodec.envelopeField] == nil)
        #expect(record[CloudKitRecordCodec.digestField] == nil)
        #expect(record.encryptedValues[CloudKitRecordCodec.envelopeField] as? Data == original.bytes)
        #expect(try CloudKitRecordCodec.decode(record, scope: scope, zoneName: "synthetic-zone", maxBytes: 256 * 1024) == original)
        // Local encryptedValues holds plaintext for the SDK. This is field
        // placement/byte fidelity evidence, not a cryptographic service test.
    }

    @Test func nativeEnvelopeChecksScopeReferenceAndBytesWithoutReimplementingMerge() throws {
        let original = try fixture()
        let foreign = try JournalScope(accountID: "other-account", learnerID: "learner-a")
        #expect(throws: JournalError.wrongScope) { try JournalEnvelope(reference: original.reference, bytes: original.bytes, scope: foreign) }
        #expect(throws: JournalError.invalidEnvelope) { try JournalEnvelope(reference: original.reference, bytes: original.bytes + Data([0]), scope: scope) }
        #expect(throws: JournalError.invalidEnvelope) { try OperationReference(opId: "installation-id", sha256: original.reference.sha256) }
        let renamed = try OperationReference(opId: String(repeating: "0", count: 64), sha256: original.reference.sha256)
        #expect(throws: JournalError.invalidEnvelope) { try JournalEnvelope(reference: renamed, bytes: original.bytes, scope: scope) }
    }

    @Test func encryptedCodecRejectsWrongZonePlaintextMissingCipherFieldAndWrongRecordIdentity() throws {
        let original = try fixture()
        let record = CloudKitRecordCodec.encode(original, zoneName: "zone-a")
        #expect(throws: JournalError.invalidEnvelope) { try CloudKitRecordCodec.decode(record, scope: scope, zoneName: "zone-b", maxBytes: 10000) }
        let plaintext = CKRecord(recordType: CloudKitRecordCodec.recordType, recordID: record.recordID)
        plaintext[CloudKitRecordCodec.envelopeField] = original.bytes as NSData
        plaintext[CloudKitRecordCodec.digestField] = original.reference.sha256 as NSString
        #expect(throws: JournalError.invalidEnvelope) { try CloudKitRecordCodec.decode(plaintext, scope: scope, zoneName: "zone-a", maxBytes: 10000) }
        let other = CKRecord(recordType: CloudKitRecordCodec.recordType,
            recordID: CloudKitRecordCodec.recordID(String(repeating: "0", count: 64), zoneName: "zone-a"))
        other.encryptedValues[CloudKitRecordCodec.envelopeField] = original.bytes as NSData
        other.encryptedValues[CloudKitRecordCodec.digestField] = original.reference.sha256 as NSString
        #expect(throws: JournalError.invalidEnvelope) { try CloudKitRecordCodec.decode(other, scope: scope, zoneName: "zone-a", maxBytes: 10000) }
    }

    @Test func distinguishesCloudAccountAuthenticationFromLearnerScopeAuthorization() async throws {
        let backend = SyntheticBackend()
        let native = transport(backend)
        await backend.setAccountError(.accountUnavailable)
        await requireError(.accountUnavailable) { _ = try await native.openSession(for: scope) }
        await backend.setAccountError(nil)
        let other = try JournalScope(accountID: "local-installation-id", learnerID: "learner-a")
        await requireError(.unauthorizedScope) { _ = try await native.openSession(for: other) }
        let session = try await native.openSession(for: scope)
        #expect(session.account == account)
        #expect(session.scope == scope)
        #expect(session.account.fingerprint != scope.accountID)
        #expect(await backend.saveCalls == 0)
        #expect(await backend.pullCalls == 0)
        #expect(CloudKitBackend.failure(CKError(.notAuthenticated)) == .accountUnavailable)
    }

    @Test func immutableDuplicatesAcknowledgeExactlyAndConflictsNeverOverwrite() async throws {
        let backend = SyntheticBackend(); let native = transport(backend)
        let session = try await native.openSession(for: scope)
        let one = try fixture(); let conflict = try fixture("conflict")
        #expect(try await native.push([one], session: session).accepted == [one.reference])
        #expect(try await native.push([one], session: session).accepted == [one.reference])
        let outcome = try await native.push([conflict], session: session)
        #expect(outcome.accepted.isEmpty)
        #expect(outcome.failures == [one.reference.opId: .conflictingOperation])
        #expect(await backend.stored == [one.reference.opId: one])
    }

    @Test func partialAndMissingPerRecordResultsAcknowledgeOnlyExactSuccessfulReferences() async throws {
        let backend = SyntheticBackend(); let native = transport(backend)
        let session = try await native.openSession(for: scope)
        let one = try fixture(); let two = try fixture("second")
        await backend.setSaved([one.reference.opId: .saved(one), two.reference.opId: .failed(.transportUnavailable)])
        let partial = try await native.push([one, two], session: session)
        #expect(partial.accepted == [one.reference])
        #expect(partial.failures == [two.reference.opId: .transportUnavailable])
        await backend.setSaved([one.reference.opId: .existing(one)])
        let missing = try await native.push([one, two], session: session)
        #expect(missing.accepted == [one.reference])
        #expect(missing.failures == [two.reference.opId: .invalidResponse])
        await backend.setSaved([String(repeating: "0", count: 64): .saved(one)])
        await requireError(.invalidResponse) { _ = try await native.push([one], session: session) }
    }

    @Test func rejectsForeignScopeAndDuplicateBatchBeforeAnyCloudWrite() async throws {
        let backend = SyntheticBackend(); let native = transport(backend)
        let session = try await native.openSession(for: scope); let one = try fixture()
        let foreign = try fixture("foreign", expectedScope: JournalScope(accountID: "other-account", learnerID: "learner-a"))
        await requireError(.wrongScope) { _ = try await native.push([foreign], session: session) }
        await requireError(.invalidInput) { _ = try await native.push([one, one], session: session) }
        #expect(await backend.saveCalls == 0)
    }

    @Test func returnsOpaqueScopedCursorWithoutMutatingCallerCheckpoint() async throws {
        let backend = SyntheticBackend(); let native = transport(backend)
        let session = try await native.openSession(for: scope); let one = try fixture()
        await backend.setPage(BackendPage(records: [one.reference.opId: .success(one)], deletionIDs: [], token: Data("t-1".utf8), hasMore: true))
        let callerCheckpoint: String? = nil
        let page = try await native.pull(checkpoint: callerCheckpoint, limit: 2, session: session)
        #expect(callerCheckpoint == nil)
        #expect(page.envelopes == [one]); #expect(page.hasMore)
        #expect(try JournalCursorCodec.decode(page.nextCheckpoint, session: session, maxBytes: 8192) == Data("t-1".utf8))
        await backend.setPage(BackendPage(records: [:], deletionIDs: [], token: Data("t-2".utf8), hasMore: false))
        _ = try await native.pull(checkpoint: page.nextCheckpoint, limit: 2, session: session)
        #expect(await backend.receivedTokens.last! == Data("t-1".utf8))
    }

    @Test func cursorRejectsTamperingForeignAccountScopeAndArbitraryArchiveBytes() async throws {
        let backend = SyntheticBackend(); let native = transport(backend)
        let session = try await native.openSession(for: scope)
        let cursor = try JournalCursorCodec.encode(token: Data("token".utf8), session: session, maxBytes: 8192)
        let other = JournalSession(id: UUID(), scope: scope,
            account: try CloudAccountIdentity(containerIdentifier: "iCloud.example.synthetic", userRecordName: "other-user"),
            channelID: session.channelID, epoch: session.epoch)
        #expect(throws: JournalError.invalidCursor) { try JournalCursorCodec.decode(cursor, session: other, maxBytes: 8192) }
        let wrongScope = JournalSession(id: UUID(), scope: try JournalScope(accountID: "other", learnerID: "learner-a"), account: account,
            channelID: session.channelID, epoch: session.epoch)
        #expect(throws: JournalError.invalidCursor) { try JournalCursorCodec.decode(cursor, session: wrongScope, maxBytes: 8192) }
        await requireError(.invalidCursor) { _ = try await native.pull(checkpoint: "not-a-token", limit: 2, session: session) }
        #expect(await backend.pullCalls == 0)
        #expect(throws: JournalError.invalidCursor) { try CloudKitTokenCodec.decode(Data([0, 1, 2]), maxBytes: 8192) }
        var bytes = Data(base64Encoded: cursor)!
        bytes[bytes.count - 2] ^= 1
        #expect(throws: JournalError.invalidCursor) { try JournalCursorCodec.decode(bytes.base64EncodedString(), session: session, maxBytes: 8192) }
    }

    @Test(arguments: [JournalError.checkpointExpired, .journalReset, .physicalDeletion])
    func lossOrPhysicalDeletionRequiresRecoveryAndDoesNotReturnAnAdvancedCheckpoint(reason: JournalError) async throws {
        let backend = SyntheticBackend(); let native = transport(backend)
        let session = try await native.openSession(for: scope)
        let checkpoint = try JournalCursorCodec.encode(token: Data("accepted-old-token".utf8), session: session, maxBytes: 8192)
        if reason == .physicalDeletion {
            await backend.setPage(BackendPage(records: [:], deletionIDs: ["deleted-record"], token: Data("unaccepted-new-token".utf8), hasMore: false))
        } else { await backend.setTransportError(reason) }
        await requireError(reason) { _ = try await native.pull(checkpoint: checkpoint, limit: 2, session: session) }
        #expect(try JournalCursorCodec.decode(checkpoint, session: session, maxBytes: 8192) == Data("accepted-old-token".utf8))
        #expect(CloudKitBackend.failure(CKError(.changeTokenExpired)) == .checkpointExpired)
        #expect(CloudKitBackend.failure(CKError(.zoneNotFound)) == .journalReset)
        #expect(CloudKitBackend.failure(CKError(.userDeletedZone)) == .journalReset)
    }

    @Test func failedPerRecordFetchRejectsWholePageInsteadOfSkippingIt() async throws {
        let backend = SyntheticBackend(); let native = transport(backend)
        let session = try await native.openSession(for: scope); let one = try fixture(); let two = try fixture("second")
        await backend.setPage(BackendPage(records: [one.reference.opId: .success(one), two.reference.opId: .failure(.transportUnavailable)],
            deletionIDs: [], token: Data("must-not-commit".utf8), hasMore: false))
        await requireError(.transportUnavailable) { _ = try await native.pull(checkpoint: nil, limit: 2, session: session) }
    }

    @Test(arguments: [true, false])
    func lateSuccessfulResponseAfterInvalidationIsRejected(push: Bool) async throws {
        let backend = SyntheticBackend(); let fence = SessionFence(); let native = transport(backend, fence: fence)
        let session = try await native.openSession(for: scope); let one = try fixture(); let gate = Gate()
        await backend.setGate(gate)
        let task = Task {
            if push { _ = try await native.push([one], session: session) }
            else { _ = try await native.pull(checkpoint: nil, limit: 2, session: session) }
        }
        await gate.waitUntilStarted()
        // Same fence used by the real CKAccountChanged observer, synchronously.
        fence.invalidate()
        await gate.release()
        await requireError(.staleSession) { try await task.value }
        if push { #expect(await backend.stored[one.reference.opId] == one) }
    }

    @Test func authenticAccountSwitchIsDetectedEvenWithoutNotificationAndCancelledResponsesDoNotAcknowledge() async throws {
        let backend = SyntheticBackend(); let native = transport(backend)
        let session = try await native.openSession(for: scope); let one = try fixture()
        await backend.setAccount(try CloudAccountIdentity(containerIdentifier: "iCloud.example.synthetic", userRecordName: "other"))
        await requireError(.staleSession) { _ = try await native.push([one], session: session) }
        #expect(await backend.saveCalls == 0)
        await backend.setAccount(account)
        let next = try await native.openSession(for: scope); let gate = Gate(); await backend.setGate(gate)
        let task = Task { _ = try await native.push([one], session: next) }
        await gate.waitUntilStarted()
        await requireError(.busy) { _ = try await native.pull(checkpoint: nil, limit: 1, session: next) }
        task.cancel(); await gate.release()
        await requireError(.cancelled) { try await task.value }
    }

    @Test func unavailableAccountAfterSessionOpenCannotWrite() async throws {
        let backend = SyntheticBackend(); let native = transport(backend)
        let session = try await native.openSession(for: scope); let one = try fixture()
        await backend.setAccountError(.accountUnavailable)
        await requireError(.accountUnavailable) { _ = try await native.push([one], session: session) }
        #expect(await backend.saveCalls == 0)
    }

    @Test func revokedLearnerAuthorizationDiscardsLateSuccessAndInvalidatesTheLease() async throws {
        let backend = SyntheticBackend(); let permission = ScopePermission()
        let native = ForegroundJournalTransport(backend: backend) { identity, requested in
            let allowed = await permission.allowed
            return identity == account && requested == scope && allowed
        }
        let session = try await native.openSession(for: scope); let one = try fixture(); let gate = Gate()
        await backend.setGate(gate)
        let task = Task { _ = try await native.push([one], session: session) }
        await gate.waitUntilStarted()
        await permission.revoke(); await gate.release()
        await requireError(.unauthorizedScope) { try await task.value }
        await requireError(.staleSession) { _ = try await native.pull(checkpoint: nil, limit: 1, session: session) }
        await requireError(.unauthorizedScope) { _ = try await native.openSession(for: scope) }
        #expect(await backend.pullCalls == 0)
    }

    @Test func countAndByteLimitsRejectWithoutTruncation() async throws {
        let backend = SyntheticBackend(); let one = try fixture(); let two = try fixture("second")
        let native = transport(backend, limits: try JournalLimits(maxOperations: 1, maxEnvelopeBytes: one.bytes.count - 1))
        let session = try await native.openSession(for: scope)
        await requireError(.limitsExceeded) { _ = try await native.push([one], session: session) }
        await requireError(.invalidInput) { _ = try await native.push([one, two], session: session) }
        #expect(await backend.saveCalls == 0)
        let other = transport(backend, limits: try JournalLimits(maxOperations: 1))
        let lease = try await other.openSession(for: scope)
        await backend.setPage(BackendPage(records: [one.reference.opId: .success(one), two.reference.opId: .success(two)],
            deletionIDs: [], token: Data("oversized".utf8), hasMore: false))
        await requireError(.limitsExceeded) { _ = try await other.pull(checkpoint: nil, limit: 1, session: lease) }
        let batch = transport(backend, limits: try JournalLimits(maxBatchBytes: max(1024, one.bytes.count, two.bytes.count)))
        let batchLease = try await batch.openSession(for: scope)
        await requireError(.limitsExceeded) { _ = try await batch.push([one, two], session: batchLease) }
        await requireError(.limitsExceeded) { _ = try await batch.pull(checkpoint: nil, limit: 2, session: batchLease) }
        #expect(await backend.saveCalls == 0)
        #expect(throws: JournalError.limitsExceeded) {
            try JournalCursorCodec.encode(token: Data(repeating: 1, count: 8192), session: batchLease, maxBytes: 8192)
        }
    }
}
