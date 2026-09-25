import CryptoKit
import Foundation

public enum JournalError: String, Error, Sendable, Equatable {
    case invalidInput, wrongScope, invalidEnvelope, conflictingOperation, invalidResponse
    case accountUnavailable, unauthorizedScope, staleSession, busy, cancelled, transportUnavailable
    case invalidCursor, checkpointExpired, journalReset, physicalDeletion, limitsExceeded
}

func digest(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}
func validID(_ value: String) -> Bool {
    !value.isEmpty && value.utf8.count <= 1024 && !value.unicodeScalars.contains { $0.value < 32 }
}
func identicalUTF8(_ left: String, _ right: String) -> Bool {
    left.utf8.elementsEqual(right.utf8)
}
func isDigest(_ value: String) -> Bool {
    value.utf8.count == 64 && value.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
}
func encoded<T: Encodable>(_ value: T) throws -> Data {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    return try encoder.encode(value)
}

public struct JournalScope: Codable, Sendable, Hashable {
    public let accountID: String
    public let learnerID: String
    public init(accountID: String, learnerID: String) throws {
        guard validID(accountID), validID(learnerID) else { throw JournalError.invalidInput }
        self.accountID = accountID
        self.learnerID = learnerID
    }
    // TypeScript IDs are opaque. Swift String's canonical Unicode equality
    // would otherwise authorize distinct composed/decomposed learner profiles.
    public static func == (left: Self, right: Self) -> Bool {
        identicalUTF8(left.accountID, right.accountID) && identicalUTF8(left.learnerID, right.learnerID)
    }
    public func hash(into hasher: inout Hasher) {
        hasher.combine(accountID.utf8.count)
        for byte in accountID.utf8 { hasher.combine(byte) }
        hasher.combine(learnerID.utf8.count)
        for byte in learnerID.utf8 { hasher.combine(byte) }
    }
}

/// Obtained from CloudKit account status and userRecordID, separately from app/local IDs.
public struct CloudAccountIdentity: Sendable, Equatable {
    public let containerIdentifier: String
    public let fingerprint: String
    init(containerIdentifier: String, userRecordName: String) throws {
        guard validID(containerIdentifier), validID(userRecordName) else { throw JournalError.accountUnavailable }
        self.containerIdentifier = containerIdentifier
        self.fingerprint = digest(try encoded([containerIdentifier, userRecordName]))
    }
}

public struct OperationReference: Codable, Sendable, Hashable {
    public let opId: String
    public let sha256: String
    public init(opId: String, sha256: String) throws {
        guard isDigest(opId), isDigest(sha256) else { throw JournalError.invalidEnvelope }
        self.opId = opId
        self.sha256 = sha256
    }
}

/// Exact canonical UTF-8 bytes from the TypeScript sync core, not a native merge model.
public struct JournalEnvelope: Sendable, Equatable {
    public let reference: OperationReference
    public let bytes: Data
    public init(reference: OperationReference, bytes: Data, scope: JournalScope, maxBytes: Int = 256 * 1024) throws {
        guard !bytes.isEmpty, bytes.count <= maxBytes else { throw JournalError.limitsExceeded }
        guard isDigest(reference.opId), isDigest(reference.sha256), digest(bytes) == reference.sha256,
              let root = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              root["format"] as? String == "kairo-sync-operation",
              let version = root["v"] as? NSNumber, CFGetTypeID(version) != CFBooleanGetTypeID(),
              version == 1 || (version == 2 && ["assessment.result/2", "learning.followup/2", "learning.suppress/2"].contains((root["payload"] as? [String: Any])?["kind"] as? String ?? "")),
              root["opId"] as? String == reference.opId,
              let envelopeScope = root["scope"] as? [String: String], envelopeScope.count == 2 else {
            throw JournalError.invalidEnvelope
        }
        guard let accountID = envelopeScope["accountId"], let learnerID = envelopeScope["learnerId"],
              identicalUTF8(accountID, scope.accountID), identicalUTF8(learnerID, scope.learnerID) else {
            throw JournalError.wrongScope
        }
        self.reference = reference
        self.bytes = bytes
    }
}

public struct JournalLimits: Sendable {
    public let maxOperations: Int
    public let maxEnvelopeBytes: Int
    public let maxBatchBytes: Int
    public let maxCursorBytes: Int
    public init(maxOperations: Int = 100, maxEnvelopeBytes: Int = 256 * 1024,
                maxBatchBytes: Int = 1024 * 1024, maxCursorBytes: Int = 8192) throws {
        guard (1...100).contains(maxOperations), (1...256 * 1024).contains(maxEnvelopeBytes),
              (1024...8 * 1024 * 1024).contains(maxBatchBytes), (1024...8192).contains(maxCursorBytes) else {
            throw JournalError.invalidInput
        }
        self.maxOperations = maxOperations
        self.maxEnvelopeBytes = maxEnvelopeBytes
        self.maxBatchBytes = maxBatchBytes
        self.maxCursorBytes = maxCursorBytes
    }
}

public struct JournalSession: Sendable, Equatable {
    public let id: UUID
    public let scope: JournalScope
    public let account: CloudAccountIdentity
    public let channelID: String
    public let epoch: UInt64
}

enum RecordSaveResult: Sendable {
    case saved(JournalEnvelope)
    case existing(JournalEnvelope)
    case failed(JournalError)
}
struct BackendPage: Sendable {
    let records: [String: Result<JournalEnvelope, JournalError>]
    let deletionIDs: [String]
    let token: Data
    let hasMore: Bool
    init(records: [String: Result<JournalEnvelope, JournalError>], deletionIDs: [String], token: Data, hasMore: Bool) {
        self.records = records; self.deletionIDs = deletionIDs; self.token = token; self.hasMore = hasMore
    }
}

/// Internal seam permits no-network fixtures without providing a public fake-auth constructor.
protocol JournalBackend: Sendable {
    func accountIdentity() async throws -> CloudAccountIdentity
    func save(_ envelopes: [JournalEnvelope], scope: JournalScope, zoneName: String,
              limits: JournalLimits) async throws -> [String: RecordSaveResult]
    func changes(since token: Data?, scope: JournalScope, zoneName: String,
                 limit: Int, limits: JournalLimits) async throws -> BackendPage
}

public struct JournalPushResult: Sendable {
    public let accepted: [OperationReference]
    public let failures: [String: JournalError]
}
public struct JournalPullResult: Sendable {
    public let envelopes: [JournalEnvelope]
    /// Commit this opaque cursor only in the same local transaction as these envelopes.
    public let nextCheckpoint: String
    public let hasMore: Bool
}
