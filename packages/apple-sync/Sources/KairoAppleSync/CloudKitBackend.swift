import CloudKit
import Foundation

/// All calls in this adapter are explicit foreground calls. No provisioning,
/// subscriptions, shared/public database, discovery, or background engine.
struct CloudKitBackend: JournalBackend {
    let container: CKContainer
    let containerIdentifier: String
    let database: CKDatabase

    init(containerIdentifier: String) {
        self.containerIdentifier = containerIdentifier
        self.container = CKContainer(identifier: containerIdentifier)
        self.database = container.privateCloudDatabase
    }

    func accountIdentity() async throws -> CloudAccountIdentity {
        do {
            try Task.checkCancellation()
            try Self.requireAvailable(try await container.accountStatus())
            let id = try await container.userRecordID()
            try Task.checkCancellation()
            return try CloudAccountIdentity(containerIdentifier: containerIdentifier, userRecordName: id.recordName)
        } catch { throw Self.failure(error) }
    }

    static func requireAvailable(_ status: CKAccountStatus) throws {
        guard status == .available else { throw JournalError.accountUnavailable }
    }

    static func failure(_ error: Error) -> JournalError {
        if error is CancellationError { return .cancelled }
        if let error = error as? JournalError { return error }
        guard let error = error as? CKError else { return .transportUnavailable }
        switch error.code {
        case .notAuthenticated, .accountTemporarilyUnavailable: return .accountUnavailable
        case .changeTokenExpired: return .checkpointExpired
        case .zoneNotFound, .userDeletedZone: return .journalReset
        case .operationCancelled: return .cancelled
        default: return .transportUnavailable
        }
    }

    func save(_ envelopes: [JournalEnvelope], scope: JournalScope, zoneName: String,
              limits: JournalLimits) async throws -> [String: RecordSaveResult] {
        do {
            try Task.checkCancellation()
            let expected = Dictionary(uniqueKeysWithValues: envelopes.map {
                (CloudKitRecordCodec.recordID($0.reference.opId, zoneName: zoneName), $0)
            })
            // Each CKRecord is NEW with no fetched change tag. Never mutate a
            // server copy or retry a conflicting record as an overwrite.
            let response = try await database.modifyRecords(
                saving: envelopes.map { CloudKitRecordCodec.encode($0, zoneName: zoneName) },
                deleting: [], savePolicy: .ifServerRecordUnchanged, atomically: false)
            try Task.checkCancellation()
            guard response.deleteResults.isEmpty else { throw JournalError.invalidResponse }
            return try await CloudKitSaveAdmission.admit(response.saveResults, expected: expected,
                scope: scope, zoneName: zoneName, limits: limits) { id in
                    try await database.record(for: id)
                }
        } catch { throw Self.failure(error) }
    }

    func changes(since token: Data?, scope: JournalScope, zoneName: String,
                 limit: Int, limits: JournalLimits) async throws -> BackendPage {
        do {
            try Task.checkCancellation()
            let previous = try token.map { try CloudKitTokenCodec.decode($0, maxBytes: limits.maxCursorBytes) }
            let response = try await database.recordZoneChanges(inZoneWith: CloudKitRecordCodec.zoneID(zoneName),
                since: previous, desiredKeys: nil, resultsLimit: limit)
            try Task.checkCancellation()
            guard response.deletions.isEmpty else { throw JournalError.physicalDeletion }
            guard response.modificationResultsByID.count <= limit else { throw JournalError.limitsExceeded }
            var records: [String: Result<JournalEnvelope, JournalError>] = [:]
            for (id, result) in response.modificationResultsByID {
                guard id.zoneID == CloudKitRecordCodec.zoneID(zoneName), id.recordName.hasPrefix("op-") else { throw JournalError.wrongScope }
                let opID = String(id.recordName.dropFirst(3))
                switch result {
                case .success(let modification):
                    guard modification.record.recordID == id else { throw JournalError.invalidResponse }
                    do { records[opID] = .success(try CloudKitRecordCodec.decode(modification.record,
                        scope: scope, zoneName: zoneName, maxBytes: limits.maxEnvelopeBytes)) }
                    catch { records[opID] = .failure(Self.failure(error)) }
                case .failure(let error): records[opID] = .failure(Self.failure(error))
                }
            }
            return BackendPage(records: records, deletionIDs: [],
                token: try CloudKitTokenCodec.encode(response.changeToken, maxBytes: limits.maxCursorBytes), hasMore: response.moreComing)
        } catch { throw Self.failure(error) }
    }
}
