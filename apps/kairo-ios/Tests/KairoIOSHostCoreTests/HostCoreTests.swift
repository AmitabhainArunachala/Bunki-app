import Foundation
import Network
import XCTest
@testable import KairoIOSHostCore

final class HostCoreTests: XCTestCase, @unchecked Sendable {
    private func fixture() throws -> (URL, AssetCatalog) {
        let root = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".dharma/bunki/ios-host/fixtures/\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let values = ["index.html": Data("<!doctype html><title>KAIRO fixture</title>".utf8),
                      "corridor.js": Data("console.log('fixture')".utf8), "sw.js": Data(),
                      "manifest.webmanifest": Data("{}".utf8), "audio.mp3": Data((0..<255).map(UInt8.init))]
        let entries: [[String: Any]] = try values.keys.sorted().map { path in
            let data = values[path]!
            try data.write(to: root.appendingPathComponent(path))
            return ["path": path, "bytes": data.count, "sha256": AssetCatalog.hash(data)]
        }
        let artifact = String(repeating: "a", count: 64)
        let manifest = try JSONSerialization.data(withJSONObject: ["schemaVersion": 1, "product": "KAIRO", "artifactSha256": artifact, "files": entries], options: [.sortedKeys])
        try manifest.write(to: root.appendingPathComponent("build-identity.json"))
        return (root, try AssetCatalog(root: root, expectedArtifactSHA256: artifact, expectedManifestSHA256: AssetCatalog.hash(manifest)))
    }

    private func response(_ text: String, catalog: AssetCatalog) throws -> HTTPResponse {
        AssetHTTP.response(try HTTPRequest(Data(text.utf8)), catalog: catalog, port: HostPolicy.port)
    }

    func testFixedOriginAndPublisherBoundary() {
        XCTAssertTrue(HostPolicy.isAppURL(URL(string: "http://localhost:43187/corpus/example.html")))
        for text in ["http://127.0.0.1:43187/", "https://localhost:43187/", "http://localhost:43188/", "http://user@localhost:43187/", "file:///index.html"] {
            XCTAssertFalse(HostPolicy.isAppURL(URL(string: text)), text)
        }
        XCTAssertNotNil(HostPolicy.publisherURL("https://www3.nhk.or.jp/news/easy/"))
        for text in ["file:///etc/passwd", "javascript:alert(1)", "https://127.0.0.1/", "https://2130706433/", "http://private.local/", "http://a.internal/", "https://example.org:8443/", "https://name:secret@example.org/", "https://[::1]/"] {
            XCTAssertNil(HostPolicy.publisherURL(text), text)
        }
        XCTAssertTrue(HostPolicy.isAppBlobURL(URL(string: "blob:http://localhost:43187/abc")))
        XCTAssertFalse(HostPolicy.isAppBlobURL(URL(string: "blob:https://example.org/abc")))
    }

    func testArtifactIdentityAndMutationFailClosed() throws {
        let (root, catalog) = try fixture()
        defer { try? FileManager.default.removeItem(at: root) }
        XCTAssertThrowsError(try AssetCatalog(root: root, expectedArtifactSHA256: String(repeating: "b", count: 64), expectedManifestSHA256: String(repeating: "c", count: 64)))
        try Data("tampered".utf8).write(to: root.appendingPathComponent("index.html"))
        let reply = try response("GET / HTTP/1.1\r\nHost: localhost:43187\r\n\r\n", catalog: catalog)
        XCTAssertEqual(reply.status, 500)
        XCTAssertTrue(reply.body.isEmpty)
    }

    func testTraversalSymlinksAndHostSpoofing() throws {
        let (root, catalog) = try fixture()
        defer { try? FileManager.default.removeItem(at: root) }
        for target in ["/../index.html", "/%2e%2e/index.html", "/%00index.html", "//evil/index.html", "/.hidden", "/foo%5cindex.html", "http://localhost:43187/"] {
            XCTAssertEqual(try response("GET \(target) HTTP/1.1\r\nHost: localhost:43187\r\n\r\n", catalog: catalog).status, 400, target)
        }
        XCTAssertEqual(try response("GET / HTTP/1.1\r\nHost: attacker.example\r\n\r\n", catalog: catalog).status, 421)
        XCTAssertEqual(try response("GET / HTTP/1.1\r\nHost: localhost:43187\r\nOrigin: https://example.org\r\n\r\n", catalog: catalog).status, 403)
        XCTAssertThrowsError(try HTTPRequest(Data("GET / HTTP/1.1\r\nHost: localhost:43187\r\nHost: evil\r\n\r\n".utf8)))
        try FileManager.default.removeItem(at: root.appendingPathComponent("audio.mp3"))
        try FileManager.default.createSymbolicLink(atPath: root.appendingPathComponent("audio.mp3").path, withDestinationPath: "/etc/hosts")
        XCTAssertEqual(try response("GET /audio.mp3 HTTP/1.1\r\nHost: localhost:43187\r\n\r\n", catalog: catalog).status, 500)
    }

    func testAudioRangesAndHeadHaveExactBytes() throws {
        let (root, catalog) = try fixture()
        defer { try? FileManager.default.removeItem(at: root) }
        let first = try response("GET /audio.mp3 HTTP/1.1\r\nHost: localhost:43187\r\nRange: bytes=1-4\r\n\r\n", catalog: catalog)
        XCTAssertEqual(first.status, 206); XCTAssertEqual(first.body, Data([1, 2, 3, 4]))
        XCTAssertEqual(first.headers["Content-Range"], "bytes 1-4/255")
        XCTAssertEqual(first.headers["Content-Type"], "audio/mpeg")
        let suffix = try response("GET /audio.mp3 HTTP/1.1\r\nHost: localhost:43187\r\nRange: bytes=-2\r\n\r\n", catalog: catalog)
        XCTAssertEqual(suffix.body, Data([253, 254]))
        XCTAssertEqual(try response("GET /audio.mp3 HTTP/1.1\r\nHost: localhost:43187\r\nRange: bytes=255-\r\n\r\n", catalog: catalog).status, 416)
        XCTAssertEqual(try response("GET /audio.mp3 HTTP/1.1\r\nHost: localhost:43187\r\nRange: bytes=0-1\r\nIf-Range: \"old\"\r\n\r\n", catalog: catalog).status, 200)
        let head = try response("HEAD /audio.mp3 HTTP/1.1\r\nHost: localhost:43187\r\nRange: bytes=0-1\r\n\r\n", catalog: catalog).encoded(headOnly: true)
        XCTAssertTrue(String(data: head, encoding: .utf8)!.contains("Content-Length: 255"))
        XCTAssertTrue(head.suffix(4) == Data("\r\n\r\n".utf8))
        XCTAssertEqual(try response("POST / HTTP/1.1\r\nHost: localhost:43187\r\n\r\n", catalog: catalog).status, 405)
    }

    func testFilenameCannotChooseFilesystemPath() {
        XCTAssertEqual(HostPolicy.exportFilename("kairo-2026-09-10.json", mimeType: "application/json"), "kairo-2026-09-10.json")
        for name in ["../kairo.json", "/kairo.json", ".kairo.json", "dir\\kairo.json", "kairo.json\n", "kairo.html"] {
            XCTAssertNil(HostPolicy.exportFilename(name, mimeType: "application/json"))
        }
    }

    func testRealListenerServesLocalhostAndRefusesCollision() async throws {
        let (root, catalog) = try fixture()
        defer { try? FileManager.default.removeItem(at: root) }
        // Isolated test port; production entry point never permits this override.
        let port: UInt16 = 43217
        let server = LoopbackServer(catalog: catalog, port: port)
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            server.start { continuation.resume(with: $0) }
        }
        defer { server.stop() }
        var request = URLRequest(url: URL(string: "http://localhost:\(port)/audio.mp3")!)
        request.setValue("bytes=10-12", forHTTPHeaderField: "Range")
        let (data, reply) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((reply as? HTTPURLResponse)?.statusCode, 206)
        XCTAssertEqual(data, Data([10, 11, 12]))
        let collision = LoopbackServer(catalog: catalog, port: port)
        let refused = await withCheckedContinuation { continuation in
            collision.start { result in if case .failure = result { continuation.resume(returning: true) } else { continuation.resume(returning: false) } }
        }
        collision.stop()
        XCTAssertTrue(refused, "An occupied origin must never fall through to another server or port")
    }
}
