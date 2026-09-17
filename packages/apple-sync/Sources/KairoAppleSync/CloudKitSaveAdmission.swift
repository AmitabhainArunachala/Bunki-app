import CloudKit
import Foundation

/// Admit the SDK's per-record results. Only the missing-server-copy path may
/// perform a read; a conflict never supplies a record for another write.
enum CloudKitSaveAdmission {
    static func admit(
        _ response: [CKRecord.ID: Result<CKRecord, any Error>],
        expected: [CKRecord.ID: JournalEnvelope],
        scope: JournalScope, zoneName: String, limits: JournalLimits,
        fetchExisting: (CKRecord.ID) async throws -> CKRecord
    ) async throws -> [String: RecordSaveResult] {
        guard Set(response.keys).isSubset(of: Set(expected.keys)) else { throw JournalError.invalidResponse }
        var results: [String: RecordSaveResult] = [:]
        for (id, outcome) in response {
            try Task.checkCancellation()
            guard let original = expected[id] else { throw JournalError.invalidResponse }
            do {
                let record: CKRecord
                let duplicate: Bool
                switch outcome {
                case .success(let saved): record = saved; duplicate = false
                case .failure(let error):
                    guard let cloudError = error as? CKError, cloudError.code == .serverRecordChanged else {
                        throw CloudKitBackend.failure(error)
                    }
                    // The SDK may omit the server copy from a conflict. One
                    // bounded read can prove an exact duplicate after a lost ack.
                    if let server = cloudError.serverRecord { record = server }
                    else { record = try await fetchExisting(id) }
                    duplicate = true
                }
                try Task.checkCancellation()
                guard record.recordID == id else { throw JournalError.invalidResponse }
                let value = try CloudKitRecordCodec.decode(record, scope: scope, zoneName: zoneName,
                    maxBytes: limits.maxEnvelopeBytes)
                guard value == original else { throw JournalError.conflictingOperation }
                results[original.reference.opId] = duplicate ? .existing(value) : .saved(value)
            } catch {
                let code = CloudKitBackend.failure(error)
                if code == .cancelled { throw code }
                results[original.reference.opId] = .failed(code)
            }
        }
        return results
    }
}
