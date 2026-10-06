import Foundation
import KairoIOSHostCore

// One bounded stdin request, one JSON reply. No paths, URLs, credentials or
// account configuration enter the helper; the dialog host supplies bytes.
private struct Request: Decodable {
    let version: Int
    let method: String
    let name: String
    let dataBase64: String
    let firstPage: Int?
    let lastPage: Int?
}
private struct Reply: Encodable {
    let status: String
    var file: NativeFileSummary? = nil
    var document: NativeTextDocument? = nil
    var code: String? = nil
}
private func run() throws -> Reply {
    let limit = 29 * 1024 * 1024
    var input = Data()
    while let chunk = try FileHandle.standardInput.read(upToCount: 64 * 1024), !chunk.isEmpty {
        input.append(chunk)
        guard input.count <= limit else { throw NativeTextExtractionError("request-size") }
    }
    guard let object = try JSONSerialization.jsonObject(with: input) as? [String: Any],
          let method = object["method"] as? String else { throw NativeTextExtractionError("request-shape") }
    let keys = method == "inspect" ? ["version", "method", "name", "dataBase64"]
        : ["version", "method", "name", "dataBase64", "firstPage", "lastPage"]
    guard Set(object.keys) == Set(keys), ["inspect", "extract"].contains(method) else { throw NativeTextExtractionError("request-shape") }
    let request = try JSONDecoder().decode(Request.self, from: input)
    guard request.version == 1, let data = Data(base64Encoded: request.dataBase64),
          data.base64EncodedString() == request.dataBase64 else { throw NativeTextExtractionError("request-data") }
    if method == "inspect" { return Reply(status: "inspected", file: try NativeTextExtractor.inspect(data: data, name: request.name)) }
    guard let first = request.firstPage, let last = request.lastPage else { throw NativeTextExtractionError("page-range") }
    return Reply(status: "extracted", document: try NativeTextExtractor.extract(data: data, name: request.name, firstPage: first, lastPage: last))
}
private let reply: Reply
do { reply = try run() }
catch let error as NativeTextExtractionError { reply = Reply(status: "failed", code: error.code) }
catch { reply = Reply(status: "failed", code: "extraction-failed") }
let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
do {
    let bytes = try encoder.encode(reply)
    if bytes.count > 2 * 1024 * 1024 { print("{\"status\":\"failed\",\"code\":\"response-size\"}") }
    else { FileHandle.standardOutput.write(bytes); FileHandle.standardOutput.write(Data([10])) }
} catch { print("{\"status\":\"failed\",\"code\":\"response-encoding\"}") }
