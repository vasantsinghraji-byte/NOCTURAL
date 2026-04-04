const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..', '..');

const readProjectFile = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

const indexHtmlSrc = readProjectFile('client/public/index.html');
const indexUnifiedHtmlSrc = readProjectFile('client/public/index-unified.html');
const frontendSessionSrc = readProjectFile('client/public/js/frontend-session.js');
const landingSrc = readProjectFile('client/public/js/landing.js');
const indexUnifiedScriptSrc = readProjectFile('client/public/js/index-unified.js');
const configSrc = readProjectFile('client/public/js/config.js');
const adminDashboardSrc = readProjectFile('client/public/roles/admin/admin-dashboard.html');
const adminPostDutySrc = readProjectFile('client/public/roles/admin/admin-post-duty.html');
const renderYamlSrc = readProjectFile('render.yaml');

describe('Frontend Endpoint Resolution', () => {
  it('should keep the landing page on the shared frontend config path', () => {
    expect(indexHtmlSrc).toContain('<script src="js/config.js"></script>');
    expect(indexHtmlSrc).toContain('<script src="js/frontend-session.js"></script>');
    expect(indexHtmlSrc).toContain('<script src="js/landing.js"></script>');
    expect(indexUnifiedHtmlSrc).toContain('<script src="js/frontend-session.js"></script>');
    expect(frontendSessionSrc).toContain("AppConfig.fetch('auth/me', {");
    expect(frontendSessionSrc).toContain('parseJson: true');
    expect(landingSrc).toContain('NocturnalSession.getActiveUser()');
    expect(landingSrc).toContain("AppConfig.fetch('auth/login', {");
    expect(landingSrc).toContain('skipAuth: true');
    expect(landingSrc).toContain('parseJson: true');
    expect(landingSrc).toContain("AppConfig.fetch('auth/register', {");
    expect(landingSrc).not.toContain('http://localhost:5000');
    expect(landingSrc).not.toContain("fetch('/api");
    expect(landingSrc).not.toContain('fetch("/api');
    expect(indexUnifiedScriptSrc).toContain('NocturnalSession.getActiveUser()');
    expect(indexUnifiedScriptSrc).not.toContain('http://localhost:5000');
  });

  it('should resolve non-local API calls through same-origin config rather than a hardcoded render host', () => {
    expect(configSrc).toContain('window.location.origin');
    expect(configSrc).toContain('getConfiguredApiOrigin');
    expect(configSrc).not.toContain("hostname.includes('render.com')");
    expect(configSrc).not.toContain('https://nocturnal-api.onrender.com');
  });

  it('should centralize admin page API calls through AppConfig.api()', () => {
    expect(adminDashboardSrc).toContain("fetch(AppConfig.api(`users/${userId}`)");
    expect(adminDashboardSrc).toContain("fetch(AppConfig.api('duties/my-duties')");
    expect(adminDashboardSrc).toContain("fetch(AppConfig.api('applications/received')");
    expect(adminDashboardSrc).not.toContain('http://localhost:5000');
    expect(adminDashboardSrc).not.toContain('${API_URL}/');

    expect(adminPostDutySrc).toContain("fetch(AppConfig.api('duties')");
    expect(adminPostDutySrc).not.toContain('http://localhost:5000');
    expect(adminPostDutySrc).not.toContain('${API_URL}/');
  });

  it('should keep the Render blueprint aligned with same-origin /api rewrites', () => {
    expect(renderYamlSrc).toContain('source: /api/*');
    expect(renderYamlSrc).toContain('destination: https://nocturnal-api.onrender.com/api/*');
  });
});
