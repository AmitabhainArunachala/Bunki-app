import CryptoKit
import Foundation

public enum HostError: Error { case invalidArtifact, invalidRequest, unavailable, occupiedPort }

public struct AssetCatalog: Sendable {
    public let root: URL
    public let artifactSHA256: String
    private let files: [String: Entry]

    struct Entry: Decodable, Sendable {
        let path: String
        let bytes: Int
        let sha256: String
    }
    private struct Manifest: Decodable {
        let schemaVersion: Int
        let product: String
        let artifactSha256: String
        let files: [Entry]
    }

    /// The external build step verifies every source and copied asset. Runtime
    /// checks bind the manifest to that build, then each requested file to it.
    public init(root: URL, expectedArtifactSHA256: String, expectedManifestSHA256: String) throws {
        let root = root.standardizedFileURL.resolvingSymlinksInPath()
        let bytes = try Data(contentsOf: root.appendingPathComponent("build-identity.json"))
        guard Self.hash(bytes) == expectedManifestSHA256 else { throw HostError.invalidArtifact }
        let manifest = try JSONDecoder().decode(Manifest.self, from: bytes)
        guard manifest.schemaVersion == 1, manifest.product == "KAIRO",
              manifest.artifactSha256 == expectedArtifactSHA256,
              expectedArtifactSHA256.count == 64, !manifest.files.isEmpty,
              manifest.files.count <= 100_000 else { throw HostError.invalidArtifact }
        var entries: [String: Entry] = [:]
        for entry in manifest.files {
            guard Self.requestPath("/" + entry.path) == entry.path,
                  entry.bytes >= 0, entry.sha256.count == 64,
                  entries[entry.path] == nil else { throw HostError.invalidArtifact }
            entries[entry.path] = entry
        }
        guard ["index.html", "corridor.js", "sw.js", "manifest.webmanifest"].allSatisfy({ entries[$0] != nil })
        else { throw HostError.invalidArtifact }
        entries["build-identity.json"] = Entry(path: "build-identity.json", bytes: bytes.count, sha256: expectedManifestSHA256)
        self.root = root
        artifactSHA256 = manifest.artifactSha256
        files = entries
    }

    public static func hash(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }

    static func requestPath(_ target: String) -> String? {
        guard target.hasPrefix("/"), !target.hasPrefix("//"),
              let path = target.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init)?.removingPercentEncoding,
              !path.contains("\\"), !path.contains("#"),
              path.unicodeScalars.allSatisfy({ $0.value >= 32 && $0.value != 127 }) else { return nil }
        let segments = path.split(separator: "/")
        guard segments.allSatisfy({ !$0.hasPrefix(".") }) else { return nil }
        return segments.isEmpty ? "index.html" : segments.joined(separator: "/")
    }

    func file(_ path: String) throws -> Data? {
        guard let entry = files[path] else { return nil }
        var url = root
        for segment in path.split(separator: "/") {
            url.appendPathComponent(String(segment))
            let values = try url.resourceValues(forKeys: [.isSymbolicLinkKey])
            guard values.isSymbolicLink != true else { throw HostError.invalidArtifact }
        }
        let values = try url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
        guard values.isRegularFile == true, values.fileSize == entry.bytes else { throw HostError.invalidArtifact }
        let data = try Data(contentsOf: url, options: .mappedIfSafe)
        guard data.count == entry.bytes, Self.hash(data) == entry.sha256 else { throw HostError.invalidArtifact }
        return data
    }
}

struct HTTPRequest: Sendable {
    let method: String
    let target: String
    let headers: [String: String]

    init(_ bytes: Data) throws {
        guard bytes.count <= 16_384, let text = String(data: bytes, encoding: .utf8), text.hasSuffix("\r\n\r\n")
        else { throw HostError.invalidRequest }
        let rows = text.components(separatedBy: "\r\n")
        let start = rows[0].split(separator: " ", omittingEmptySubsequences: false)
        guard start.count == 3, ["HTTP/1.1", "HTTP/1.0"].contains(start[2]), !start[0].isEmpty else { throw HostError.invalidRequest }
        method = String(start[0]); target = String(start[1])
        var headers: [String: String] = [:]
        for row in rows.dropFirst().dropLast(2) {
            guard let colon = row.firstIndex(of: ":") else { throw HostError.invalidRequest }
            let key = String(row[..<colon]).lowercased()
            let value = row[row.index(after: colon)...].trimmingCharacters(in: .whitespaces)
            guard !key.isEmpty, key.utf8.allSatisfy({ (97...122).contains($0) || (48...57).contains($0) || $0 == 45 }),
                  headers[key] == nil, value.unicodeScalars.allSatisfy({ $0.value >= 32 && $0.value != 127 }) else { throw HostError.invalidRequest }
            headers[key] = value
        }
        self.headers = headers
    }
}

struct HTTPResponse: Sendable {
    var status: Int
    var headers: [String: String] = [:]
    var body = Data()

    func encoded(headOnly: Bool = false) -> Data {
        let reasons = [200: "OK", 206: "Partial Content", 400: "Bad Request", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 416: "Range Not Satisfiable", 421: "Misdirected Request", 500: "Resource Unavailable"]
        var values = ["Connection": "close", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cross-Origin-Resource-Policy": "same-origin", "Content-Security-Policy": "frame-ancestors 'none'", "Content-Length": String(body.count)]
        for (key, value) in headers { values[key] = value }
        let text = "HTTP/1.1 \(status) \(reasons[status] ?? "Error")\r\n" + values.keys.sorted().map { "\($0): \(values[$0]!)\r\n" }.joined() + "\r\n"
        var data = Data(text.utf8)
        if !headOnly { data.append(body) }
        return data
    }
}

enum AssetHTTP {
    static func response(_ request: HTTPRequest, catalog: AssetCatalog, port: UInt16) -> HTTPResponse {
        guard request.headers["host"]?.lowercased() == "localhost:\(port)" else { return HTTPResponse(status: 421) }
        if let origin = request.headers["origin"], origin != "http://localhost:\(port)" { return HTTPResponse(status: 403) }
        guard ["GET", "HEAD"].contains(request.method) else { return HTTPResponse(status: 405, headers: ["Allow": "GET, HEAD"]) }
        guard request.headers["transfer-encoding"] == nil, request.headers["content-length"].map({ $0 == "0" }) ?? true,
              let path = AssetCatalog.requestPath(request.target) else { return HTTPResponse(status: 400) }
        do {
            guard let data = try catalog.file(path) else { return HTTPResponse(status: 404) }
            var reply = HTTPResponse(status: 200, headers: ["Content-Type": mime(path), "Accept-Ranges": "bytes"], body: data)
            if request.method == "GET", request.headers["if-range"] == nil, let range = request.headers["range"], range.hasPrefix("bytes="), !range.contains(",") {
                guard let bounds = byteRange(range, count: data.count) else {
                    return HTTPResponse(status: 416, headers: ["Content-Range": "bytes */\(data.count)"])
                }
                reply.status = 206
                reply.headers["Content-Range"] = "bytes \(bounds.lowerBound)-\(bounds.upperBound - 1)/\(data.count)"
                reply.body = data.subdata(in: bounds)
            }
            return reply
        } catch { return HTTPResponse(status: 500) }
    }

    static func byteRange(_ text: String, count: Int) -> Range<Int>? {
        guard count > 0, text.hasPrefix("bytes=") else { return nil }
        let parts = text.dropFirst(6).split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 2, !parts.allSatisfy(\.isEmpty), parts.allSatisfy({ $0.utf8.allSatisfy { (48...57).contains($0) } }) else { return nil }
        if parts[0].isEmpty {
            guard let length = UInt64(parts[1]), length > 0 else { return nil }
            return (length >= UInt64(count) ? 0 : count - Int(length))..<count
        }
        guard let first = UInt64(parts[0]), first < UInt64(count) else { return nil }
        let last = parts[1].isEmpty ? UInt64(count - 1) : UInt64(parts[1])
        guard let last, last >= first else { return nil }
        return Int(first)..<(Int(min(last, UInt64(count - 1))) + 1)
    }

    private static func mime(_ path: String) -> String {
        ["html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8", "mjs": "text/javascript; charset=utf-8", "css": "text/css; charset=utf-8", "json": "application/json; charset=utf-8", "webmanifest": "application/manifest+json", "svg": "image/svg+xml", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "gif": "image/gif", "ico": "image/x-icon", "woff": "font/woff", "woff2": "font/woff2", "ttf": "font/ttf", "otf": "font/otf", "wasm": "application/wasm", "mp3": "audio/mpeg", "m4a": "audio/mp4", "aac": "audio/aac", "wav": "audio/wav", "ogg": "audio/ogg", "webm": "audio/webm", "txt": "text/plain; charset=utf-8"][URL(fileURLWithPath: path).pathExtension.lowercased()] ?? "application/octet-stream"
    }
}
