// swift-tools-version: 5.9
import PackageDescription

// Experimental package only; not connected to the shipping app target.
// We retain the matching binary and runtime source independently of this URL.
let package = Package(
    name: "BenzaPrivateVisionCore",
    platforms: [.iOS(.v15), .macOS(.v13)],
    products: [.library(name: "BenzaPrivateVision", targets: ["BenzaPrivateVision"])],
    targets: [
        .binaryTarget(
            name: "llama",
            path: "Vendor/llama.xcframework"
        ),
        .target(
            name: "CBenzaVision",
            dependencies: ["llama"],
            linkerSettings: [.linkedFramework("Accelerate"), .linkedFramework("Metal"),
                             .linkedFramework("Foundation"), .linkedLibrary("c++")]
        ),
        .target(name: "BenzaPrivateVision", dependencies: ["CBenzaVision"]),
        .testTarget(name: "BenzaPrivateVisionTests", dependencies: ["BenzaPrivateVision", "CBenzaVision"])
    ],
    cxxLanguageStandard: .cxx17
)
