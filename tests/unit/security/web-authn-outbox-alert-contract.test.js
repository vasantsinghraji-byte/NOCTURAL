const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
// eslint-disable-next-line security/detect-non-literal-fs-filename
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

describe('WebAuthn recovery contracts', () => {
  it('exposes real WebAuthn registration and assertion verification routes', () => {
    const routes = read('routes/webAuthn.js');
    const rateLimits = read('middleware/webauthnRateLimit.js');
    const service = read('services/webAuthnService.js');

    expect(routes).toContain('/credentials');
    expect(routes).toContain('/registration/options');
    expect(routes).toContain('/registration/verify');
    expect(routes).toContain('/password-change/options');
    expect(routes).toContain('/password-change/verify');
    expect(routes).toContain('/recovery-codes');
    expect(routes).toContain('/lost-device/recover');
    expect(routes).toContain('recoveryCodeGenerationLimiter');
    expect(routes).toContain('lostDeviceRecoveryLimiter');
    expect(rateLimits).toContain('WEBAUTHN_RECOVERY_CODE_GENERATION_MAX');
    expect(rateLimits).toContain('WEBAUTHN_LOST_DEVICE_RECOVERY_MAX');
    expect(service).toContain('listCredentials');
    expect(service).toContain('revokeCredential');
    expect(service).toContain('generateRecoveryCodes');
    expect(service).toContain('recoverLostDevice');
    expect(service).toContain('verifyRegistrationResponse');
    expect(service).toContain('verifyAuthenticationResponse');
    expect(service).toContain('consumePasswordConfirmation');
  });

  it('records sensitive WebAuthn recovery events for audit processing', () => {
    const controller = read('controllers/webAuthnController.js');
    const auditService = read('services/securityAuditService.js');

    for (const event of [
      'webauthn_recovery_codes_generated',
      'webauthn_lost_device_recovered',
      'webauthn_lost_device_recovery_failed',
      'webauthn_passkey_revoked'
    ]) {
      expect(controller).toContain(event);
    }

    expect(auditService).toContain('recoveryCode');
    expect(auditService).toContain('targetId');
  });

  it('creates the security notification outbox inside password-change persistence', () => {
    const passwordService = read('services/passwordSecurityService.js');
    const outboxModel = read('models/securityNotificationOutbox.js');
    const outboxService = read('services/securityNotificationOutboxService.js');

    expect(passwordService).toContain('SecurityNotificationOutbox.create');
    expect(passwordService).toContain('payloadEncrypted');
    expect(passwordService).toContain('encodePayload');
    expect(outboxModel).toContain('payloadEncrypted');
    expect(outboxModel).toContain('purgeAfter');
    expect(outboxService).toContain('decodePayload');
    expect(outboxService).toContain('purgeAfter: retentionDate()');
    expect(passwordService).toContain('session.withTransaction');
    expect(passwordService).toContain('consumePasswordConfirmation');
  });

  it('keeps the staging WebAuthn smoke test opt-in and HTTPS-only', () => {
    const packageJson = read('package.json');
    const stagingSmoke = read('tests/e2e-webauthn/staging-webauthn-smoke.playwright.spec.cjs');
    const workflow = read('.github/workflows/staging-webauthn-smoke.yml');

    expect(packageJson).toContain('test:e2e:webauthn:staging');
    expect(stagingSmoke).toContain('RUN_STAGING_WEBAUTHN_SMOKE');
    expect(stagingSmoke).toContain('STAGING_WEBAUTHN_BASE_URL');
    expect(stagingSmoke).toContain("startsWith('https://')");
    expect(stagingSmoke).toContain('WebAuthn.addVirtualAuthenticator');
    expect(workflow).toContain('environment: staging');
    expect(workflow).toContain('STAGING_TEST_API_SECRET');
    expect(workflow).toContain('STAGING_WEBAUTHN_ACCESS_TOKEN');
    expect(workflow).toContain('STAGING_WEBAUTHN_COOKIE');
    expect(workflow).toContain('temporary smoke account automatically');
  });

  it('keeps staging-only smoke account APIs gated and mounted', () => {
    const routes = read('routes/stagingWebAuthnSmoke.js');
    const service = read('services/stagingWebAuthnSmokeService.js');
    const userModel = read('models/user.js');
    const v1 = read('routes/v1/index.js');

    expect(routes).toContain("process.env.NODE_ENV === 'staging'");
    expect(routes).toContain("process.env.ENABLE_STAGING_TEST_APIS === 'true'");
    expect(routes).toContain('STAGING_TEST_API_SECRET');
    expect(routes).toContain('/webauthn-smoke/accounts');
    expect(service).toContain('webauthn-smoke-');
    expect(service).toContain('generateAccessToken');
    expect(service).toContain('WebAuthnChallenge.deleteMany');
    expect(service).toContain('smokeTestExpiresAt');
    expect(userModel).toContain('smokeTestExpiresAt');
    expect(userModel).toContain('expireAfterSeconds: 0');
    expect(v1).toContain("router.use('/staging', stagingWebAuthnSmokeRoutes)");
    expect(read('tests/integration/security/staging-webauthn-smoke-api.test.js')).toContain('/api/v1/staging/webauthn-smoke/accounts');
  });

  it('requires an explicit trusted proxy IP before accepting location headers', () => {
    const metadata = read('utils/requestSecurityMetadata.js');

    expect(metadata).toContain('TRUSTED_LOCATION_PROXY_IPS');
    expect(metadata).toContain('trustedLocationProxy');
  });
});
