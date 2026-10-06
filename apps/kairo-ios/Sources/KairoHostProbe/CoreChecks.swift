import Foundation
import KairoIOSHostCore
import Network

private enum CheckFailure: Error { case failed(String) }

private final class RawRequest: @unchecked Sendable {
    private let queue = DispatchQueue(label: "app.bunki.ios-host-check.raw")
    private var connection: NWConnection?
    private var continuation: CheckedContinuation<Data, Error>?
    private var received = Data()

    func run(_ text: String, port: UInt16) async throws -> Data {
        try await withCheckedThrowingContinuation { continuation in
            queue.async {
                self.continuation = continuation
                let connection = NWConnection(host: .ipv4(.loopback), port: NWEndpoint.Port(rawValue: port)!, using: .tcp)
                self.connection = connection
                connection.stateUpdateHandler = { [weak self] state in
                    guard let self else { return }
                    if case .failed(let error) = state { self.finish(.failure(error)) }
                    if case .ready = state {
                        connection.send(content: Data(text.utf8), completion: .contentProcessed { error in
                            if let error { self.finish(.failure(error)) } else { self.receive() }
                        })
                    }
                }
                connection.start(queue: self.queue)
                self.queue.asyncAfter(deadline: .now() + 10) { self.finish(.failure(CheckFailure.failed("raw-request-timeout"))) }
            }
        }
    }

    private func receive() {
        connection?.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { [weak self] data, _, complete, error in
            guard let self else { return }
            if let data { self.received.append(data) }
            if let error { self.finish(.failure(error)) }
            else if complete { self.finish(.success(self.received)) }
            else { self.receive() }
        }
    }

    private func finish(_ result: Result<Data, Error>) {
        let old = continuation; continuation = nil
        connection?.cancel(); connection = nil
        old?.resume(with: result)
    }
}

enum CoreChecks {
    static func run() async -> [String: Any] {
        var passed: [String] = []
        var current = "fixture"
        let root = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".dharma/bunki/ios-host/fixtures/\(UUID().uuidString)")
        var server: LoopbackServer?
        defer { server?.stop(); try? FileManager.default.removeItem(at: root) }
        do {
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            let values = ["index.html": Data("<!doctype html><title>KAIRO fixture</title>".utf8),
                          "corridor.js": Data("console.log('fixture')".utf8), "sw.js": Data(),
                          "manifest.webmanifest": Data("{}".utf8), "audio.m4a": Data((0..<255).map(UInt8.init))]
            let entries: [[String: Any]] = try values.keys.sorted().map { path in
                let data = values[path]!
                try data.write(to: root.appendingPathComponent(path))
                return ["path": path, "bytes": data.count, "sha256": AssetCatalog.hash(data)]
            }
            let artifact = String(repeating: "a", count: 64)
            let manifest = try JSONSerialization.data(withJSONObject: ["schemaVersion": 1, "product": "KAIRO", "artifactSha256": artifact, "files": entries], options: [.sortedKeys])
            try manifest.write(to: root.appendingPathComponent("build-identity.json"))
            let catalog = try AssetCatalog(root: root, expectedArtifactSHA256: artifact, expectedManifestSHA256: AssetCatalog.hash(manifest))
            let port: UInt16 = 43217
            let active = LoopbackServer(catalog: catalog, port: port)
            server = active
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                active.start { continuation.resume(with: $0) }
            }
            func check(_ value: Bool) throws { if !value { throw CheckFailure.failed(current) } }
            func request(_ path: String = "/", method: String = "GET", headers: String = "", host: String = "localhost:43217") async throws -> Data {
                try await RawRequest().run("\(method) \(path) HTTP/1.1\r\nHost: \(host)\r\n\(headers)\r\n", port: port)
            }
            func status(_ reply: Data, _ value: Int) -> Bool { reply.starts(with: Data("HTTP/1.1 \(value) ".utf8)) }

            current = "localhost-over-ipv4-loopback"
            let (localData, localReply) = try await URLSession.shared.data(from: URL(string: "http://localhost:\(port)/")!)
            try check((localReply as? HTTPURLResponse)?.statusCode == 200 && localData == values["index.html"])
            passed.append(current)

            current = "occupied-port-fails-closed"
            let collision = LoopbackServer(catalog: catalog, port: port)
            let refused = await withCheckedContinuation { continuation in collision.start { result in
                if case .failure = result { continuation.resume(returning: true) } else { continuation.resume(returning: false) }
            } }
            collision.stop(); try check(refused); passed.append(current)

            current = "exact-audio-range"
            let partial = try await request("/audio.m4a", headers: "Range: bytes=10-12\r\n")
            try check(status(partial, 206) && partial.suffix(3) == Data([10, 11, 12]) && String(decoding: partial, as: UTF8.self).contains("Content-Range: bytes 10-12/255"))
            passed.append(current)

            current = "audio-suffix-and-unsatisfiable-ranges"
            let suffix = try await request("/audio.m4a", headers: "Range: bytes=-2\r\n")
            let outside = try await request("/audio.m4a", headers: "Range: bytes=255-\r\n")
            try check(status(suffix, 206) && suffix.suffix(2) == Data([253, 254]) && status(outside, 416)); passed.append(current)

            current = "head-and-if-range"
            let head = try await request("/audio.m4a", method: "HEAD", headers: "Range: bytes=0-1\r\n")
            let old = try await request("/audio.m4a", headers: "Range: bytes=0-1\r\nIf-Range: old\r\n")
            try check(status(head, 200) && head.suffix(4) == Data("\r\n\r\n".utf8) && String(decoding: head, as: UTF8.self).contains("Content-Length: 255") && status(old, 200)); passed.append(current)

            current = "traversal-and-hidden-paths"
            for path in ["/../index.html", "/%2e%2e/index.html", "/%00index.html", "//evil/index.html", "/.hidden", "/foo%5cindex.html", "http://localhost:43217/"] {
                try check(status(try await request(path), 400))
            }
            passed.append(current)

            current = "host-and-origin-spoofing"
            try check(status(try await request(host: "evil.example"), 421))
            try check(status(try await request(headers: "Origin: https://example.org\r\n"), 403))
            try check(status(try await request(headers: "Host: evil.example\r\n"), 400)); passed.append(current)

            current = "write-endpoints-refused"
            try check(status(try await request(method: "POST"), 405))
            try check(status(try await request(headers: "Transfer-Encoding: chunked\r\n"), 400)); passed.append(current)

            current = "asset-tampering-refused"
            try Data("tampered".utf8).write(to: root.appendingPathComponent("index.html"))
            try check(status(try await request(), 500)); passed.append(current)

            current = "symlink-refused"
            try FileManager.default.removeItem(at: root.appendingPathComponent("audio.m4a"))
            try FileManager.default.createSymbolicLink(atPath: root.appendingPathComponent("audio.m4a").path, withDestinationPath: "/etc/hosts")
            try check(status(try await request("/audio.m4a"), 500)); passed.append(current)

            current = "navigation-and-export-boundaries"
            try check(HostPolicy.isAppURL(HostPolicy.entryURL) && !HostPolicy.isAppURL(URL(string: "http://127.0.0.1:43187/")))
            try check(HostPolicy.publisherURL("https://www3.nhk.or.jp/news/easy/") != nil)
            for url in ["file:///etc/passwd", "javascript:alert(1)", "https://127.0.0.1/", "https://2130706433/", "http://private.local/", "https://example.org:8443/", "https://user:secret@example.org/"] { try check(HostPolicy.publisherURL(url) == nil) }
            for name in ["../kairo.json", "/kairo.json", ".kairo.json", "kairo.json\n", "kairo.html"] { try check(HostPolicy.exportFilename(name, mimeType: "application/json") == nil) }
            passed.append(current)
            return ["status": "passed", "platform": "macOS-shared-host", "passed": passed.count, "checks": passed]
        } catch { return ["status": "failed", "platform": "macOS-shared-host", "passed": passed.count, "checks": passed, "failedCheck": current] }
    }
}
