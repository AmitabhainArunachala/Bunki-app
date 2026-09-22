// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "KairoIOSHostCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "KairoIOSHostCore", targets: ["KairoIOSHostCore"]),
        .executable(name: "kairo-host-probe", targets: ["KairoHostProbe"]),
        .executable(name: "kairo-text-intake-host", targets: ["KairoTextIntakeHost"]),
    ],
    dependencies: [.package(path: "../../packages/apple-sync"), .package(path: "NativeShareCore")],
    targets: [
        .target(name: "KairoIOSHostCore", dependencies: [.product(name: "KairoAppleSync", package: "apple-sync"),
                                                       .product(name: "KairoNativeShareCore", package: "nativesharecore")]),
        .executableTarget(name: "KairoHostProbe", dependencies: ["KairoIOSHostCore", .product(name: "KairoNativeShareCore", package: "nativesharecore")],
                          swiftSettings: [.define("HOST_CHECKS", .when(configuration: .debug))]),
        .executableTarget(name: "KairoTextIntakeHost", dependencies: ["KairoIOSHostCore"]),
        .testTarget(name: "KairoIOSHostCoreTests", dependencies: ["KairoIOSHostCore"]),
    ]
)
