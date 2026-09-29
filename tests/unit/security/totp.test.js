const totp = require('../../../utils/totp');

// RFC 6238 Appendix B test vectors (SHA-1 secret "12345678901234567890"), last 6 digits.
const RFC_SECRET = totp.base32Encode(Buffer.from('12345678901234567890', 'ascii'));

describe('TOTP (RFC 6238)', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037']
  ])('matches the RFC vector at T=%i', (seconds, expected) => {
    expect(totp.codeAt(RFC_SECRET, Math.floor(seconds / 30))).toBe(expected);
  });

  it('base32 round-trips', () => {
    const secret = totp.generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(totp.base32Encode(totp.base32Decode(secret))).toBe(secret);
  });

  it('verifies the current code and one step of drift, not more', () => {
    const now = 1_700_000_000_000;
    const step = totp.currentStep(now);
    const secret = totp.generateSecret();
    expect(totp.verify(secret, totp.codeAt(secret, step), { nowMs: now })).toBe(step);
    expect(totp.verify(secret, totp.codeAt(secret, step - 1), { nowMs: now })).toBe(step - 1);
    expect(totp.verify(secret, totp.codeAt(secret, step - 3), { nowMs: now })).toBeNull();
  });

  it('rejects replays of an already-used step and malformed input', () => {
    const now = 1_700_000_000_000;
    const step = totp.currentStep(now);
    const secret = totp.generateSecret();
    expect(totp.verify(secret, totp.codeAt(secret, step), { nowMs: now, afterStep: step })).toBeNull();
    expect(totp.verify(secret, '12345', { nowMs: now })).toBeNull();
    expect(totp.verify(secret, 'abcdef', { nowMs: now })).toBeNull();
    expect(totp.verify(null, '123456', { nowMs: now })).toBeNull();
  });

  it('builds an otpauth URI for authenticator apps', () => {
    const uri = totp.otpauthUri({ secret: 'JBSWY3DPEHPK3PXP', account: 'ops@nabz.in' });
    expect(uri).toMatch(/^otpauth:\/\/totp\/Nabz%20Admin%3Aops%40nabz\.in\?/);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=Nabz+Admin');
  });
});
