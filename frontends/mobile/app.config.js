/**
 * Expo config (replaces app.json so build-time values can come from env).
 *
 * Two apps from one codebase:
 *   APP_VARIANT unset      → "Nabz" (customers: book staff, order medicines)
 *   APP_VARIANT=partner    → "Nabz Partner" (medical staff, pharmacies, labs)
 *
 * Env (set in eas.json profiles or your shell):
 *   EXPO_PUBLIC_WEB_BASE_URL          website origin used for family tracking links
 *   EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID / EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID / EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
 *                                     enable "Continue with Google" (customer app)
 *   EXPO_PUBLIC_API_BASE_URL          default API server baked into the build
 *   EXPO_PUBLIC_ALLOW_SERVER_OVERRIDE "true" → login screen lets testers change the server
 *   MEDRUSH_ALLOW_CLEARTEXT           "true" → allow http:// (LAN/emulator testing ONLY)
 *
 * Push: drop Firebase's google-services.json next to this file to enable FCM.
 */
const fs = require('fs');
const path = require('path');

const allowCleartext = process.env.MEDRUSH_ALLOW_CLEARTEXT === 'true';
const IS_PARTNER = process.env.APP_VARIANT === 'partner';
const variant = IS_PARTNER
  ? { name: 'Nabz Partner', slug: 'nabz-partner', scheme: 'nabzpartner', id: 'app.medrush.partner', icon: './assets/partner-icon.png', adaptive: './assets/partner-adaptive-icon.png', color: '#0a0f24' }
  : { name: 'Nabz', slug: 'medrush', scheme: 'medrush', id: 'app.medrush.mobile', icon: './assets/icon.png', adaptive: './assets/adaptive-icon.png', color: '#1f45e0' };
const locationWhy = IS_PARTNER
  ? 'Nabz Partner shares your location with patients while you are online or on the way to a visit.'
  : 'Nabz uses your location to find nearby pharmacies and track deliveries.';
const googleServicesFile = fs.existsSync(path.join(__dirname, 'google-services.json'))
  ? './google-services.json'
  : undefined;

module.exports = {
  expo: {
    name: variant.name,
    slug: variant.slug,
    scheme: variant.scheme,
    version: '0.1.0',
    orientation: 'portrait',
    icon: variant.icon,
    splash: { image: './assets/splash.png', resizeMode: 'contain', backgroundColor: variant.color },
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    plugins: [
      'expo-router',
      'expo-secure-store',
      [
        'expo-location',
        { locationWhenInUsePermission: locationWhy }
      ],
      [
        'expo-image-picker',
        {
          cameraPermission: 'Nabz uses the camera to photograph your prescription.',
          photosPermission: 'Nabz lets you attach a prescription photo from your gallery.'
        }
      ],
      [
        'expo-notifications',
        { color: '#0e9f6e', defaultChannel: 'orders' }
      ],
      [
        'expo-build-properties',
        {
          // WARNING: cleartext (http://) is only for testing against a laptop on
          // the LAN / emulator. Production builds talk to the HTTPS API only.
          android: {
            usesCleartextTraffic: allowCleartext,
            // Expo SDK 52 native modules are compiled with Compose for Kotlin 1.9.25.
            kotlinVersion: '1.9.25'
          }
        }
      ]
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: variant.id,
      infoPlist: {
        NSLocationWhenInUseUsageDescription: locationWhy,
        NSCameraUsageDescription: 'Nabz uses the camera to photograph your prescription.',
        NSPhotoLibraryUsageDescription: 'Nabz lets you attach a prescription photo from your gallery.'
      }
    },
    android: {
      package: variant.id, // keep until the Play Store listing is created (changing it = a new app)
      adaptiveIcon: { foregroundImage: variant.adaptive, backgroundColor: variant.color },
      versionCode: 1,
      googleServicesFile,
      permissions: [
        'android.permission.INTERNET',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.CAMERA',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.POST_NOTIFICATIONS',
        'android.permission.VIBRATE',
        'android.permission.RECEIVE_BOOT_COMPLETED'
      ],
      // Background location, SMS, contacts, etc. are deliberately NOT requested:
      // Play Store rejects apps that ask for permissions they don't need.
      blockedPermissions: [
        'android.permission.ACCESS_BACKGROUND_LOCATION',
        'android.permission.RECORD_AUDIO',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.SYSTEM_ALERT_WINDOW'
      ]
    },
    extra: {
      apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || '',
      allowServerOverride: process.env.EXPO_PUBLIC_ALLOW_SERVER_OVERRIDE === 'true',
      variant: IS_PARTNER ? 'partner' : 'customer',
      // Staging only: lets testers outside the launch city use the Jaipur demo area
      // (customer location + staff "Go online"). Never enable in production builds.
      demoArea: process.env.EXPO_PUBLIC_DEMO_AREA === 'true',
      webBaseUrl: process.env.EXPO_PUBLIC_WEB_BASE_URL || '',
      google: {
        androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '',
        iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '',
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || ''
      },
      eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined
    }
  }
};
