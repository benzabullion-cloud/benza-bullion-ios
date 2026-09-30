## Apple testing build

The user authorized pushing the integrated scanner to Apple for device testing.
`App/PrivateVisionModels/TESTFLIGHT_BETA` explicitly selects bundled offline
weights for main-branch Xcode Cloud builds, in addition to the trial branch.
The tracked manifest remains disabled for ordinary builds. This marker must be
removed before preparing a public App Store release, unless real-device
validation has justified intentional production enablement. This is a testing
build; compilation does not establish camera accuracy or iPhone performance.

The app includes the fixed 1.55 GB weights only in these cloud beta builds.
The conservative 8 GB RAM device-class guard and strict design-only protocol
remain in effect. Photos are processed locally, without a hosted model API.
