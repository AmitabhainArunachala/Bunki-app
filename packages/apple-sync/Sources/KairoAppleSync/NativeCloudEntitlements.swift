import Foundation
import Security

/// Configuration admission only, not account authentication. Uses the running
/// process's signing metadata, never environment or a caller's grant assertion.
/// It does not read Keychain items or make a CloudKit call.
public enum NativeCloudEntitlements {
    public static func requireCurrentProcess(containerIdentifier: String) throws {
        guard let task = SecTaskCreateFromSelf(nil) else { throw NativeBootstrapError.configurationUnavailable }
        func value(_ key: String) -> CFTypeRef? { SecTaskCopyValueForEntitlement(task, key as CFString, nil) }
        let containers = value("com.apple.developer.icloud-container-identifiers") as? [String]
        let services = value("com.apple.developer.icloud-services") as? [String]
        let team = value("com.apple.developer.team-identifier") as? String
        let environment = value("com.apple.developer.icloud-container-environment") as? String
        try validate(containerIdentifier: containerIdentifier, containers: containers,
            services: services, team: team, environment: environment)
        #if os(macOS)
        var code: SecCode?
        var staticCode: SecStaticCode?
        var information: CFDictionary?
        guard SecCodeCopySelf(SecCSFlags(), &code) == errSecSuccess, let code,
              SecCodeCheckValidity(code, SecCSFlags(rawValue: kSecCSStrictValidate), nil) == errSecSuccess,
              SecCodeCopyStaticCode(code, SecCSFlags(), &staticCode) == errSecSuccess, let staticCode,
              SecCodeCopySigningInformation(staticCode, SecCSFlags(rawValue: kSecCSSigningInformation), &information) == errSecSuccess,
              let values = information as? [String: Any],
              let signedTeam = values[kSecCodeInfoTeamIdentifier as String] as? String,
              signedTeam == team else { throw NativeBootstrapError.configurationUnavailable }
        #endif
    }

    static func validate(containerIdentifier: String, containers: [String]?, services: [String]?,
                         team: String?, environment: String?) throws {
        guard validID(containerIdentifier), containerIdentifier.hasPrefix("iCloud."),
              containers?.contains(where: { identicalUTF8($0, containerIdentifier) }) == true,
              services?.contains("CloudKit") == true, let team, team.utf8.count == 10,
              team.utf8.allSatisfy({ (48...57).contains($0) || (65...90).contains($0) }),
              environment == "Production" || environment == "Development" else {
            throw NativeBootstrapError.configurationUnavailable
        }
    }
}
