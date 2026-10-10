# MedRush Mobile (Expo / React Native)

One app for **customers** (browse → cart → Cash-on-delivery order, prescription photo)
and **pharmacy stores** (incoming-order queue with loud new-order alerts). Talks to the
Express API (`/api/v1`) with bearer tokens and shares types via `@medrush/shared`.

## 1. Start the backend (laptop)

```bash
# repo root — MongoDB must be running (local mongod or Docker)
npm run dev                 # API on :5000, listens on all interfaces
npm run db:seed:pharmacy    # demo stores + logins (prints them)
```

Demo logins (LOCAL DEV ONLY):

| Who | Email | Password | Pick on login screen |
|---|---|---|---|
| Customer | `customer@nabz-staging.test` | `SEED_DEMO_PASSWORD` | 🧑 Customer |
| Pharmacy store | `pharmacy@nabz-staging.test` | `SEED_DEMO_PASSWORD` | 🏪 Pharmacy / staff |

## 2. Which server URL?

| Where the app runs | API URL |
|---|---|
| Android **emulator** | `http://10.0.2.2:5000` (the emulator's alias for your laptop) — the default |
| **Physical phone** (same Wi-Fi) | `http://<laptop Wi-Fi IP>:5000` — find it with `ipconfig` → "IPv4 Address" |
| Phone via USB, any network | `adb reverse tcp:5000 tcp:5000`, then `http://localhost:5000` |

For a physical phone over Wi-Fi, allow the port once (PowerShell **as Administrator**):

```powershell
New-NetFirewallRule -DisplayName "MedRush API 5000" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow -Profile Private
```

In dev and preview builds the login screen has a **Server** box with **Test connection**,
so one APK works on the emulator and on phones.

## 3. Run during development (Expo Go or emulator)

```bash
cd frontends/mobile
npm install
npx expo start              # press a → emulator, or scan the QR with Expo Go on the phone
```

Emulator: Android Studio → Device Manager → create a Pixel device (API 35 image is
installed), start it, then press `a`.

> Expo Go doesn't include your Firebase config, so **server** push can't reach it. In-app
> alerts and the test alert still work. Test closed-app push on the APK (steps 5–6).

## 4. What to test (checklist)

1. **Login**: customer and store both log in; a wrong password shows an error; kill and
   reopen the app → still logged in (token in SecureStore); Log out → back to login.
2. **Permissions**: Home → Permissions → *Allow all*. Location, Notifications (Android 13+
   prompt), Camera and Photos should all show ✅. Deny one → the button switches to *Settings*.
3. **Store notification** (two devices, e.g. emulator = store, phone = customer):
   - Store: log in → *Incoming orders* → tap **Send test alert** → you should see and hear it.
   - Customer: Pharmacy → pick the same store → add items → address + pincode →
     **Place order**.
   - Store: within about 10 s a **"New order MR-…"** notification appears (sound and vibration).
     The order card is highlighted → Accept → Start packing → … → Delivered.
   - With Firebase configured (step 6) the alert also arrives when the store app is **closed**.
4. **Rx items**: an item needing a prescription asks for a photo (Camera/Gallery) before ordering.
5. **CORS** doesn't apply to the native app (no browser). The web app's CORS is covered by
   `tests/integration/medrush-mobile-flow.test.js` (backend repo).

## 5. Build an installable APK

**Local build (this laptop has the Android SDK):**

```powershell
cd frontends/mobile
$env:JAVA_HOME = "C:\Program Files\Android\openjdk\jdk-21.0.8"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:EXPO_PUBLIC_ALLOW_SERVER_OVERRIDE = "true"   # Server box on the login screen
$env:MEDRUSH_ALLOW_CLEARTEXT = "true"             # allow http:// to your laptop
npx expo prebuild --platform android --clean
cd android; .\gradlew.bat assembleRelease
# → android\app\build\outputs\apk\release\app-release.apk
```

Install it with `adb install -r app-release.apk`, or copy it to the phone and open it
(allow "Install unknown apps").

**Cloud build (no local SDK needed):** `npm i -g eas-cli && eas login && eas build -p android --profile preview`
(this downloads an APK link).

> ⚠️ **Preview APKs are test builds.** They allow `http://` and a custom server and are signed
> with the debug key. For the Play Store use `eas build --profile production` (AAB, HTTPS
> API only, no server override) with your own upload key.

## 6. Server push when the app is closed (Firebase)

1. Firebase console → add an Android app with package `app.medrush.mobile` → download
   `google-services.json` into `frontends/mobile/` (it's picked up automatically) → rebuild the APK.
2. Backend: a service account with the **Firebase Cloud Messaging API** permission.
   `GOOGLE_APPLICATION_CREDENTIALS=<path to key json>` and `FIREBASE_PUSH_ENABLED=true` in `.env`.
3. The store app registers its FCM token automatically (`POST /api/v1/mobile-devices`).
   Each new order then creates a `Notification` row and sends an FCM push
   (`services/pharmacyNotificationService.js`).

Without Firebase, the store app still alerts in-app by polling every 10 s while it's open.

## Files
- `app/login.tsx`: customer/store login, customer sign-up, server picker
- `app/vendor.tsx`: store order queue, status actions, new-order alerts
- `app/pharmacy.tsx`: nearby stores, storefront, cart, COD checkout, Rx photo
- `app/permissions.tsx`: every runtime permission the app uses, with status
- `lib/api.ts`, `lib/auth.tsx`, `lib/notifications.ts`, `lib/permissions.ts`
- `app.config.js` (permissions, plugins, build flags), `eas.json` (APK / AAB profiles)
