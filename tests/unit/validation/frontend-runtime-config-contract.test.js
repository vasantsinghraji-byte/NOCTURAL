const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..', '..');

const readProjectFile = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

const indexHtmlSrc = readProjectFile('client/public/index.html');
const frontendSessionSrc = readProjectFile('client/public/js/frontend-session.js');
const landingSrc = readProjectFile('client/public/js/landing.js');
const configSrc = readProjectFile('client/public/js/config.js');
const renderYamlSrc = readProjectFile('render.yaml');

const adminEntryPointPages = [
  'client/public/roles/admin/admin-dashboard.html',
  'client/public/roles/admin/admin-applications.html',
  'client/public/roles/admin/admin-analytics.html',
  'client/public/roles/admin/admin-post-duty.html',
  'client/public/roles/admin/admin-profile.html',
  'client/public/roles/admin/admin-settings.html'
].map((relativePath) => ({
  relativePath,
  source: readProjectFile(relativePath)
}));

describe('Frontend Runtime Config Contract', () => {
  it('should keep landing entrypoints wired to shared config and session helpers', () => {
    expect(indexHtmlSrc).toContain('<script src="js/config.js"></script>');
    expect(indexHtmlSrc).toContain('<script src="js/frontend-session.js"></script>');
    expect(indexHtmlSrc).toContain('<script src="js/landing.js"></script>');

    expect(frontendSessionSrc).toContain("AppConfig.fetchRoute('auth.me', {");
    expect(frontendSessionSrc).toContain('parseJson: true');
    expect(landingSrc).toContain('NocturnalSession.getActiveUser()');
    expect(landingSrc).toContain("AppConfig.fetchRoute('auth.login', {");
    expect(landingSrc).toContain('skipAuth: true');
    expect(landingSrc).toContain("AppConfig.fetchRoute('auth.register', {");
    expect(landingSrc).toContain("unifiedRegister: AppConfig.routes.page('sharedRegister')");

    expect(configSrc).toContain('const API_ROUTE_CONFIG = Object.freeze(');
    expect(configSrc).toContain('endpoint: function(pathKey, options = {})');
    expect(configSrc).toContain('fetchRoute: function(pathKey, options = {}, routeOptions = {})');
    expect(configSrc).toContain("unifiedLanding: '/shared/register.html'");
    expect(configSrc).toContain("browseDuties: '/roles/doctor/browse-shifts-enhanced.html'");
    expect(configSrc).toContain("profile: '/roles/doctor/doctor-profile-enhanced.html'");
    expect(configSrc).toContain("paymentsDashboard: '/roles/patient/patient-dashboard.html'");
  });

  it('should keep admin entrypoint pages wired to shared config and session helpers', () => {
    adminEntryPointPages.forEach(({ relativePath, source }) => {
      expect(source).toContain('<script src="/js/config.js"></script>');
      expect(source).toContain('<script src="/js/frontend-session.js"></script>');
      expect(source).not.toContain('http://localhost:5000');
    });
  });

  it('should resolve non-local API calls through same-origin config rather than a hardcoded render host', () => {
    expect(configSrc).toContain('window.location.origin');
    expect(configSrc).toContain('getConfiguredApiOrigin');
    expect(configSrc).not.toContain("hostname.includes('render.com')");
    expect(configSrc).not.toContain('https://nocturnal-api.onrender.com');
  });

  it('should keep the Render blueprint aligned with same-origin /api rewrites', () => {
    expect(renderYamlSrc).toContain('source: /api/*');
    expect(renderYamlSrc).toContain('destination: https://nocturnal-api.onrender.com/api/*');
  });
});
