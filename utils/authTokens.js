const jwt = require('jsonwebtoken');

const IDENTITY_TYPES = Object.freeze({
  USER: 'user',
  PATIENT: 'patient'
});

const JWT_ALGORITHM = 'HS256';
const JWT_ISSUER = 'nocturnal-api';
const TOKEN_VERSION = 1;
const LEGACY_JWT_AUDIENCE = 'nocturnal';

const JWT_AUDIENCE_BY_IDENTITY = Object.freeze({
  [IDENTITY_TYPES.USER]: 'nocturnal:user',
  [IDENTITY_TYPES.PATIENT]: 'nocturnal:patient'
});

const JWT_ACCESS_SIGN_OPTIONS = Object.freeze({
  algorithm: JWT_ALGORITHM,
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE_BY_IDENTITY[IDENTITY_TYPES.USER]
});

const JWT_REFRESH_SIGN_OPTIONS = JWT_ACCESS_SIGN_OPTIONS;

const JWT_ACCESS_VERIFY_OPTIONS = Object.freeze({
  algorithms: [JWT_ALGORITHM],
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE_BY_IDENTITY[IDENTITY_TYPES.USER]
});

const JWT_REFRESH_VERIFY_OPTIONS = JWT_ACCESS_VERIFY_OPTIONS;

const getAudienceForIdentity = (identityType = IDENTITY_TYPES.USER) => {
  if (!JWT_AUDIENCE_BY_IDENTITY[identityType]) {
    throw new Error(`Unsupported token identity type: ${identityType}`);
  }

  return JWT_AUDIENCE_BY_IDENTITY[identityType];
};

const getVerifyOptions = (identityType) => ({
  algorithms: [JWT_ALGORITHM],
  issuer: JWT_ISSUER,
  audience: identityType
    ? getAudienceForIdentity(identityType)
    : Object.values(JWT_AUDIENCE_BY_IDENTITY)
});

const assertIdentity = (decoded, expectedIdentityType) => {
  if (!decoded.identityType || decoded.tokenVersion !== TOKEN_VERSION) {
    const error = new Error('Token identity or version is invalid');
    error.name = 'JsonWebTokenError';
    throw error;
  }

  if (expectedIdentityType && decoded.identityType !== expectedIdentityType) {
    const error = new Error('Token identity type does not match this auth boundary');
    error.name = 'JsonWebTokenError';
    throw error;
  }

  return decoded;
};

const signToken = (payload, secret, expiresIn, identityType, sessionVersion = 0) => jwt.sign(
  {
    ...payload,
    identityType,
    tokenVersion: TOKEN_VERSION,
    sessionVersion: Number(sessionVersion) || 0
  },
  secret,
  {
    ...JWT_ACCESS_SIGN_OPTIONS,
    audience: getAudienceForIdentity(identityType),
    expiresIn
  }
);

const generateAccessToken = (id, identityType = IDENTITY_TYPES.USER, sessionVersion = 0) => signToken(
  { id },
  process.env.JWT_SECRET,
  process.env.JWT_ACCESS_EXPIRE || '15m',
  identityType,
  sessionVersion
);

const generateRefreshToken = (id, identityType = IDENTITY_TYPES.USER, sessionVersion = 0) => signToken(
  { id, type: 'refresh' },
  process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
  process.env.JWT_REFRESH_EXPIRE || '7d',
  identityType,
  sessionVersion
);

const verifyAccessToken = (token, expectedIdentityType) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET, getVerifyOptions(expectedIdentityType));
  return assertIdentity(decoded, expectedIdentityType);
};

const verifyRefreshToken = (token, expectedIdentityType) => {
  const decoded = jwt.verify(
    token,
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    getVerifyOptions(expectedIdentityType)
  );
  const verified = assertIdentity(decoded, expectedIdentityType);
  if (verified.type !== 'refresh') {
    const error = new Error('Token is not a refresh token');
    error.name = 'JsonWebTokenError';
    throw error;
  }
  return verified;
};

module.exports = {
  IDENTITY_TYPES,
  JWT_ALGORITHM,
  JWT_ISSUER,
  TOKEN_VERSION,
  LEGACY_JWT_AUDIENCE,
  JWT_AUDIENCE_BY_IDENTITY,
  JWT_ACCESS_SIGN_OPTIONS,
  JWT_REFRESH_SIGN_OPTIONS,
  JWT_ACCESS_VERIFY_OPTIONS,
  JWT_REFRESH_VERIFY_OPTIONS,
  getAudienceForIdentity,
  generateAccessToken,
  generateRefreshToken,
  generateToken: generateAccessToken,
  verifyAccessToken,
  verifyRefreshToken
};
