const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..', '..');

const productionAuthPages = [
  'client/public/index-unified.html',
  'client/public/roles/doctor/browse-duties.html',
  'client/public/roles/doctor/my-applications.html',
  'client/public/roles/doctor/duty-details.html',
  'client/public/roles/doctor/doctor-profile.html',
  'client/public/roles/admin/admin-dashboard.html',
  'client/public/roles/admin/admin-applications.html',
  'client/public/roles/admin/admin-post-duty.html',
  'client/public/roles/admin/admin-profile.html',
  'client/public/roles/admin/admin-settings.html'
];

const readProjectFile = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

const indexUnifiedSrc = readProjectFile('client/public/index-unified.html');
const legacyAppSrc = readProjectFile('client/public/app.js');
const legacyFirebaseConfigSrc = readProjectFile('client/public/firebase-config.js');
const webpackConfigSrc = readProjectFile('client/webpack.config.js');
const webpackSimpleConfigSrc = readProjectFile('client/webpack.config.simple.js');
const renderYamlSrc = readProjectFile('render.yaml');

describe('Frontend Auth Contract', () => {
  it('should keep production auth entrypoints on backend JWT only', () => {
    productionAuthPages.forEach((relativePath) => {
      const source = readProjectFile(relativePath);

      expect(source).not.toContain('firebase-config.js');
      expect(source).not.toContain('window.firebaseAuth');
      expect(source).not.toContain('window.firebaseSignOut');
      expect(source).not.toContain('onAuthStateChanged(');
      expect(source).not.toContain('getIdToken(');
      expect(source).not.toContain('signInWithEmailAndPassword');
    });
  });

  it('should keep the unified landing page aligned with backend auth endpoints', () => {
    expect(indexUnifiedSrc).toContain('<script src="js/config.js"></script>');
    expect(indexUnifiedSrc).toContain('<script src="js/index-unified.js"></script>');
    expect(indexUnifiedSrc).toContain('href="/index.html"');
    expect(indexUnifiedSrc).toContain('href="/register.html"');
  });

  it('should avoid hardcoded localhost API calls on admin auth pages', () => {
    const adminPages = [
      'client/public/roles/admin/admin-dashboard.html',
      'client/public/roles/admin/admin-applications.html',
      'client/public/roles/admin/admin-post-duty.html',
      'client/public/roles/admin/admin-profile.html'
    ];

    adminPages.forEach((relativePath) => {
      const source = readProjectFile(relativePath);

      expect(source).not.toContain('http://localhost:5000/api');
      expect(source).toMatch(/AppConfig\.api\(|API_URL/);
    });
  });

  it('should not advertise firebase auth deployment defaults in render config', () => {
    expect(renderYamlSrc).not.toContain('FIREBASE_AUTH_ENABLED');
  });

  it('should quarantine legacy firebase frontend files instead of shipping active auth code', () => {
    expect(legacyAppSrc).toContain('Deprecated legacy app.js');
    expect(legacyAppSrc).not.toContain('signInWithEmailAndPassword');
    expect(legacyAppSrc).not.toContain('getIdToken(');

    expect(legacyFirebaseConfigSrc).toContain('Firebase auth has been retired');
    expect(legacyFirebaseConfigSrc).not.toContain('initializeApp');
    expect(legacyFirebaseConfigSrc).not.toContain('https://www.gstatic.com/firebasejs');
    expect(legacyFirebaseConfigSrc).not.toContain('window.firebaseAuth');
    expect(legacyFirebaseConfigSrc).not.toContain('window.firebaseSignOut');
  });

  it('should keep the webpack pipeline off deprecated firebase-era entrypoints', () => {
    expect(webpackConfigSrc).not.toContain("./public/app.js");
    expect(webpackConfigSrc).not.toContain("./public/firebase-config.js");
    expect(webpackConfigSrc).toContain("./public/js/config.js");
    expect(webpackConfigSrc).toContain("chunks: ['main', 'api']");

    expect(webpackSimpleConfigSrc).not.toContain("public/app.js");
    expect(webpackSimpleConfigSrc).toContain("public/js/config.js");
  });
});
