import Foundation
import Security

public enum NativeBootstrapError: String, Error, Sendable, Equatable {
    case invalidConfiguration = "invalid-configuration", invalidProfile = "invalid-profile"
    case configurationUnavailable = "configuration-unavailable"
    case staleChallenge = "stale-challenge", confirmationRequired = "confirmation-required"
    case pairedToDifferentAccount = "paired-to-different-account"
    case pairingUnavailable = "pairing-unavailable", invalidPairing = "invalid-pairing"
    case invalidControl = "invalid-control", cancelled
}

/// A candidate selected by trusted native UI, never an authentication assertion.
/// Existing local IDs retain their exact bytes. Pairing requires a separate
/// native confirmation against a freshly verified CloudKit identity.
public struct NativeSyncProfile: Sendable, Equatable {
    public let scope: JournalScope
    public let label: String
    public init(scope: JournalScope, label: String) throws {
        guard validID(scope.accountID), validID(scope.learnerID), validID(label),
              label.utf8.count <= 160 else { throw NativeBootstrapError.invalidProfile }
        self.scope = scope; self.label = label
    }
}

/// Device-local, immutable grant. No raw CloudKit user record name is retained.
/// It is not a transferable account credential or a profile-import format.
struct NativePairingRecord: Codable, Sendable, Equatable {
    let version: Int
    let containerIdentifier: String
    let accountFingerprint: String
    let scope: JournalScope
    let profileLabel: String
    static func key(container: String, scope: JournalScope) throws -> String {
        digest(try encoded([container, scope.accountID, scope.learnerID]))
    }
    init(account: CloudAccountIdentity, profile: NativeSyncProfile) {
        version = 1; containerIdentifier = account.containerIdentifier
        accountFingerprint = account.fingerprint; scope = profile.scope; profileLabel = profile.label
    }
    func authorizes(_ account: CloudAccountIdentity, _ scope: JournalScope) -> Bool {
        version == 1 && identicalUTF8(containerIdentifier, account.containerIdentifier)
            && accountFingerprint == account.fingerprint && self.scope == scope
    }
    static func decode(_ data: Data, container: String, scope: JournalScope) throws -> Self {
        guard data.count <= 8192 else { throw NativeBootstrapError.invalidPairing }
        do {
            let value = try JSONDecoder().decode(Self.self, from: data)
            // Canonical bytes also reject duplicate/unknown keys and altered
            // field encodings; Codable does not call JournalScope's initializer.
            guard value.version == 1, validID(value.scope.accountID), validID(value.scope.learnerID),
                  validID(value.containerIdentifier), value.containerIdentifier.hasPrefix("iCloud."),
                  identicalUTF8(value.containerIdentifier, container), value.scope == scope,
                  validID(value.profileLabel), value.profileLabel.utf8.count <= 160,
                  isDigest(value.accountFingerprint), try encoded(value) == data else {
                throw NativeBootstrapError.invalidPairing
            }
            return value
        } catch { throw NativeBootstrapError.invalidPairing }
    }
}

// Internal injection only. Production callers cannot substitute a fake account
// source or a writable-file grant store through the public bootstrap initializer.
protocol NativePairingStorage: Sendable {
    func read(key: String) throws -> Data?
    func add(key: String, value: Data) throws
    func remove(key: String) throws
    func list() throws -> [Data]
}

struct NativeKeychainPairingStorage: NativePairingStorage {
    let service: String
    private func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service, kSecAttrAccount as String: "profile-v1:" + key,
         kSecAttrSynchronizable as String: false, kSecUseDataProtectionKeychain as String: true]
    }
    func read(key: String) throws -> Data? {
        var request = query(key)
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let value = result as? Data else {
            throw NativeBootstrapError.pairingUnavailable
        }
        return value
    }
    func add(key: String, value: Data) throws {
        var request = query(key)
        request[kSecValueData as String] = value
        request[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let status = SecItemAdd(request as CFDictionary, nil)
        if status == errSecDuplicateItem {
            // A second native owner may race. Never overwrite an existing grant.
            guard try read(key: key) == value else { throw NativeBootstrapError.pairedToDifferentAccount }
            return
        }
        guard status == errSecSuccess else { throw NativeBootstrapError.pairingUnavailable }
    }
    func remove(key: String) throws {
        let status = SecItemDelete(query(key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw NativeBootstrapError.pairingUnavailable
        }
    }
    func list() throws -> [Data] {
        var request = query("")
        request.removeValue(forKey: kSecAttrAccount as String)
        request[kSecReturnData as String] = true
        request[kSecReturnAttributes as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitAll
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return [] }
        guard status == errSecSuccess, let rows = result as? [[String: Any]], rows.count <= 128 else {
            throw NativeBootstrapError.pairingUnavailable
        }
        var values: [Data] = []
        for row in rows {
            guard let key = row[kSecAttrAccount as String] as? String, key.hasPrefix("profile-v1:"),
                  let bytes = row[kSecValueData as String] as? Data else { throw NativeBootstrapError.invalidPairing }
            values.append(bytes)
        }
        return values
    }
}

actor NativePairingRepository {
    let storage: any NativePairingStorage
    init(storage: any NativePairingStorage) { self.storage = storage }
    func read(container: String, scope: JournalScope) throws -> NativePairingRecord? {
        let key = try NativePairingRecord.key(container: container, scope: scope)
        guard let data = try storage.read(key: key) else { return nil }
        return try NativePairingRecord.decode(data, container: container, scope: scope)
    }
    func pair(account: CloudAccountIdentity, profile: NativeSyncProfile,
              assertCurrent: @Sendable () throws -> Void = {}) throws {
        try assertCurrent()
        let scope = profile.scope
        if let old = try read(container: account.containerIdentifier, scope: scope) {
            guard old.authorizes(account, scope) else { throw NativeBootstrapError.pairedToDifferentAccount }
            return
        }
        let key = try NativePairingRecord.key(container: account.containerIdentifier, scope: scope)
        let record = NativePairingRecord(account: account, profile: profile)
        try assertCurrent()
        try storage.add(key: key, value: encoded(record))
        guard try read(container: account.containerIdentifier, scope: scope) == record else {
            throw NativeBootstrapError.pairingUnavailable
        }
    }
    func authorizes(_ account: CloudAccountIdentity, _ scope: JournalScope) throws -> Bool {
        try read(container: account.containerIdentifier, scope: scope)?.authorizes(account, scope) == true
    }
    func forget(container: String, scope: JournalScope) throws {
        try storage.remove(key: NativePairingRecord.key(container: container, scope: scope))
    }
    func profiles(container: String) throws -> [NativePairedProfile] {
        let values = try storage.list()
        guard values.count <= 128 else { throw NativeBootstrapError.pairingUnavailable }
        var profiles: [NativePairedProfile] = []; var seen = Set<JournalScope>()
        for bytes in values {
            guard bytes.count <= 8192, let value = try? JSONDecoder().decode(NativePairingRecord.self, from: bytes) else {
                throw NativeBootstrapError.invalidPairing
            }
            // A configured service may contain another configured container's
            // profiles; validate every record before filtering its container.
            let record = try NativePairingRecord.decode(bytes, container: value.containerIdentifier, scope: value.scope)
            guard identicalUTF8(record.containerIdentifier, container) else { continue }
            guard seen.insert(record.scope).inserted else { throw NativeBootstrapError.invalidPairing }
            profiles.append(try NativePairedProfile(profile: NativeSyncProfile(scope: record.scope, label: record.profileLabel),
                accountFingerprint: record.accountFingerprint))
        }
        return profiles.sorted {
            let a = Array($0.profile.scope.accountID.utf8) + [0] + Array($0.profile.scope.learnerID.utf8)
            let b = Array($1.profile.scope.accountID.utf8) + [0] + Array($1.profile.scope.learnerID.utf8)
            return a.lexicographicallyPrecedes(b)
        }
    }
}
