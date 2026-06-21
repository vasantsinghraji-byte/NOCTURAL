const {
  assertStackScope,
  getScopeViolations,
  normalizePath
} = require('../../../scripts/check-pr-stack-scope');

describe('PR stack frontend ownership scope', () => {
  it('rejects patient frontend files in the patient backend PR', () => {
    expect(() => assertStackScope('fix/patient-data-hardening', [
      'services/healthMetricService.js',
      'client/public/js/patient-analytics.js',
      'client/public/roles/patient/patient-dashboard.html'
    ])).toThrow(/PR #86 frontend raw-HTML hardening/);
  });

  it('rejects doctor frontend files in the provider backend PR', () => {
    expect(getScopeViolations('fix/provider-ops-hardening', [
      'routes/certifications.js',
      'client\\public\\js\\doctor-profile-enhanced.js'
    ])).toEqual(['client/public/js/doctor-profile-enhanced.js']);
  });

  it('allows backend and test files in the narrowed PRs', () => {
    expect(() => assertStackScope('fix/patient-data-hardening', [
      'controllers/patientController.js',
      'tests/unit/data-integrity/health-record-metrics.test.js'
    ])).not.toThrow();
    expect(() => assertStackScope('fix/provider-ops-hardening', [
      'routes/certifications.js',
      'tests/unit/security/certification-route-authorization.test.js'
    ])).not.toThrow();
  });

  it('does not constrain unrelated stack branches', () => {
    expect(getScopeViolations('fix/frontend-raw-html-hardening', [
      'client/public/js/patient-analytics.js'
    ])).toEqual([]);
    expect(normalizePath('client\\public\\js\\patient-dashboard.js'))
      .toBe('client/public/js/patient-dashboard.js');
  });
});
