import CloudKit
import Foundation

struct CloudKitRecordCodec {
    static let recordType = "KairoJournalOperationV1"
    static let envelopeField = "envelope"
    static let digestField = "envelopeSHA256"

    static func zoneID(_ name: String) -> CKRecordZone.ID {
        CKRecordZone.ID(zoneName: name, ownerName: CKCurrentUserDefaultName)
    }
    static func recordID(_ opID: String, zoneName: String) -> CKRecord.ID {
        CKRecord.ID(recordName: "op-" + opID, zoneID: zoneID(zoneName))
    }
    static func encode(_ envelope: JournalEnvelope, zoneName: String) -> CKRecord {
        let record = CKRecord(recordType: recordType, recordID: recordID(envelope.reference.opId, zoneName: zoneName))
        record.encryptedValues[envelopeField] = envelope.bytes as NSData
        record.encryptedValues[digestField] = envelope.reference.sha256 as NSString
        return record
    }
    static func decode(_ record: CKRecord, scope: JournalScope, zoneName: String, maxBytes: Int) throws -> JournalEnvelope {
        guard record.recordType == recordType, record.recordID.zoneID == zoneID(zoneName),
              record.recordID.recordName.hasPrefix("op-"), record.parent == nil,
              record[envelopeField] == nil, record[digestField] == nil,
              let bytes = record.encryptedValues[envelopeField] as? Data,
              let hash = record.encryptedValues[digestField] as? String else { throw JournalError.invalidEnvelope }
        let opID = String(record.recordID.recordName.dropFirst(3))
        let ref = try OperationReference(opId: opID, sha256: hash)
        return try JournalEnvelope(reference: ref, bytes: bytes, scope: scope, maxBytes: maxBytes)
    }
}

/// Secure-coding token bytes stay opaque; the caller never interprets or updates them.
struct CloudKitTokenCodec {
    static func encode(_ token: CKServerChangeToken, maxBytes: Int) throws -> Data {
        let data: Data
        do { data = try NSKeyedArchiver.archivedData(withRootObject: token, requiringSecureCoding: true) }
        catch { throw JournalError.invalidCursor }
        guard data.count <= maxBytes else { throw JournalError.limitsExceeded }
        return data
    }
    static func decode(_ bytes: Data, maxBytes: Int) throws -> CKServerChangeToken {
        guard !bytes.isEmpty, bytes.count <= maxBytes else { throw JournalError.invalidCursor }
        do {
            guard let token = try NSKeyedUnarchiver.unarchivedObject(ofClass: CKServerChangeToken.self, from: bytes) else {
                throw JournalError.invalidCursor
            }
            return token
        } catch { throw JournalError.invalidCursor }
    }
}
