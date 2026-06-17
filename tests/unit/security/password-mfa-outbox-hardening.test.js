jest.mock('../../../services/refreshSessionService', () => ({
  revokeAllForUser: jest.fn().mockResolvedValue({ modifiedCount: 2 })
}));
jest.mock('../../../services/compromisedPasswordService', () => ({
  assertPasswordNotCompromised: jest.fn().mockResolvedValue()
}));
jest.mock('../../../services/webAuthnService', () => ({
  consumePasswordConfirmation: jest.fn().mockResolvedValue()
}));
jest.mock('../../../models/securityNotificationOutbox', () => ({
  create: jest.fn().mockResolvedValue({})
}));
jest.mock('../../../utils/monitoring', () => ({
  trackError: jest.fn()
}));

const webAuthnService = require('../../../services/webAuthnService');
const passwordSecurityService = require('../../../services/passwordSecurityService');
const { getRequestSecurityMetadata } = require('../../../utils/requestSecurityMetadata');

const makeIdentity = credentials => ({
  _id: 'user-1',
  email: 'user@example.test',
  name: 'User',
  password: 'old',
  sessionVersion: 0,
  webAuthnCredentials: credentials,
  comparePassword: jest.fn().mockResolvedValue(true),
  save: jest.fn().mockResolvedValue()
});

describe('password MFA, outbox, and proxy hardening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.TRUSTED_LOCATION_PROXY_IPS;
  });

  it('consumes a one-time WebAuthn confirmation when a passkey is enrolled', async () => {
    const identity = makeIdentity([{ credentialId: 'credential-1' }]);
    const IdentityModel = {
      findById: jest.fn(() => ({ select: jest.fn().mockResolvedValue(identity) }))
    };

    await passwordSecurityService.changePassword({
      IdentityModel,
      identityId: 'user-1',
      userType: 'user',
      currentPassword: 'old',
      newPassword: 'NewPassword@123',
      webauthnConfirmationId: 'confirmation-1'
    });

    expect(webAuthnService.consumePasswordConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: 'user-1',
        identityType: 'user',
        confirmationId: 'confirmation-1'
      })
    );
  });

  it('does not trust location headers from an unconfigured proxy', () => {
    const metadata = getRequestSecurityMetadata({
      headers: { 'x-vercel-ip-city': 'Spoofed', 'x-vercel-ip-country': 'XX' },
      socket: { remoteAddress: '203.0.113.10' },
      ip: '198.51.100.1'
    });
    expect(metadata.approximateLocation).toBeUndefined();
  });

  it('accepts location headers only from an explicitly trusted proxy', () => {
    process.env.TRUSTED_LOCATION_PROXY_IPS = '203.0.113.10';
    const metadata = getRequestSecurityMetadata({
      headers: { 'x-vercel-ip-city': 'Mumbai', 'x-vercel-ip-country': 'IN' },
      socket: { remoteAddress: '::ffff:203.0.113.10' },
      ip: '198.51.100.1'
    });
    expect(metadata.approximateLocation).toBe('Mumbai, IN');
  });
});
