import CoreFoundation
import Foundation

/// Only the inherited native owner control channel decodes this candidate.
/// Its binding is echoed for owner comparison; it grants nothing by itself.
public struct NativeBootstrapControlRequest: Sendable {
    public let requestID: UUID
    public let connectionID: UUID
    public let containerIdentifier: String
    public let keychainService: String
    public let profile: NativeSyncProfile
    public let localSessionID: String
    public static let limits = try! JournalRPCLimits(maxFrameBytes: 16384, maxChunkBytes: 16384, maxQueuedFrames: 1)

    public static func decode(_ bytes: Data) throws -> Self {
        let row = try controlObject(bytes)
        try keys(row, ["format", "v", "type", "requestId", "connectionId", "containerIdentifier", "keychainService", "profileLabel", "binding"])
        try header(row, type: "connect")
        let requestID = try uuid(row["requestId"]); let connectionID = try uuid(row["connectionId"])
        guard let binding = row["binding"] as? [String: Any] else { throw NativeBootstrapError.invalidControl }
        try keys(binding, ["accountId", "learnerId", "sessionId"])
        let scope = try JournalScope(accountID: string(binding["accountId"]), learnerID: string(binding["learnerId"]))
        let container = try string(row["containerIdentifier"])
        guard container.hasPrefix("iCloud.") else { throw NativeBootstrapError.invalidConfiguration }
        return try Self(requestID: requestID, connectionID: connectionID, containerIdentifier: container,
            keychainService: string(row["keychainService"]),
            profile: NativeSyncProfile(scope: scope, label: string(row["profileLabel"])),
            localSessionID: string(binding["sessionId"]))
    }
    public func validateRevocation(_ bytes: Data) throws {
        let row = try controlObject(bytes)
        try Self.keys(row, ["format", "v", "type", "requestId", "connectionId"])
        try Self.header(row, type: "revoke")
        guard try Self.uuid(row["requestId"]) == requestID,
              try Self.uuid(row["connectionId"]) == connectionID else { throw NativeBootstrapError.invalidControl }
    }
    public func ready(_ connection: NativeCloudSyncConnection) throws -> Data {
        guard connection.isCurrent, connection.connectionID == connectionID,
              connection.descriptor.scope == profile.scope else { throw NativeBootstrapError.staleChallenge }
        var row = base(type: "ready")
        row["binding"] = ["accountId": profile.scope.accountID, "learnerId": profile.scope.learnerID, "sessionId": localSessionID]
        row["channelId"] = connection.descriptor.channelId; row["leaseId"] = connection.descriptor.leaseId
        return try Self.encode(row)
    }
    public func revoked(_ reason: JournalRPCInvalidationReason) throws -> Data {
        var row = base(type: "revoked"); row["code"] = reason.rawValue; return try Self.encode(row)
    }
    public func failure(_ error: any Error) throws -> Data {
        var row = base(type: "error"); row["code"] = Self.errorCode(error); return try Self.encode(row)
    }
    public static func invalidRequest(_ error: any Error) throws -> Data {
        try encode(["format": "kairo-native-bootstrap", "v": 1, "type": "error",
            "requestId": NSNull(), "connectionId": NSNull(), "code": errorCode(error)])
    }
    private func base(type: String) -> [String: Any] {
        ["format": "kairo-native-bootstrap", "v": 1, "type": type,
         "requestId": requestID.uuidString.lowercased(), "connectionId": connectionID.uuidString.lowercased()]
    }
    private static func errorCode(_ error: any Error) -> String {
        if let error = error as? NativeBootstrapError { return error.rawValue }
        if let error = error as? JournalError { return error.rawValue }
        if let error = error as? JournalRPCError { return error.rawValue }
        if error is CancellationError { return "cancelled" }
        return "transport-unavailable"
    }
    private static func encode(_ value: [String: Any]) throws -> Data {
        try rpcEncode(value, limit: limits.maxFrameBytes)
    }
    private static func string(_ value: Any?) throws -> String {
        guard let value = value as? String, validID(value) else { throw NativeBootstrapError.invalidControl }
        return value
    }
    private static func uuid(_ value: Any?) throws -> UUID {
        guard let value = value as? String, let uuid = UUID(uuidString: value),
              uuid.uuidString.lowercased() == value else { throw NativeBootstrapError.invalidControl }
        return uuid
    }
    private static func keys(_ row: [String: Any], _ keys: Set<String>) throws {
        guard Set(row.keys) == keys else { throw NativeBootstrapError.invalidControl }
    }
    private static func header(_ row: [String: Any], type: String) throws {
        guard row["format"] as? String == "kairo-native-bootstrap", row["type"] as? String == type,
              let number = row["v"] as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(), number == 1 else {
            throw NativeBootstrapError.invalidControl
        }
    }
}

// A bounded nonrecursive vocabulary: objects, strings, and integer 1 only.
// Detect duplicate decoded keys before Foundation's dictionary parser can hide
// them. No RPC payload, path, URL, executable or authorization flag is accepted.
private struct NativeControlScanner {
    let bytes: [UInt8]
    var at = 0
    mutating func space() { while at < bytes.count && [9, 10, 13, 32].contains(bytes[at]) { at += 1 } }
    mutating func take(_ byte: UInt8) throws {
        space(); guard at < bytes.count, bytes[at] == byte else { throw NativeBootstrapError.invalidControl }; at += 1
    }
    mutating func string() throws -> String {
        space(); let start = at; try take(34)
        while at < bytes.count {
            let byte = bytes[at]; at += 1
            if byte == 34 {
                guard let text = try? JSONSerialization.jsonObject(with: Data(bytes[start..<at]), options: [.fragmentsAllowed]) as? String else {
                    throw NativeBootstrapError.invalidControl
                }
                return text
            }
            guard byte >= 32 else { throw NativeBootstrapError.invalidControl }
            if byte == 92 { guard at < bytes.count else { throw NativeBootstrapError.invalidControl }; at += 1 }
        }
        throw NativeBootstrapError.invalidControl
    }
    mutating func object(depth: Int) throws {
        guard depth <= 2 else { throw NativeBootstrapError.invalidControl }
        try take(123); space(); var keys = Set<Data>()
        if at < bytes.count, bytes[at] == 125 { at += 1; return }
        while true {
            let key = try string()
            guard keys.count < 16, keys.insert(Data(key.utf8)).inserted else { throw NativeBootstrapError.invalidControl }
            try take(58); space(); guard at < bytes.count else { throw NativeBootstrapError.invalidControl }
            switch bytes[at] {
            case 34: _ = try string()
            case 123: try object(depth: depth + 1)
            case 49: at += 1
            default: throw NativeBootstrapError.invalidControl
            }
            space(); guard at < bytes.count else { throw NativeBootstrapError.invalidControl }
            if bytes[at] == 125 { at += 1; return }
            try take(44)
        }
    }
}
private func controlObject(_ data: Data) throws -> [String: Any] {
    guard !data.isEmpty, data.count <= 16384, String(data: data, encoding: .utf8) != nil else {
        throw NativeBootstrapError.invalidControl
    }
    var scanner = NativeControlScanner(bytes: Array(data)); try scanner.object(depth: 1); scanner.space()
    guard scanner.at == scanner.bytes.count,
          let row = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw NativeBootstrapError.invalidControl }
    return row
}
