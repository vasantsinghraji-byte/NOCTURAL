/**
 * AppSync Events Lambda authorizer for Nabz chat and calls.
 *
 * Clients present a token from our API (services/realtimeService.js#issueToken):
 *   base64url(JSON { v: 1, sub, s: [channels to subscribe], p: [channels to publish], exp })
 *   + "." + base64url(HMAC-SHA256(secret, firstPart))
 * Connect: any valid token. Subscribe / publish: only to a channel named in the
 * token, exactly (no wildcards). The secret is read once from Secrets Manager.
 */

const crypto = require('crypto');

let secretPromise = null;
async function getSecret() {
  if (process.env.TOKEN_SECRET_FOR_TESTS) return process.env.TOKEN_SECRET_FOR_TESTS;
  if (!secretPromise) {
    const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
    secretPromise = new SecretsManagerClient({})
      .send(new GetSecretValueCommand({ SecretId: process.env.TOKEN_SECRET_ARN }))
      .then((r) => r.SecretString)
      .catch((err) => { secretPromise = null; throw err; });
  }
  return secretPromise;
}

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function verify(token, secret, nowSeconds) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = b64url(crypto.createHmac('sha256', secret).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let claims;
  try { claims = JSON.parse(Buffer.from(body, 'base64').toString('utf8')); } catch { return null; }
  if (!claims || claims.v !== 1 || typeof claims.exp !== 'number' || claims.exp <= nowSeconds) return null;
  if (!Array.isArray(claims.s) || !Array.isArray(claims.p)) return null;
  return claims;
}

/** "/nabz/inbox/p-1" from "nabz/inbox/p-1/" etc.; null for wildcards. */
function normalize(channel) {
  if (!channel || typeof channel !== 'string' || channel.includes('*')) return null;
  return `/${channel.replace(/^\/+|\/+$/g, '')}`;
}

const deny = { isAuthorized: false, ttlOverride: 0 };

exports.handler = async (event) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const claims = verify(event && event.authorizationToken, await getSecret(), now);
    if (!claims) return deny;
    const ctx = (event && event.requestContext) || {};
    const ttl = Math.max(0, Math.min(claims.exp - now, 300));
    if (ctx.operation === 'EVENT_CONNECT') return { isAuthorized: true, ttlOverride: ttl, handlerContext: { sub: String(claims.sub) } };
    const channel = normalize(ctx.channel);
    if (!channel) return deny;
    const allowed = ctx.operation === 'EVENT_SUBSCRIBE' ? claims.s : ctx.operation === 'EVENT_PUBLISH' ? claims.p : [];
    if (!allowed.includes(channel)) return deny;
    return { isAuthorized: true, ttlOverride: ttl, handlerContext: { sub: String(claims.sub) } };
  } catch (err) {
    // eslint-disable-next-line no-console -- Lambda logs go to CloudWatch
    console.error('authorizer error', err && err.message);
    return deny;
  }
};

exports._internals = { verify, normalize };
