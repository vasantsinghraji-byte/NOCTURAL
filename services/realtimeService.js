/**
 * Real-time delivery for chat and calls through AWS AppSync Events (managed
 * WebSockets; App Runner can't hold WebSocket connections itself).
 *
 * Channels (namespace "nabz"):
 *   /nabz/inbox/<p|u>-<id>  one per account: new messages, incoming calls
 *   /nabz/thread/<id>       one per conversation: messages, read receipts
 *   /nabz/call/<id>         one per call: WebRTC offer / answer / ICE between the two phones
 *
 * Clients never get AWS credentials. Our API gives them short-lived tokens
 * that list exactly which channels they may subscribe to (s) and publish to
 * (p); the Lambda authorizer (infra/realtime-authorizer) checks the token's
 * signature and the channel on every connect / subscribe / publish. The API
 * itself publishes with its AWS role (IAM, SigV4).
 *
 * Without configuration (local development, tests) publishing is a no-op and
 * the apps fall back to polling.
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

const NAMESPACE = 'nabz';
const TOKEN_TTL_SECONDS = 60 * 60;
const TURN_TTL_SECONDS = 6 * 60 * 60;

const config = () => ({
  httpDomain: (process.env.REALTIME_HTTP_DOMAIN || '').trim(),
  wsDomain: (process.env.REALTIME_WS_DOMAIN || '').trim(),
  region: process.env.REALTIME_REGION || process.env.AWS_REGION || 'ap-south-1',
  tokenSecret: process.env.REALTIME_TOKEN_SECRET || '',
  turnHost: (process.env.TURN_HOST || '').trim(),
  turnSecret: process.env.TURN_SECRET || ''
});

const isEnabled = () => {
  const c = config();
  return !!(c.httpDomain && c.wsDomain && c.tokenSecret.length >= 32);
};

const channels = {
  inbox: (who) => `/${NAMESPACE}/inbox/${who}`,
  thread: (id) => `/${NAMESPACE}/thread/${id}`,
  call: (id) => `/${NAMESPACE}/call/${id}`
};

/** "p-<patientId>" or "u-<userId>": an account's address on the inbox channel. */
const accountTag = (actor) => `${actor.kind === 'patient' ? 'p' : 'u'}-${actor.id}`;

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A signed token naming the channels this account may subscribe (s) and publish (p) to. */
function issueToken({ sub, subscribe = [], publish = [], ttlSeconds = TOKEN_TTL_SECONDS }, now = Date.now()) {
  const secret = config().tokenSecret;
  if (!secret) throw new Error('REALTIME_TOKEN_SECRET is not set');
  const body = b64url(JSON.stringify({ v: 1, sub, s: subscribe, p: publish, exp: Math.floor(now / 1000) + ttlSeconds }));
  const sig = b64url(crypto.createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

/** Same check the Lambda authorizer does (used by tests and diagnostics). */
function verifyToken(token, secret = config().tokenSecret, now = Date.now()) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig || !secret) return null;
  const expected = b64url(crypto.createHmac('sha256', secret).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let claims;
  try { claims = JSON.parse(Buffer.from(body, 'base64').toString('utf8')); } catch { return null; }
  if (!claims || claims.v !== 1 || !(claims.exp > now / 1000)) return null;
  return claims;
}

/** Where clients connect, or null when real-time isn't set up. */
function connectionInfo() {
  if (!isEnabled()) return null;
  const c = config();
  return { realtimeUrl: `wss://${c.wsDomain}/event/realtime`, httpHost: c.httpDomain };
}

// Node's crypto as the hash for SigV4 (no extra hashing package).
class NodeSha256 {
  constructor(secret) { this.h = secret ? crypto.createHmac('sha256', secret) : crypto.createHash('sha256'); }
  update(data) { this.h.update(typeof data === 'string' ? Buffer.from(data) : data); }
  async digest() { return new Uint8Array(this.h.digest()); }
}

let signer = null;
function getSigner() {
  if (!signer) {
    const { SignatureV4 } = require('@smithy/signature-v4');
    const { defaultProvider } = require('@aws-sdk/credential-provider-node');
    signer = new SignatureV4({ service: 'appsync', region: config().region, credentials: defaultProvider(), sha256: NodeSha256 });
  }
  return signer;
}

/**
 * Publish up to 5 events to a channel (HTTP + IAM). Never throws: real-time is
 * a speed-up, the message is already saved and clients also poll.
 */
async function publish(channel, events) {
  if (!isEnabled()) return false;
  const list = (Array.isArray(events) ? events : [events]).slice(0, 5).map((e) => JSON.stringify(e));
  try {
    const { HttpRequest } = require('@smithy/protocol-http');
    const host = config().httpDomain;
    const body = JSON.stringify({ channel, events: list });
    const request = new HttpRequest({ method: 'POST', protocol: 'https:', hostname: host, path: '/event', headers: { host, 'content-type': 'application/json' }, body });
    const signed = await getSigner().sign(request);
    const res = await fetch(`https://${host}/event`, { method: 'POST', headers: signed.headers, body });
    if (!res.ok) {
      logger.warn('Realtime publish failed', { channel: channel.split('/').slice(0, 3).join('/'), status: res.status });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn('Realtime publish error', { error: err.message });
    return false;
  }
}

/**
 * Load the API's AWS credentials once at startup (a signature on a dummy
 * request), so the first chat message isn't delayed by the credential fetch.
 */
async function warm() {
  if (!isEnabled()) return false;
  try {
    const { HttpRequest } = require('@smithy/protocol-http');
    const host = config().httpDomain;
    await getSigner().sign(new HttpRequest({ method: 'POST', protocol: 'https:', hostname: host, path: '/event', headers: { host }, body: '{}' }));
    return true;
  } catch (err) {
    logger.warn('Realtime warm-up failed', { error: err.message });
    return false;
  }
}

/**
 * Short-lived TURN credentials (coturn "use-auth-secret"): the relay checks
 * HMAC-SHA1(secret, "<expiry>:<tag>") without any account database.
 */
function iceServers(tag, now = Date.now()) {
  const { turnHost, turnSecret } = config();
  if (!turnHost || !turnSecret) return [{ urls: ['stun:stun.l.google.com:19302'] }];
  const username = `${Math.floor(now / 1000) + TURN_TTL_SECONDS}:${tag}`;
  const credential = crypto.createHmac('sha1', turnSecret).update(username).digest('base64');
  return [
    { urls: [`stun:${turnHost}:3478`] },
    { urls: [`turn:${turnHost}:3478?transport=udp`, `turn:${turnHost}:3478?transport=tcp`], username, credential }
  ];
}

module.exports = { isEnabled, channels, accountTag, issueToken, verifyToken, connectionInfo, publish, iceServers, warm, NAMESPACE };
