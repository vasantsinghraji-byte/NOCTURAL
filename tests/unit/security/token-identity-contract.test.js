const jwt = require('jsonwebtoken');
const {
  IDENTITY_TYPES,
  JWT_ISSUER,
  TOKEN_VERSION,
  generateAccessToken,
  verifyAccessToken
} = require('../../../utils/authTokens');

describe('token identity contract', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'token-identity-contract-secret';
  });

  it('signs mandatory issuer, audience, identity, and version claims', () => {
    const token = generateAccessToken('user-1', IDENTITY_TYPES.USER, 7);
    const decoded = verifyAccessToken(token, IDENTITY_TYPES.USER);
    expect(decoded).toEqual(expect.objectContaining({
      iss: JWT_ISSUER,
      aud: 'nocturnal:user',
      identityType: IDENTITY_TYPES.USER,
      tokenVersion: TOKEN_VERSION,
      sessionVersion: 7
    }));
  });

  it('rejects a patient token at the provider boundary', () => {
    const token = generateAccessToken('shared-id', IDENTITY_TYPES.PATIENT);
    expect(() => verifyAccessToken(token, IDENTITY_TYPES.USER)).toThrow();
  });

  it('rejects legacy tokens without identity and version claims', () => {
    const token = jwt.sign({ id: 'user-1' }, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      issuer: JWT_ISSUER,
      audience: 'nocturnal:user',
      expiresIn: '15m'
    });
    expect(() => verifyAccessToken(token, IDENTITY_TYPES.USER)).toThrow('Token identity or version is invalid');
  });
});
