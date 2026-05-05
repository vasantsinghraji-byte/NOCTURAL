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
const configSrc = readProjectFile('client/public/js/config.js');

describe('Frontend Transport Helper Contract', () => {
  it('should keep the shared API helper centered on AppConfig.fetch() and AppConfig.api()', () => {
    expect(apiHelperSrc).toContain("typeof AppConfig !== 'undefined'");
    expect(apiHelperSrc).toContain("typeof AppConfig.fetch === 'function'");
    expect(apiHelperSrc).toContain("typeof AppConfig.api === 'function'");
    expect(apiHelperSrc).toContain('return AppConfig.fetch(normalizedEndpoint, options);');
    expect(apiHelperSrc).toContain('parseJson: true');
    expect(apiHelperSrc).toContain('const shouldParseJson = requestOptions.parseJson === true;');
    expect(apiHelperSrc).toContain('const shouldParseText = requestOptions.parseText === true;');
    expect(apiHelperSrc).toContain('delete requestOptions.parseJson;');
    expect(apiHelperSrc).toContain('delete requestOptions.parseText;');
    expect(apiHelperSrc).toContain('return AppConfig.api(normalizedEndpoint);');
    expect(apiHelperSrc).toContain('return `/api/v1/${normalizedEndpoint}`;');
  });

  it('should keep auth helper requests routed through its centralized request helper', () => {
    expect(authHelperSrc).toContain('static buildApiUrl(endpoint)');
    expect(authHelperSrc).toContain('static request(endpoint, options = {})');
    expect(authHelperSrc).toContain("return AppConfig.fetch(normalizedEndpoint, options);");
    expect(authHelperSrc).toContain("const data = await this.request('auth/login', {");
    expect(authHelperSrc).toContain("const data = await this.request('auth/register', {");
    expect(authHelperSrc).toContain('const shouldParseJson = requestOptions.parseJson === true;');
    expect(authHelperSrc).toContain('const shouldParseText = requestOptions.parseText === true;');
    expect(authHelperSrc).toContain('delete requestOptions.parseJson;');
    expect(authHelperSrc).toContain('delete requestOptions.parseText;');
    expect(authHelperSrc).toContain('skipAuth: true');
    expect(authHelperSrc).toContain('parseJson: true');
    expect(authHelperSrc).not.toContain('static API_URL');
  });

  it('should keep notification and unified navigation helpers on centralized request helpers', () => {
    expect(notificationCenterSrc).toContain('buildApiUrl(endpoint)');
    expect(notificationCenterSrc).toContain('async fetchApi(endpoint, options = {})');
    expect(notificationCenterSrc).toContain("return AppConfig.fetch(normalizedEndpoint, options);");
    expect(notificationCenterSrc).toContain("typeof AppConfig !== 'undefined' && typeof AppConfig.getToken === 'function'");
    expect(notificationCenterSrc).toContain("const response = await this.fetchApi('notifications?limit=10');");
    expect(notificationCenterSrc).toContain("await this.fetchApi(`notifications/${notificationId}/read`, {");
    expect(notificationCenterSrc).toContain("await this.fetchApi('notifications/read-all', {");

    expect(unifiedNavSrc).toContain('buildApiUrl(endpoint)');
    expect(unifiedNavSrc).toContain('request(endpoint, options = {})');
    expect(unifiedNavSrc).toContain("return AppConfig.fetch(normalizedEndpoint, options);");
    expect(unifiedNavSrc).toContain("typeof AppConfig !== 'undefined' && typeof AppConfig.getToken === 'function'");
    expect(unifiedNavSrc).toContain("typeof AppConfig !== 'undefined' && typeof AppConfig.clearToken === 'function'");
    expect(unifiedNavSrc).toContain("const response = await this.request('auth/me', {");
    expect(unifiedNavSrc).toContain('window.location.origin');
  });

  it('should standardize pagination and generic utility fetch wrappers through AppConfig.fetch()', () => {
    expect(paginationSrc).toContain('async function fetchWithStandardConfig(endpoint, options = {})');
    expect(paginationSrc).toContain("typeof AppConfig !== 'undefined' && typeof AppConfig.fetch === 'function'");
    expect(paginationSrc).toContain('return AppConfig.fetch(toAppConfigEndpoint(endpoint), {');

    expect(utilsSrc).toContain("typeof AppConfig !== 'undefined' && typeof AppConfig.fetch === 'function'");
    expect(utilsSrc).toContain('await AppConfig.fetch(toStandardApiEndpoint(url), mergedOptions)');
  });

  it('should let AppConfig.fetch handle FormData uploads and response parsing options centrally', () => {
    expect(configSrc).toContain('const parseJsonBody = async (response) => {');
    expect(configSrc).toContain('const parseTextBody = async (response) => {');
    expect(configSrc).toContain("const AUTH_TOKEN_STORAGE_KEY = 'token';");
    expect(configSrc).toContain("const LEGACY_AUTH_TOKEN_KEYS = ['patientToken', 'providerToken'];");
    expect(configSrc).toContain('getToken: function(options = {})');
    expect(configSrc).toContain('isAuthenticated: function(options = {})');
    expect(configSrc).toContain('setToken: function(token)');
    expect(configSrc).toContain('clearToken: function()');
    expect(configSrc).toContain('getAuthHeaders: function(options = {})');
    expect(configSrc).toContain("if (token && !options.skipAuth)");
    expect(configSrc).toContain('const requestOptions = { ...options };');
    expect(configSrc).toContain('const shouldParseJson = requestOptions.parseJson === true;');
    expect(configSrc).toContain('const shouldParseText = requestOptions.parseText === true;');
    expect(configSrc).toContain('const defaultHeaders = this.getAuthHeaders(requestOptions);');
    expect(configSrc).toContain('delete requestOptions.skipAuth;');
    expect(configSrc).toContain('delete requestOptions.parseJson;');
    expect(configSrc).toContain('delete requestOptions.parseText;');
    expect(configSrc).toContain("requestOptions.body instanceof FormData");
    expect(configSrc).toContain("delete defaultHeaders['Content-Type'];");
    expect(configSrc).toContain('if (!shouldParseJson) {');
    expect(configSrc).toContain('if (!shouldParseText) {');
    expect(configSrc).toContain('const text = await parseTextBody(response);');
    expect(configSrc).toContain('const data = await parseJsonBody(response);');
  });
});
