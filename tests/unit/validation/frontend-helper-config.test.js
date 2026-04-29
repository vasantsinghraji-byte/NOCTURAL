const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..', '..');

const readProjectFile = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

const apiHelperSrc = readProjectFile('client/public/api.js');
const authHelperSrc = readProjectFile('client/public/js/auth.js');
const notificationCenterSrc = readProjectFile('client/public/js/notification-center.js');
const unifiedNavSrc = readProjectFile('client/public/js/unified-nav.js');
const paginationSrc = readProjectFile('client/public/js/pagination.js');
const utilsSrc = readProjectFile('client/public/js/utils.js');

describe('Frontend Helper Configuration', () => {
  it('should resolve shared API helpers through AppConfig or same-origin fallbacks instead of localhost', () => {
    [apiHelperSrc, authHelperSrc, notificationCenterSrc, unifiedNavSrc, paginationSrc, utilsSrc].forEach((source) => {
      expect(source).not.toContain('http://localhost:5000');
    });
  });

  it('should keep the shared API helper centered on AppConfig.fetch() and AppConfig.api()', () => {
    expect(apiHelperSrc).toContain("typeof AppConfig !== 'undefined'");
    expect(apiHelperSrc).toContain("typeof AppConfig.fetch === 'function'");
    expect(apiHelperSrc).toContain("typeof AppConfig.api === 'function'");
    expect(apiHelperSrc).toContain('return AppConfig.fetch(normalizedEndpoint, options);');
    expect(apiHelperSrc).toContain('return AppConfig.api(normalizedEndpoint);');
    expect(apiHelperSrc).toContain('return `/api/v1/${normalizedEndpoint}`;');
  });

  it('should keep auth helper requests routed through its centralized request helper', () => {
    expect(authHelperSrc).toContain('static buildApiUrl(endpoint)');
    expect(authHelperSrc).toContain('static request(endpoint, options = {})');
    expect(authHelperSrc).toContain("return AppConfig.fetch(normalizedEndpoint, options);");
    expect(authHelperSrc).toContain("const response = await this.request('auth/login', {");
    expect(authHelperSrc).toContain("const response = await this.request('auth/register', {");
    expect(authHelperSrc).not.toContain('static API_URL');
  });

  it('should keep notification and unified navigation helpers on centralized request helpers', () => {
    expect(notificationCenterSrc).toContain('buildApiUrl(endpoint)');
    expect(notificationCenterSrc).toContain('async fetchApi(endpoint, options = {})');
    expect(notificationCenterSrc).toContain("return AppConfig.fetch(normalizedEndpoint, options);");
    expect(notificationCenterSrc).toContain("const response = await this.fetchApi('notifications?limit=10');");
    expect(notificationCenterSrc).toContain("await this.fetchApi(`notifications/${notificationId}/read`, {");
    expect(notificationCenterSrc).toContain("await this.fetchApi('notifications/read-all', {");

    expect(unifiedNavSrc).toContain('buildApiUrl(endpoint)');
    expect(unifiedNavSrc).toContain('request(endpoint, options = {})');
    expect(unifiedNavSrc).toContain("return AppConfig.fetch(normalizedEndpoint, options);");
    expect(unifiedNavSrc).toContain("const response = await this.request('auth/me', {");
    expect(unifiedNavSrc).toContain('return `/api/v1/${normalizedEndpoint}`;');
  });

  it('should standardize pagination and generic utility fetch wrappers through AppConfig.fetch()', () => {
    expect(paginationSrc).toContain('async function fetchWithStandardConfig(endpoint, options = {})');
    expect(paginationSrc).toContain("typeof AppConfig !== 'undefined' && typeof AppConfig.fetch === 'function'");
    expect(paginationSrc).toContain('return AppConfig.fetch(toAppConfigEndpoint(endpoint), {');

    expect(utilsSrc).toContain("typeof AppConfig !== 'undefined' && typeof AppConfig.fetch === 'function'");
    expect(utilsSrc).toContain('await AppConfig.fetch(toStandardApiEndpoint(url), mergedOptions)');
  });
});
