/**
 * Customer sign-in with Google or a phone OTP (the welcome screen's main paths).
 *
 * Both only ever create CUSTOMER (Patient) accounts. Partner roles (medical
 * staff, pharmacy, lab, delivery) are never granted here: those go through a
 * reviewed PartnerApplication (services/partnerApplicationService.js).
 *
 * Google: the ID token is verified against Google (audience = our OAuth client
 * ids) — never trusted as-is. A verified Google email links to an existing
 * account with that email.
 * Phone: 6-digit code, stored only as an HMAC, 5-minute expiry, 5 attempts,
 * resend cooldown and an hourly cap per number.
 * New users finish with a profile step (name + phone/email) using a short-lived
 * signed "signup token" so the verified identity can't be swapped in between.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Patient = require('../models/patient');
const OtpChallenge = require('../models/otpChallenge');
const authTokens = require('../utils/authTokens');
const logger = require('../utils/logger');
const { ValidationError, AuthenticationError, ConflictError, ServiceError, RateLimitError } = require('../utils/errors');

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
const OTP_MAX_PER_WINDOW = 3;
const OTP_WINDOW_MS = 10 * 60 * 1000;
const SIGNUP_TOKEN_TTL = '15m';
const SIGNUP_AUDIENCE = 'nabz-signup';
const PHONE_RE = /^[6-9]\d{9}$/;

// ── helpers ────────────────────────────────────────────────────────────────

const secret = () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  return process.env.JWT_SECRET;
};

const hashCode = (phone, code) => crypto.createHmac('sha256', secret()).update(`${phone}:${code}`).digest('hex');

const normalizePhone = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  if (!PHONE_RE.test(digits)) throw new ValidationError('Enter a valid 10-digit Indian mobile number');
  return digits;
};

function publicPatient(p) {
  return {
    id: p._id,
    name: p.name,
    email: p.email,
    phone: p.phone,
    isVerified: p.isVerified,
    phoneVerified: p.phoneVerified,
    emailVerified: p.emailVerified,
    profilePhoto: p.profilePhoto
  };
}

async function issueSession(patient) {
  const withVersion = patient.sessionVersion !== undefined
    ? patient
    : await Patient.findById(patient._id).select('+sessionVersion');
  const token = authTokens.generateAccessToken(withVersion._id, authTokens.IDENTITY_TYPES.PATIENT, withVersion.sessionVersion);
  const refreshToken = authTokens.generateRefreshToken(withVersion._id, authTokens.IDENTITY_TYPES.PATIENT, withVersion.sessionVersion);
  await Patient.updateOne({ _id: withVersion._id }, { $set: { lastActive: new Date() } });
  return { token, refreshToken, patient: publicPatient(withVersion) };
}

function signupToken(claims) {
  return jwt.sign(claims, secret(), { expiresIn: SIGNUP_TOKEN_TTL, audience: SIGNUP_AUDIENCE, algorithm: 'HS256' });
}

function readSignupToken(token, kind) {
  try {
    const claims = jwt.verify(String(token || ''), secret(), { audience: SIGNUP_AUDIENCE, algorithms: ['HS256'] });
    if (claims.kind !== kind) throw new Error('wrong kind');
    return claims;
  } catch {
    throw new AuthenticationError('Your sign-in session expired. Please start again.');
  }
}

// A password nobody knows: OTP/Google accounts sign in without one.
const unusablePassword = () => `${crypto.randomBytes(24).toString('base64url')}Aa1!`;

async function createPatient({ name, email, phone, googleId, phoneVerified, emailVerified }) {
  const safeName = String(name || '').trim();
  if (safeName.length < 2) throw new ValidationError('Please tell us your name');
  const safeEmail = String(email || '').trim().toLowerCase();
  if (!/^[\w-.+]+@([\w-]+\.)+[\w-]{2,}$/.test(safeEmail)) throw new ValidationError('Please enter a valid email');
  const safePhone = normalizePhone(phone);

  const clash = await Patient.findOne({ $or: [{ email: safeEmail }, { phone: safePhone }] }).select('email phone');
  if (clash) {
    throw new ConflictError(clash.phone === safePhone
      ? 'This mobile number already has an account. Sign in with your phone instead.'
      : 'This email already has an account. Sign in with it instead.');
  }
  const patient = await Patient.create({
    name: safeName,
    email: safeEmail,
    phone: safePhone,
    password: unusablePassword(),
    googleId: googleId || undefined,
    phoneVerified: !!phoneVerified,
    emailVerified: !!emailVerified,
    isVerified: !!(phoneVerified || emailVerified)
  });
  return Patient.findById(patient._id).select('+sessionVersion');
}

// ── Google ─────────────────────────────────────────────────────────────────

let googleClient = null;
const googleAudiences = () => String(process.env.GOOGLE_OAUTH_CLIENT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);

function isGoogleEnabled() {
  return googleAudiences().length > 0;
}

async function verifyGoogleIdToken(idToken) {
  if (!isGoogleEnabled()) {
    throw new ServiceError(503, 'Google sign-in isn’t set up yet. Use your phone number or email.');
  }
  if (!googleClient) {
    const { OAuth2Client } = require('google-auth-library');
    googleClient = new OAuth2Client();
  }
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: String(idToken || ''), audience: googleAudiences() });
    payload = ticket.getPayload();
  } catch (err) {
    logger.logSecurity('google_token_invalid', { error: err.message });
    throw new AuthenticationError('Google sign-in could not be verified. Please try again.');
  }
  if (!payload || !payload.sub || !payload.email || payload.email_verified !== true) {
    throw new AuthenticationError('Your Google account email isn’t verified.');
  }
  return { googleId: payload.sub, email: payload.email.toLowerCase(), name: payload.name || '', picture: payload.picture };
}

/** Existing account → session. New → { needsProfile, signupToken, profile }. */
async function googleSignIn(idToken) {
  const g = await verifyGoogleIdToken(idToken);
  let patient = await Patient.findOne({ googleId: g.googleId }).select('+sessionVersion +googleId');
  if (!patient) {
    // Google verified this email, so linking it to the account with that email is safe.
    patient = await Patient.findOne({ email: g.email }).select('+sessionVersion +googleId');
    if (patient) {
      patient.googleId = g.googleId;
      patient.emailVerified = true;
      await patient.save();
      logger.info('Google account linked', { patientId: String(patient._id) });
    }
  }
  if (patient) {
    if (patient.isActive === false) throw new AuthenticationError('This account is deactivated. Contact support.');
    return { session: await issueSession(patient) };
  }
  return {
    needsProfile: true,
    signupToken: signupToken({ kind: 'google', googleId: g.googleId, email: g.email }),
    profile: { name: g.name, email: g.email, needs: ['phone'] }
  };
}

// ── Phone OTP ──────────────────────────────────────────────────────────────

let smsSender = async ({ phone, code }) => {
  if (process.env.SMS_PROVIDER) {
    // Real provider wiring (MSG91 / Firebase) goes here; see docs.
    throw new ServiceError(503, 'SMS provider not implemented yet');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new ServiceError(503, 'Phone sign-in isn’t available yet. Use Google or email.');
  }
  // Development only: the code goes to the server log instead of an SMS.
  logger.warn('DEV OTP (no SMS provider configured)', { phone: `******${phone.slice(-4)}`, code });
};

/** Test hook. */
function setSmsSender(fn) { smsSender = fn; }

async function startPhoneSignIn(rawPhone, requestIp) {
  const phone = normalizePhone(rawPhone);
  const now = Date.now();
  const recent = await OtpChallenge.find({ phone, createdAt: { $gte: new Date(now - OTP_WINDOW_MS) } }).sort({ createdAt: -1 }).lean();
  if (recent.length >= OTP_MAX_PER_WINDOW) {
    throw new RateLimitError('Too many codes requested. Please wait a few minutes.');
  }
  if (recent[0] && now - new Date(recent[0].createdAt).getTime() < OTP_RESEND_COOLDOWN_MS) {
    throw new RateLimitError('Please wait 30 seconds before requesting another code.');
  }
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await OtpChallenge.create({ phone, codeHash: hashCode(phone, code), expiresAt: new Date(now + OTP_TTL_MS), requestIp });
  await smsSender({ phone, code });
  return { sent: true, expiresInSeconds: OTP_TTL_MS / 1000, resendAfterSeconds: OTP_RESEND_COOLDOWN_MS / 1000 };
}

async function verifyPhoneSignIn(rawPhone, rawCode) {
  const phone = normalizePhone(rawPhone);
  const code = String(rawCode || '').replace(/\D/g, '');
  if (code.length !== 6) throw new ValidationError('Enter the 6-digit code');

  const challenge = await OtpChallenge.findOne({ phone, consumedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  if (!challenge) throw new AuthenticationError('Code expired. Request a new one.');
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) throw new AuthenticationError('Too many wrong attempts. Request a new code.');

  const expected = Buffer.from(challenge.codeHash, 'hex');
  const actual = Buffer.from(hashCode(phone, code), 'hex');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    await OtpChallenge.updateOne({ _id: challenge._id }, { $inc: { attempts: 1 } });
    logger.logSecurity('otp_wrong_code', { phone: `******${phone.slice(-4)}` });
    throw new AuthenticationError('That code isn’t right. Please check and try again.');
  }
  // Single use (CAS so two parallel verifies can't both pass).
  const consumed = await OtpChallenge.findOneAndUpdate(
    { _id: challenge._id, consumedAt: null },
    { $set: { consumedAt: new Date() } }
  );
  if (!consumed) throw new AuthenticationError('Code already used. Request a new one.');

  const patient = await Patient.findOne({ phone }).select('+sessionVersion');
  if (patient) {
    if (patient.isActive === false) throw new AuthenticationError('This account is deactivated. Contact support.');
    if (!patient.phoneVerified) await Patient.updateOne({ _id: patient._id }, { $set: { phoneVerified: true } });
    return { session: await issueSession(patient) };
  }
  return {
    needsProfile: true,
    signupToken: signupToken({ kind: 'phone', phone }),
    profile: { phone, needs: ['name', 'email'] }
  };
}

/** Finish a new customer account after Google / phone verification. */
async function completeSignup({ signupToken: token, name, email, phone }) {
  const decoded = jwt.decode(String(token || ''));
  const kind = decoded && decoded.kind;
  if (kind === 'google') {
    const claims = readSignupToken(token, 'google');
    const patient = await createPatient({ name, email: claims.email, phone, googleId: claims.googleId, emailVerified: true });
    return { session: await issueSession(patient) };
  }
  if (kind === 'phone') {
    const claims = readSignupToken(token, 'phone');
    const patient = await createPatient({ name, email, phone: claims.phone, phoneVerified: true });
    return { session: await issueSession(patient) };
  }
  throw new AuthenticationError('Your sign-in session expired. Please start again.');
}

function getMethods() {
  return {
    google: isGoogleEnabled(),
    phone: !!process.env.SMS_PROVIDER || process.env.NODE_ENV !== 'production',
    email: true
  };
}

module.exports = {
  getMethods,
  googleSignIn,
  startPhoneSignIn,
  verifyPhoneSignIn,
  completeSignup,
  setSmsSender,
  normalizePhone
};
