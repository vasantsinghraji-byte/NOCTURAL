const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Capacitor mobile application contract', () => {
  it('configures Android with packaged production assets and reliable background location mode', () => {
    const config = JSON.parse(read('capacitor.config.json'));

    expect(config.appId).toBe('com.nocturnal.healthcare');
    expect(config.webDir).toBe('client/dist');
    expect(config.android.useLegacyBridge).toBe(true);
  });

  it('provides native secure storage, biometric, camera, location, and push capabilities', () => {
    const bridge = read('client/public/js/native-capabilities.js');

    [
      'SecureStorage',
      'BiometricAuthNative',
      'Camera',
      'Geolocation',
      'BackgroundGeolocation',
      'PushNotifications'
    ].forEach((pluginName) => expect(bridge).toContain(pluginName));
    expect(bridge).toContain("AppConfig.fetch('mobile-devices'");
  });

  it('hardens the generated Android app and ignores Firebase credentials', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    const gitignore = read('.gitignore');

    expect(manifest).toContain('android:allowBackup="false"');
    expect(manifest).toContain('BackgroundGeolocationService');
    expect(manifest).toContain('android:exported="false"');
    expect(manifest).toContain('android.permission.ACCESS_BACKGROUND_LOCATION');
    expect(gitignore).toContain('android/app/google-services.json');
  });

  it('requires a prominent disclosure and supports revoking background location consent', () => {
    const bridge = read('client/public/js/native-capabilities.js');
    const privacy = read('client/public/shared/privacy.html');

    expect(bridge).toContain('Allow background location tracking?');
    expect(bridge).toContain('while the app is closed or not in use');
    expect(bridge).toContain('NocturnalBackgroundPermission');
    expect(bridge).toContain('Allow all the time');
    expect(bridge).toContain('revokeBackgroundLocationConsent');
    expect(privacy).toContain('<h2>Location Data</h2>');
  });

  it('provides a local-secret signed release workflow', () => {
    const buildGradle = read('android/app/build.gradle');
    const androidGitignore = read('android/.gitignore');
    const packageJson = JSON.parse(read('package.json'));

    expect(buildGradle).toContain("rootProject.file('keystore.properties')");
    expect(buildGradle).toContain('signingConfig signingConfigs.release');
    expect(androidGitignore).toContain('keystore.properties');
    expect(androidGitignore).toContain('*.jks');
    expect(packageJson.scripts['android:release']).toContain('assembleRelease bundleRelease');
  });

  it('isolates optional push failures and records sanitized native diagnostics', () => {
    const bridge = read('client/public/js/native-capabilities.js');
    const config = read('client/public/js/config.js');

    expect(bridge).toContain("logError('push-registration-failed'");
    expect(bridge).toContain('MAX_DIAGNOSTIC_ENTRIES');
    expect(bridge).toContain('sanitizeDiagnosticDetails');
    expect(bridge).toContain('getDiagnosticLogs');
    expect(config).toContain("nativeBridge.logError('api-request-failed'");
  });

  it('allows Render cold starts in native requests without changing browser timeout', () => {
    const config = read('client/public/js/config.js');

    expect(config).toContain('TIMEOUT: 10000');
    expect(config).toContain('NATIVE_TIMEOUT: 60000');
    expect(config).toContain('isNativeRequest ? this.NATIVE_TIMEOUT : this.TIMEOUT');
  });

  it('bounds camera captures before upload', () => {
    const bridge = read('client/public/js/native-capabilities.js');

    expect(bridge).toContain("resultType: 'uri'");
    expect(bridge).toContain('quality: 75');
    expect(bridge).toContain('width: 1600');
    expect(bridge).toContain('height: 1600');
    expect(bridge).toContain('fetch(photo.webPath)');
  });

  it('generates Android versions and enables conservative release shrinking', () => {
    const buildGradle = read('android/app/build.gradle');
    const proguard = read('android/app/proguard-rules.pro');
    const packageJson = JSON.parse(read('package.json'));
    const smokeChecklist = read('docs/android-device-smoke-test.md');

    expect(packageJson.scripts['android:sync']).toContain('android:version');
    expect(buildGradle).toContain("rootProject.file('version.properties')");
    expect(buildGradle).toContain('minifyEnabled true');
    expect(buildGradle).toContain('shrinkResources true');
    expect(proguard).toContain('com.getcapacitor.**');
    expect(smokeChecklist).toContain('Deny notification permission');
  });
});
