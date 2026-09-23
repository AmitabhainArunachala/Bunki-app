import Foundation

/// This origin is part of the persisted installation identity. Changing any
/// component starts a different WebKit storage origin and needs a migration.
public enum HostPolicy {
    public static let port: UInt16 = 43187
    public static let origin = "http://localhost:43187"
    public static let entryURL = URL(string: origin + "/")!
    public static let maximumFileBytes = 32 * 1024 * 1024

    public static func isInitialScope(accountId: String, learnerId: String) -> Bool {
        let uuid = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
        return accountId.utf8.count == 50 && learnerId.utf8.count == 50 &&
            accountId.range(of: "^local-account:" + uuid + "$", options: .regularExpression) != nil &&
            learnerId.range(of: "^local-learner:" + uuid + "$", options: .regularExpression) != nil &&
            accountId.dropFirst(14) != learnerId.dropFirst(14)
    }

    public static func isAppURL(_ url: URL?) -> Bool {
        guard let url, cleanURL(url.absoluteString), url.scheme == "http",
              url.host == "localhost", url.port == Int(port),
              url.user == nil, url.password == nil else { return false }
        return true
    }

    public static func isAppBlobURL(_ url: URL?) -> Bool {
        guard let url, url.scheme == "blob" else { return false }
        return isAppURL(URL(string: String(url.absoluteString.dropFirst(5))))
    }

    /// Mirrors the desktop publisher boundary: public DNS names, HTTP(S),
    /// default ports, no credentials and no local/IP destinations.
    public static func publisherURL(_ value: String) -> URL? {
        guard cleanURL(value), let url = URL(string: value),
              ["http", "https"].contains(url.scheme ?? ""), url.port == nil,
              url.user == nil, url.password == nil, let rawHost = url.host else { return nil }
        let host = rawHost.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
        let labels = host.split(separator: ".", omittingEmptySubsequences: false)
        guard labels.count > 1, !host.contains(":"), !host.contains("["),
              !["localhost", "local", "internal", "lan"].contains(String(labels.last!)),
              labels.allSatisfy({ !$0.isEmpty && $0.utf8.allSatisfy { $0 == 45 || (48...57).contains($0) || (97...122).contains($0) } }),
              !labels.allSatisfy({ $0.allSatisfy(\.isNumber) }) else { return nil }
        return url
    }

    public static func exportFilename(_ value: String, mimeType: String) -> String? {
        guard !value.isEmpty, value.utf8.count <= 180,
              value.unicodeScalars.allSatisfy({ $0.value >= 32 && $0.value != 127 }),
              !value.contains("/"), !value.contains("\\"), !value.hasPrefix("."),
              !value.contains(":"),
              ["application/json": "json", "text/markdown": "md", "text/plain": "txt"][mimeType] == URL(fileURLWithPath: value).pathExtension.lowercased()
        else { return nil }
        return value
    }

    private static func cleanURL(_ value: String) -> Bool {
        !value.isEmpty && value.utf8.count <= 8192 && !value.contains("\\") &&
            value.unicodeScalars.allSatisfy { $0.value > 32 && $0.value != 127 }
    }
}
