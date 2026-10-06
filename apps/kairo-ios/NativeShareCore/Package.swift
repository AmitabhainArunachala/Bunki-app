// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "KairoNativeShareCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "KairoNativeShareCore", targets: ["KairoNativeShareCore"]),
        .executable(name: "kairo-share-core-checks", targets: ["KairoNativeShareCoreChecks"]),
    ],
    targets: [
        .target(name: "KairoNativeShareCore"),
        // The installed Command Line Tools have no XCTest/Testing runtime.
        // Keep meaningful CLI checks separate from the extension-safe library.
        .executableTarget(name: "KairoNativeShareCoreChecks", dependencies: ["KairoNativeShareCore"],
                          path: "Tests/KairoNativeShareCoreTests"),
    ]
)
