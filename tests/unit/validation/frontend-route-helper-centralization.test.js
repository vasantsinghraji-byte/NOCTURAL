const {
  fs,
  frontendJsFilePaths,
  rootDir,
  toProjectRelativePath
} = require('./frontend-validation-utils');

const dynamicRoutePatterns = [
  /window\.location\.href\s*=\s*['"`](?:\/|\/index\.html|index\.html|\/roles\/|[a-z-]+\.html)/,
  /window\.location\.replace\s*\(\s*['"`](?:\/|\/index\.html|index\.html|\/roles\/|[a-z-]+\.html)/,
  /redirectUrl:\s*['"`](?:\/|\/index\.html|index\.html|\/roles\/|[a-z-]+\.html)/,
  /dataset\.route\s*=\s*['"`](?:\/|\/roles\/|[a-z-]+\.html)/,
  /href=["'`](?:\/roles\/|\/index\.html|index\.html|[a-z-]+\.html)/
];

describe('Frontend Route Helper Centralization', () => {
  it('should keep dynamic frontend redirects and generated page links on AppConfig.routes helpers', () => {
    const offenders = [];

    frontendJsFilePaths.forEach((absolutePath) => {
      const source = fs.readFileSync(absolutePath, 'utf8');
      const relativePath = toProjectRelativePath(absolutePath);

      if (dynamicRoutePatterns.some((pattern) => pattern.test(source))) {
        offenders.push(relativePath);
      }
    });

    expect(offenders.sort()).toEqual([]);
  });

  it('should centralize route definitions in config.js', () => {
    const configSrc = fs.readFileSync(require('path').join(rootDir, 'client/public/js/config.js'), 'utf8');

    expect(configSrc).toContain('const ROUTE_CONFIG = Object.freeze(');
    expect(configSrc).toContain('const AppRoutes = {');
    expect(configSrc).toContain('page: function(pathKey, queryParams)');
    expect(configSrc).toContain('dashboardForRole: function(role)');
    expect(configSrc).toContain('loginForRole: function(role)');
  });
});
