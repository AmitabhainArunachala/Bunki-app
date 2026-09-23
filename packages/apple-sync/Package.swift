// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "KairoAppleSync",
    platforms: [.macOS(.v14), .iOS(.v17)],
    products: [
        .library(name: "KairoAppleSync", targets: ["KairoAppleSync"]),
        .executable(name: "kairo-cloud-sync-host", targets: ["KairoCloudSyncHost"]),
    ],
    targets: [
        .target(name: "KairoAppleSync"),
        .executableTarget(name: "KairoCloudSyncHost", dependencies: ["KairoAppleSync"]),
        .testTarget(name: "KairoAppleSyncTests", dependencies: ["KairoAppleSync"], resources: [.copy("Fixtures")]),
    ]
)
