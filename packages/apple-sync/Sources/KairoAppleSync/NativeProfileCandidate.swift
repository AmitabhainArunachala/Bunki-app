import Foundation

public struct NativePairedProfile: Sendable {
    public let profile: NativeSyncProfile
    public let accountFingerprint: String
}

private struct NativeProfileCandidateData: Codable {
    let format: String
    let version: Int
    let accountId: String
    let learnerId: String
    let label: String
}

extension NativeSyncProfile {
    /// Only a native "New learner profile" action should call this. Creation is
    /// local identity allocation, not CloudKit authorization. The embedding must
    /// persist/adopt the chosen local binding before admitting any learner edits.
    public static func createCandidate(label: String) throws -> Self {
        try Self(scope: JournalScope(accountID: "local-account:" + UUID().uuidString.lowercased(),
            learnerID: "local-learner:" + UUID().uuidString.lowercased()), label: label)
    }

    /// User-mediated cross-device candidate transfer. Contains no account
    /// fingerprint, session, native lease, grant or server credential. Importing
    /// it still requires begin + native confirmation on the receiving device.
    public func exportCandidate() throws -> Data {
        try encoded(NativeProfileCandidateData(format: "kairo-native-profile-candidate", version: 1,
            accountId: scope.accountID, learnerId: scope.learnerID, label: label))
    }
    public static func importCandidate(_ data: Data) throws -> Self {
        guard data.count <= 4096 else { throw NativeBootstrapError.invalidProfile }
        do {
            let value = try JSONDecoder().decode(NativeProfileCandidateData.self, from: data)
            guard value.format == "kairo-native-profile-candidate", value.version == 1,
                  try encoded(value) == data else { throw NativeBootstrapError.invalidProfile }
            return try Self(scope: JournalScope(accountID: value.accountId, learnerID: value.learnerId), label: value.label)
        } catch { throw NativeBootstrapError.invalidProfile }
    }
}
