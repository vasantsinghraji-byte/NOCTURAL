/**
 * Payment keys in the right place: production refuses Razorpay TEST keys,
 * staging refuses LIVE keys; production warns without a separate backup-code key.
 */
const { validateEnvironment } = require('../../../config/validateEnv');

describe('startup checks for payment keys and the backup-code key', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });
  const run = (env) => {
    Object.assign(process.env, { RAZORPAY_ENABLED: 'true', MFA_RECOVERY_KEY: 'k'.repeat(64) }, env);
    return validateEnvironment({ throwOnError: false, logWarnings: false });
  };

  it('production with a test key is refused', () => {
    const r = run({ DEPLOYMENT_ENV: 'production', RAZORPAY_KEY_ID: 'rzp_test_abc123' });
    expect(r.errors.join(' ')).toMatch(/TEST key/);
  });

  it('staging with a live key is refused', () => {
    const r = run({ DEPLOYMENT_ENV: 'staging', RAZORPAY_KEY_ID: 'rzp_live_abc123' });
    expect(r.errors.join(' ')).toMatch(/LIVE key on staging/);
  });

  it('the right key in each place passes this check', () => {
    expect(run({ DEPLOYMENT_ENV: 'production', RAZORPAY_KEY_ID: 'rzp_live_abc123' }).errors.join(' ')).not.toMatch(/RAZORPAY_KEY_ID/);
    expect(run({ DEPLOYMENT_ENV: 'staging', RAZORPAY_KEY_ID: 'rzp_test_abc123' }).errors.join(' ')).not.toMatch(/RAZORPAY_KEY_ID/);
    expect(run({ DEPLOYMENT_ENV: 'production', RAZORPAY_KEY_ID: 'rzp_test_abc123', RAZORPAY_ENABLED: 'false' }).errors.join(' ')).not.toMatch(/RAZORPAY_KEY_ID/);
  });

  it('production without MFA_RECOVERY_KEY warns (does not stop the server)', () => {
    process.env.MFA_RECOVERY_KEY = '';
    const r = validateEnvironment({ throwOnError: false, logWarnings: false });
    process.env.DEPLOYMENT_ENV = 'production';
    delete process.env.MFA_RECOVERY_KEY;
    const p = validateEnvironment({ throwOnError: false, logWarnings: false });
    expect(p.warnings.join(' ')).toMatch(/MFA_RECOVERY_KEY/);
    expect(p.errors.join(' ')).not.toMatch(/MFA_RECOVERY_KEY/);
    expect(r).toBeDefined();
  });
});
