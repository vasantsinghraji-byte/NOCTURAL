# Android Device Smoke Test

Run this checklist against the signed release APK before distributing a build.

## Install and startup

- Connect a supported Android device with USB debugging authorized.
- Run `adb install -r android/app/build/outputs/apk/release/app-release.apk`.
- Launch Nocturnal and confirm the landing page loads without a blank screen.
- Confirm API requests reach the intended environment.

## Authentication and diagnostics

- Sign in, close the app, reopen it, and complete biometric/device authentication.
- Deny notification permission and confirm the authenticated session remains active.
- Trigger an offline API failure and confirm the UI remains usable.
- Inspect `window.NocturnalNative.getDiagnosticLogs()` through WebView debugging and confirm entries contain no tokens, request bodies, or personal data.

## Native workflows

- Capture and upload a photo; confirm orientation and readable image quality.
- Confirm the uploaded image dimensions are bounded and the app does not run out of memory.
- Start background location, approve the disclosure, and select **Allow all the time**.
- Background the app and confirm the persistent location notification remains visible.
- Stop tracking and revoke consent.

## Release checks

- Confirm `versionCode` increased from the previous submitted build.
- Confirm the APK signature verifies with `apksigner verify --verbose`.
- Exercise login, camera, biometrics, background location, and notification-denial flows on Android 7 and the current Android release where devices are available.
