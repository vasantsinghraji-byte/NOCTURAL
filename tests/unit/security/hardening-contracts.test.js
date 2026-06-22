const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../..');
// Test-only contract helper; callers provide repository-relative constants.
// eslint-disable-next-line security/detect-non-literal-fs-filename
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

describe('security and reliability hardening contracts', () => {
  it('sanitizes API-driven frontend HTML before insertion', () => {
    const config = read('client/public/js/config.js');
    expect(config).toContain('sanitizeHtml: function');
    expect(config).toContain("querySelectorAll('script, iframe, object, embed, base, meta, link')");
    expect(config).toContain("name.startsWith('on')");
    [
      'client/public/js/provider-dashboard.js',
      'client/public/js/patient-health-dashboard.js',
      'client/public/js/patient-report-details.js',
      'client/public/js/doctor-duty-details.js'
    ].forEach(file => expect(read(file)).toContain('AppUi.setSafeHtml'));
  });

  it('requires admin authorization on hospital settings and analytics', () => {
    expect(read('routes/hospitalSettings.js')).toMatch(/router\.(get|put|post|delete)\([^]*authorize\('admin'\)/);
    expect(read('routes/analyticsOptimized.js')).toContain("router.get('/hospital/dashboard', protect, authorize('admin')");
  });

  it('uses fail-fast startup, scheduled reconciliation, and safe index migration', () => {
    expect(read('server.js')).toContain('await connectDB({ throwOnError: true })');
    expect(read('server.js')).toContain('reconciliationScheduler.start()');
    expect(read('package.json')).toContain('"db:indexes": "node scripts/safe-index-migration.js"');
    expect(read('jest.fast.config.js')).toContain('forceExit: false');
  });
});
