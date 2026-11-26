/**
 * Aadhaar through DigiLocker (OAuth 2.0 with PKCE).
 *
 * Nabz is not allowed to authenticate Aadhaar with UIDAI directly, and must
 * not store Aadhaar numbers. DigiLocker lets the partner share their eAadhaar
 * with consent; we keep only the verified name, date of birth, gender and the
 * last 4 digits (see partnerVerificationService.recordDigilockerAadhaar).
 *
 * Needs DigiLocker partner credentials (apply at partners.digilocker.gov.in):
 *   DIGILOCKER_CLIENT_ID, DIGILOCKER_CLIENT_SECRET, DIGILOCKER_REDIRECT_URI
 *   (= <API origin>/api/v1/partners/digilocker/callback). Endpoints can be
 *   overridden with DIGILOCKER_BASE_URL if DigiLocker issues different ones.
 * Until then isConfigured() is false and partners upload a masked Aadhaar.
 *
 * The eAadhaar is fetched server-to-server over TLS with our access token, so
 * its origin is DigiLocker. Verifying UIDAI's XML signature as well is a
 * follow-up once the partner onboarding pack (with the certificate) arrives.
 */

const crypto = require('crypto');
const DigilockerSession = require('../models/digilockerSession');
const { ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');

const BASE = () => (process.env.DIGILOCKER_BASE_URL || 'https://digilocker.meripehchaan.gov.in/public/oauth2').replace(/\/+$/, '');
const SESSION_MS = 10 * 60 * 1000;
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest();

function isConfigured() {
  return !!(process.env.DIGILOCKER_CLIENT_ID && process.env.DIGILOCKER_CLIENT_SECRET && process.env.DIGILOCKER_REDIRECT_URI);
}

/** Where the partner is sent to sign in to DigiLocker and consent. */
async function startUrl(userId, returnTo = 'web', now = new Date()) {
  if (!isConfigured()) throw new ValidationError('DigiLocker isn’t set up yet. Upload a masked Aadhaar instead.');
  const state = b64url(crypto.randomBytes(32));
  const codeVerifier = b64url(crypto.randomBytes(48));
  await DigilockerSession.create({
    stateHash: sha256(state).toString('hex'),
    user: userId,
    codeVerifier,
    returnTo: returnTo === 'app' ? 'app' : 'web',
    expiresAt: new Date(now.getTime() + SESSION_MS)
  });
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.DIGILOCKER_CLIENT_ID,
    redirect_uri: process.env.DIGILOCKER_REDIRECT_URI,
    state,
    code_challenge: b64url(sha256(codeVerifier)),
    code_challenge_method: 'S256'
  });
  return `${BASE()}/1/authorize?${params}`;
}

/** Pull one attribute value out of the eAadhaar XML (values only, never markup). */
function attr(xml, tag, name) {
  const el = new RegExp(`<${tag}\\b([^>]*)>`, 'i').exec(xml);
  if (!el) return null;
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(el[1]);
  return m ? m[1] : null;
}

/** Extract the fields we keep. The uid in eAadhaar is already masked (xxxxxxxx1234). */
function parseEaadhaar(xml) {
  const text = String(xml || '').slice(0, 2_000_000);
  const uid = attr(text, 'UidData', 'uid') || '';
  return {
    name: attr(text, 'Poi', 'name'),
    dob: attr(text, 'Poi', 'dob'),
    gender: attr(text, 'Poi', 'gender'),
    last4: (uid.match(/(\d{4})\s*$/) || [])[1] || null
  };
}

/**
 * OAuth callback: check state (one use), exchange the code, fetch eAadhaar,
 * record it. Returns where to send the partner afterwards.
 */
async function handleCallback({ code, state, error }, deps = {}) {
  const http = deps.fetch || fetch;
  const record = deps.record || require('./partnerVerificationService').recordDigilockerAadhaar;
  if (!state) return { ok: false, reason: 'missing_state' };
  const session = await DigilockerSession.findOneAndDelete({ stateHash: sha256(String(state)).toString('hex'), expiresAt: { $gt: new Date() } });
  if (!session) return { ok: false, reason: 'expired' };
  const returnTo = session.returnTo;
  if (error || !code) return { ok: false, reason: 'declined', returnTo };
  try {
    const tokenRes = await http(`${BASE()}/2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        grant_type: 'authorization_code',
        client_id: process.env.DIGILOCKER_CLIENT_ID,
        client_secret: process.env.DIGILOCKER_CLIENT_SECRET,
        redirect_uri: process.env.DIGILOCKER_REDIRECT_URI,
        code_verifier: session.codeVerifier
      })
    });
    if (!tokenRes.ok) throw new Error(`token ${tokenRes.status}`);
    const token = await tokenRes.json();
    if (!token.access_token) throw new Error('no access token');
    const xmlRes = await http(`${BASE()}/3/xml/eaadhaar`, { headers: { Authorization: `Bearer ${token.access_token}` } });
    if (!xmlRes.ok) throw new Error(`eaadhaar ${xmlRes.status}`);
    const fields = parseEaadhaar(await xmlRes.text());
    const name = fields.name || token.name;
    if (!name) throw new Error('eAadhaar had no name');
    await record(session.user, { name, dob: fields.dob || token.dob, gender: fields.gender || token.gender, last4: fields.last4 });
    return { ok: true, returnTo };
  } catch (err) {
    logger.warn('DigiLocker Aadhaar fetch failed', { error: err.message });
    return { ok: false, reason: 'failed', returnTo };
  }
}

module.exports = { isConfigured, startUrl, handleCallback, parseEaadhaar };
