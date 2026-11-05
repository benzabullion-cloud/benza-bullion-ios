# Optional Face ID sign-in

On a supported iPhone, the signed-out login screen offers Sign in with Face ID.
Tapping it opens Apple's saved-password picker; the credential returned by
Apple is used for one normal account sign-in and is not saved by Benza Bullion.
There is no automatic launch prompt and no in-app Face ID setup setting.

Before distributing a signed test build, follow the Password AutoFill setup
in social-sign-in.md. Verify that the signed app includes its webcredentials
entitlement and that the website serves the matching association file.
Test manual sign-in, a saved account, cancellation, no saved account,
multiple saved accounts, stale credentials, and reopening while signed in.
