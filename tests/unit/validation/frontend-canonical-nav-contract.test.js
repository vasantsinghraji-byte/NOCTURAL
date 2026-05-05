const path = require('path');

const {
  fs,
  productionServedHtmlPaths,
  rootDir,
  toProjectRelativePath
} = require('./frontend-validation-utils');

const RETIRED_NAV_PATHS = [
  '/index-unified.html',
  '/roles/doctor/browse-duties.html',
  '/roles/doctor/doctor-profile.html',
  '/roles/patient/payments-dashboard.html'
];

describe('Frontend Canonical Nav Contract', () => {
  it('should keep active served HTML free of links to retired page paths', () => {
    const offenders = [];

    productionServedHtmlPaths.forEach((absolutePath) => {
      const source = fs.readFileSync(absolutePath, 'utf8');
      const relativePath = toProjectRelativePath(absolutePath);

      RETIRED_NAV_PATHS.forEach((retiredPath) => {
        if (source.includes(`href="${retiredPath}`) || source.includes(`href='${retiredPath}`)) {
          offenders.push(`${relativePath} -> ${retiredPath}`);
        }
      });
    });

    expect(offenders).toEqual([]);
  });

  it('should keep retired page source files physically absent from client/public', () => {
    [
      'client/public/index-unified.html',
      'client/public/roles/doctor/browse-duties.html',
      'client/public/roles/doctor/doctor-profile.html',
      'client/public/roles/patient/payments-dashboard.html'
    ].forEach((relativePath) => {
      expect(fs.existsSync(path.join(rootDir, relativePath))).toBe(false);
    });
  });
});
