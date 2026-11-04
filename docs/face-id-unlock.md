# Face ID portfolio unlock

The Face ID follow-up includes the Apple and Google sign-in and recent-email
changes. The email picker offers up to four successful email logins stored on
the current device/browser. Remember me is off by default for new installs.
Clearing the picker or turning off Remember me removes the saved addresses.
This picker fills only the email; it is separate from iOS Password AutoFill.

For a signed test build, set BenzaFaceIDUnlockEnabled in App/Info.plist to true.
Leave it off for production until a physical-device check passes. Under
Settings → Account, select Enable Face ID unlock and confirm using the system
prompt. The setting is local to the device. The lock covers the app during
launch and hides it from the app switcher on inactivity. After backgrounding,
tap Unlock Benza Bullion to authenticate. iOS device passcode is the recovery
option if Face ID is unavailable or locked out. This is a local viewing lock
on an existing Supabase session; it does not authenticate to Supabase or
protect against access to the underlying data on a compromised device.

On a signed iPhone build, verify cold launch, warm resume, app-switcher
snapshots, cancellation, failed Face ID, device passcode, backgrounding
during a prompt, VoiceOver, disabling the lock, session expiry, sign-out and
account deletion. Verify holdings are never visible before successful unlock
and that a guest never sees a Face ID setup option. Separately follow
social-sign-in.md for the provider and Password AutoFill release gates.
