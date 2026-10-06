import Foundation
import CoreFoundation

/// Fixed protocol failures only. Neither payloads nor provider diagnostics are errors.
public enum JournalRPCError: String, Error, Sendable {
    case invalidFrame = "invalid-frame", limitsExceeded = "limits-exceeded"
    case sessionRequired = "session-required", wrongConnection = "wrong-connection"
    case staleSession = "stale-session", busy, cancelled, connectionLost = "connection-lost"
    case ioFailure = "io-failure", transportUnavailable = "transport-unavailable"
}

public struct JournalRPCLimits: Sendable {
    public let journal: JournalLimits
    public let maxFrameBytes: Int
    public let maxChunkBytes: Int
    public let maxQueuedFrames: Int
    public init(journal: JournalLimits = try! JournalLimits(), maxFrameBytes: Int = 2 * 1024 * 1024,
                maxChunkBytes: Int = 64 * 1024, maxQueuedFrames: Int = 4) throws {
        guard (1024...2 * 1024 * 1024).contains(maxFrameBytes),
              (1...64 * 1024).contains(maxChunkBytes), (1...4).contains(maxQueuedFrames) else {
            throw JournalRPCError.limitsExceeded
        }
        self.journal = journal; self.maxFrameBytes = maxFrameBytes
        self.maxChunkBytes = maxChunkBytes; self.maxQueuedFrames = maxQueuedFrames
    }
}

public struct JournalRPCSessionDescriptor: Sendable, Equatable {
    public let leaseId: String
    public let scope: JournalScope
    public let channelId: String
}

struct RPCRequest {
    let id: String
    let sequence: UInt64
    let method: String
    let params: [String: Any]
}

func rpcKeys(_ value: [String: Any], _ keys: Set<String>) throws {
    guard Set(value.keys) == keys else { throw JournalRPCError.invalidFrame }
}
func rpcID(_ raw: Any?) throws -> (String, UInt64) {
    guard let text = raw as? String, !text.isEmpty, text.utf8.count <= 16,
          text.utf8.first != 48, text.utf8.allSatisfy({ (48...57).contains($0) }),
          let number = UInt64(text), number <= 9_007_199_254_740_991 else {
        throw JournalRPCError.invalidFrame
    }
    return (text, number)
}
func rpcInteger(_ raw: Any?, range: ClosedRange<Int>) throws -> Int {
    guard let number = raw as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
          number.doubleValue.isFinite, number.doubleValue.rounded() == number.doubleValue,
          number.doubleValue >= Double(range.lowerBound), number.doubleValue <= Double(range.upperBound) else {
        throw JournalRPCError.invalidFrame
    }
    return number.intValue
}
func rpcLease(_ raw: Any?) throws -> String {
    guard let text = raw as? String, let uuid = UUID(uuidString: text),
          uuid.uuidString.lowercased() == text else { throw JournalRPCError.invalidFrame }
    return text
}
func rpcEncode(_ value: [String: Any], limit: Int) throws -> Data {
    guard JSONSerialization.isValidJSONObject(value) else { throw JournalRPCError.invalidFrame }
    let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .withoutEscapingSlashes])
    guard data.count <= limit else { throw JournalRPCError.limitsExceeded }
    return data
}
func rpcErrorCode(_ error: any Error) -> String {
    if error is CancellationError { return JournalRPCError.cancelled.rawValue }
    if let value = error as? JournalRPCError { return value.rawValue }
    if let value = error as? JournalError { return value.rawValue }
    return JournalRPCError.transportUnavailable.rawValue
}
func rpcReply(id: String, method: String, lease: String?, result: [String: Any]? = nil,
              error: String? = nil, limit: Int) throws -> Data {
    var row: [String: Any] = ["format": "kairo-journal-rpc", "v": 1, "type": "reply",
        "id": id, "method": method, "leaseId": lease as Any? ?? NSNull(), "ok": error == nil]
    if let error { row["error"] = ["code": error] } else { row["result"] = result ?? [:] }
    return try rpcEncode(row, limit: limit)
}
func rpcReference(_ ref: OperationReference) -> [String: String] { ["opId": ref.opId, "sha256": ref.sha256] }

/// Scan before Foundation recursively decodes. Operation bodies remain strings.
/// Duplicate escaped keys, malformed scalar Unicode, depth and nodes fail closed.
private struct RPCJSONScanner {
    let bytes: [UInt8]
    var at = 0
    var nodes = 0
    mutating func whitespace() { while at < bytes.count && [9, 10, 13, 32].contains(bytes[at]) { at += 1 } }
    mutating func take(_ byte: UInt8) throws {
        whitespace(); guard at < bytes.count, bytes[at] == byte else { throw JournalRPCError.invalidFrame }; at += 1
    }
    mutating func string() throws -> String {
        whitespace(); let start = at
        guard at < bytes.count, bytes[at] == 34 else { throw JournalRPCError.invalidFrame }
        at += 1
        while at < bytes.count {
            let byte = bytes[at]; at += 1
            if byte == 34 {
                let raw = Data(bytes[start..<at])
                guard let value = try? JSONSerialization.jsonObject(with: raw, options: [.fragmentsAllowed]) as? String else {
                    throw JournalRPCError.invalidFrame
                }
                return value
            }
            guard byte >= 32 else { throw JournalRPCError.invalidFrame }
            if byte == 92 {
                guard at < bytes.count else { throw JournalRPCError.invalidFrame }
                at += 1
            }
        }
        throw JournalRPCError.invalidFrame
    }
    mutating func value(depth: Int) throws {
        nodes += 1
        guard depth <= 8, nodes <= 2048 else { throw JournalRPCError.limitsExceeded }
        whitespace(); guard at < bytes.count else { throw JournalRPCError.invalidFrame }
        switch bytes[at] {
        case 123:
            at += 1; whitespace(); var keys = Set<Data>()
            if at < bytes.count, bytes[at] == 125 { at += 1; return }
            while true {
                let key = try string(); nodes += 1
                guard nodes <= 2048, keys.insert(Data(key.utf8)).inserted else { throw JournalRPCError.invalidFrame }
                try take(58); try value(depth: depth + 1); whitespace()
                guard at < bytes.count else { throw JournalRPCError.invalidFrame }
                if bytes[at] == 125 { at += 1; return }
                try take(44)
            }
        case 91:
            at += 1; whitespace()
            if at < bytes.count, bytes[at] == 93 { at += 1; return }
            while true {
                try value(depth: depth + 1); whitespace()
                guard at < bytes.count else { throw JournalRPCError.invalidFrame }
                if bytes[at] == 93 { at += 1; return }
                try take(44)
            }
        case 34: _ = try string()
        default:
            let start = at
            while at < bytes.count, ![9, 10, 13, 32, 44, 93, 125].contains(bytes[at]) { at += 1 }
            guard at > start else { throw JournalRPCError.invalidFrame }
            let raw = Data(bytes[start..<at])
            guard (try? JSONSerialization.jsonObject(with: raw, options: [.fragmentsAllowed])) != nil else {
                throw JournalRPCError.invalidFrame
            }
        }
    }
}

func rpcParse(_ data: Data, limits: JournalRPCLimits) throws -> RPCRequest {
    guard !data.isEmpty, data.count <= limits.maxFrameBytes else { throw JournalRPCError.limitsExceeded }
    guard String(data: data, encoding: .utf8) != nil else { throw JournalRPCError.invalidFrame }
    var scanner = RPCJSONScanner(bytes: Array(data)); try scanner.value(depth: 0); scanner.whitespace()
    guard scanner.at == scanner.bytes.count,
          let row = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw JournalRPCError.invalidFrame }
    try rpcKeys(row, ["format", "v", "id", "method", "params"])
    guard row["format"] as? String == "kairo-journal-rpc", try rpcInteger(row["v"], range: 1...1) == 1,
          let method = row["method"] as? String, ["describe", "push", "pull", "cancel"].contains(method),
          let params = row["params"] as? [String: Any] else { throw JournalRPCError.invalidFrame }
    let (id, sequence) = try rpcID(row["id"])
    switch method {
    case "describe": try rpcKeys(params, [])
    case "push":
        try rpcKeys(params, ["leaseId", "envelopes"]); _ = try rpcLease(params["leaseId"])
        guard let rows = params["envelopes"] as? [[String: Any]], !rows.isEmpty,
              rows.count <= limits.journal.maxOperations else { throw JournalRPCError.limitsExceeded }
    case "pull":
        try rpcKeys(params, ["leaseId", "checkpoint", "limit"]); _ = try rpcLease(params["leaseId"])
        _ = try rpcInteger(params["limit"], range: 1...limits.journal.maxOperations)
        guard params["checkpoint"] is NSNull || params["checkpoint"] is String else { throw JournalRPCError.invalidFrame }
        if let text = params["checkpoint"] as? String {
            guard !text.isEmpty, text.utf8.count <= limits.journal.maxCursorBytes else { throw JournalRPCError.limitsExceeded }
        }
    case "cancel": try rpcKeys(params, ["targetId"]); _ = try rpcID(params["targetId"])
    default: throw JournalRPCError.invalidFrame
    }
    return RPCRequest(id: id, sequence: sequence, method: method, params: params)
}

func rpcEnvelopes(_ raw: Any?, scope: JournalScope, limits: JournalLimits) throws -> [JournalEnvelope] {
    guard let rows = raw as? [[String: Any]], !rows.isEmpty, rows.count <= limits.maxOperations else { throw JournalRPCError.limitsExceeded }
    var result: [JournalEnvelope] = []; var total = 0; var seen = Set<String>()
    for row in rows {
        try rpcKeys(row, ["reference", "canonicalBase64"])
        guard let ref = row["reference"] as? [String: Any] else { throw JournalRPCError.invalidFrame }
        try rpcKeys(ref, ["opId", "sha256"])
        guard let id = ref["opId"] as? String, let sha = ref["sha256"] as? String,
              let text = row["canonicalBase64"] as? String,
              text.utf8.count <= 4 * ((limits.maxEnvelopeBytes + 2) / 3),
              !text.isEmpty, text.utf8.count % 4 == 0 else { throw JournalRPCError.invalidFrame }
        let padding = text.hasSuffix("==") ? 2 : text.hasSuffix("=") ? 1 : 0
        let decodedCount = text.utf8.count / 4 * 3 - padding
        guard decodedCount <= limits.maxEnvelopeBytes, total + decodedCount <= limits.maxBatchBytes,
              seen.insert(id).inserted else { throw JournalRPCError.limitsExceeded }
        guard let bytes = Data(base64Encoded: text), bytes.count == decodedCount,
              bytes.base64EncodedString() == text else { throw JournalRPCError.invalidFrame }
        total += decodedCount
        let reference = try OperationReference(opId: id, sha256: sha)
        result.append(try JournalEnvelope(reference: reference, bytes: bytes, scope: scope, maxBytes: limits.maxEnvelopeBytes))
    }
    return result
}
