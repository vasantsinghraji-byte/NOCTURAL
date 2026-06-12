# Nocturnal Capacitor Android

The Android project packages the production frontend from `client/dist` and
activates native capabilities only when running inside Capacitor.
The build helper selects an installed JDK 21 or newer.

## Build

```powershell
npm run android:sync
npm run android:build
```

The debug APK is written to:

`android/app/build/outputs/apk/debug/app-debug.apk`

## Native capability API

`window.NocturnalNative` exposes:

- `authenticate(reason)` for biometric or device-credential authentication.
- `capturePhoto()` and `captureAndUpload(endpoint, fieldName)` for native camera workflows.
- `getCurrentLocation()`, `startBackgroundLocation(callback)`, and `stopBackgroundLocation()`.
- `registerPushNotifications()` for FCM registration and notification events.
- Secure access/refresh token storage used automatically by `AppConfig`.

Background locations emit `nocturnal:location` events. Push events emit
`nocturnal:push-received` and `nocturnal:push-action`.

## Required release configuration

1. Add the Firebase Android configuration as `android/app/google-services.json`.
2. Set `FIREBASE_PUSH_ENABLED=true` and provide Google Application Default
   Credentials to enable server delivery to tokens registered at
   `POST /api/v1/mobile-devices`.
3. Create the upload signing key once with `npm run android:release-key`.
4. Follow the split-custody and certificate-verification procedure in
   `DEPLOYMENT.md`; never commit signing credentials or recovery material.
5. Build signed release artifacts with `npm run android:release`.
6. Follow `docs/play-store-background-location.md` for Play review.

`google-services.json` is intentionally ignored because it contains
environment-specific Firebase identifiers.

Signed release outputs:

- `android/app/build/outputs/apk/release/app-release.apk`
- `android/app/build/outputs/bundle/release/app-release.aab`

Each Android sync generates `android/version.properties`. The version name
defaults to the root package version, and the version code defaults to the
current Unix timestamp. CI may override these with `ANDROID_VERSION_NAME` and
`ANDROID_VERSION_CODE`.

Release builds enable R8 code minification and resource shrinking. Complete
`docs/android-device-smoke-test.md` before distributing a new APK.
