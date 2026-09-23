import Foundation

extension Foundation.Bundle {
    static let module: Bundle = {
        let mainPath = Bundle.main.bundleURL.appendingPathComponent("KairoAppleSync_KairoAppleSyncTests.bundle").path
        let buildPath = "/Users/dhyana/worktrees/Bunki-app/integration_one_app_20260923/packages/apple-sync/.build/arm64-apple-macosx/debug/KairoAppleSync_KairoAppleSyncTests.bundle"

        let preferredBundle = Bundle(path: mainPath)

        guard let bundle = preferredBundle ?? Bundle(path: buildPath) else {
            // Users can write a function called fatalError themselves, we should be resilient against that.
            Swift.fatalError("could not load resource bundle: from \(mainPath) or \(buildPath)")
        }

        return bundle
    }()
}