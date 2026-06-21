const { test, expect } = require('playwright/test');

const runStagingSmoke = process.env.RUN_STAGING_WEBAUTHN_SMOKE === 'true';
const baseUrl = (process.env.STAGING_WEBAUTHN_BASE_URL || '').replace(/\/$/, '');
const accessToken = process.env.STAGING_WEBAUTHN_ACCESS_TOKEN || '';
const cookieHeader = process.env.STAGING_WEBAUTHN_COOKIE || '';
const stagingTestSecret = process.env.STAGING_TEST_API_SECRET || '';

function parseCookieHeader(header, origin) {
  if (!header) return [];
  const hostname = new URL(origin).hostname;
  return header
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf('=');
      if (separator === -1) return null;
      return {
        name: part.slice(0, separator),
        value: part.slice(separator + 1),
        domain: hostname,
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: 'Lax'
      };
    })
    .filter(Boolean);
}

test.describe('staging WebAuthn smoke', () => {
  test.skip(!runStagingSmoke, 'Set RUN_STAGING_WEBAUTHN_SMOKE=true to run staging WebAuthn smoke tests.');
  test.skip(!baseUrl, 'Set STAGING_WEBAUTHN_BASE_URL to the staging HTTPS origin.');
  test.skip(baseUrl && !baseUrl.startsWith('https://'), 'STAGING_WEBAUTHN_BASE_URL must be a real HTTPS origin.');
  test.skip(
    !accessToken && !cookieHeader && !stagingTestSecret,
    'Set STAGING_TEST_API_SECRET, STAGING_WEBAUTHN_ACCESS_TOKEN, or STAGING_WEBAUTHN_COOKIE for staging auth.'
  );

  test('registers and revokes a passkey against the staging HTTPS origin', async ({ page, context }) => {
    let smokeAccountId;
    let smokeAccessToken = accessToken;

    if (stagingTestSecret) {
      const response = await fetch(`${baseUrl}/api/v1/staging/webauthn-smoke/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Staging-Test-Secret': stagingTestSecret
        }
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || `Failed to create staging smoke account: ${response.status}`);
      }
      smokeAccountId = data.accountId;
      smokeAccessToken = data.token;
    }

    if (!smokeAccessToken && cookieHeader) {
      await context.addCookies(parseCookieHeader(cookieHeader, baseUrl));
    }

    const client = await context.newCDPSession(page);
    await client.send('WebAuthn.enable');
    const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true
      }
    });

    let credentialId;
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      const result = await page.evaluate(async ({ token }) => {
        function decodeBase64Url(value) {
          const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
          const bytes = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
          return Uint8Array.from(bytes, character => character.charCodeAt(0));
        }

        function encodeBase64Url(value) {
          const bytes = new Uint8Array(value);
          const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
          return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        }

        function prepareCreationOptions(options) {
          return {
            ...options,
            challenge: decodeBase64Url(options.challenge),
            user: {
              ...options.user,
              id: decodeBase64Url(options.user.id)
            },
            excludeCredentials: (options.excludeCredentials || []).map(credential => ({
              ...credential,
              id: decodeBase64Url(credential.id)
            }))
          };
        }

        function serializeCredential(credential) {
          if (typeof credential.toJSON === 'function') return credential.toJSON();
          return {
            id: credential.id,
            rawId: encodeBase64Url(credential.rawId),
            type: credential.type,
            authenticatorAttachment: credential.authenticatorAttachment,
            clientExtensionResults: credential.getClientExtensionResults(),
            response: {
              attestationObject: encodeBase64Url(credential.response.attestationObject),
              clientDataJSON: encodeBase64Url(credential.response.clientDataJSON),
              transports: typeof credential.response.getTransports === 'function'
                ? credential.response.getTransports()
                : []
            }
          };
        }

        async function apiFetch(path, options = {}) {
          const response = await fetch(`/api/v1${path}`, {
            credentials: 'include',
            ...options,
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              ...(options.headers || {})
            }
          });
          const data = await response.json().catch(() => null);
          if (!response.ok || !data || data.success === false) {
            throw new Error((data && data.message) || `Request failed: ${response.status}`);
          }
          return data;
        }

        const creation = await apiFetch('/webauthn/registration/options', { method: 'POST' });
        const credential = await globalThis.navigator.credentials.create({
          publicKey: prepareCreationOptions(creation.options)
        });
        const verification = await apiFetch('/webauthn/registration/verify', {
          method: 'POST',
          body: JSON.stringify({
            challengeId: creation.challengeId,
            response: serializeCredential(credential),
            name: 'Staging smoke passkey'
          })
        });

        return {
          credentialId: verification.credentialId || credential.id,
          verified: verification.verified !== false
        };
      }, { token: smokeAccessToken });

      credentialId = result.credentialId;
      expect(result.verified).toBe(true);
      expect(credentialId).toEqual(expect.any(String));
    } finally {
      if (credentialId) {
        await page.evaluate(async ({ token, id }) => {
          await fetch(`/api/v1/webauthn/credentials/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            }
          });
        }, { token: smokeAccessToken, id: credentialId }).catch(() => {});
      }
      if (smokeAccountId && stagingTestSecret) {
        await fetch(`${baseUrl}/api/v1/staging/webauthn-smoke/accounts/${encodeURIComponent(smokeAccountId)}`, {
          method: 'DELETE',
          headers: {
            'X-Staging-Test-Secret': stagingTestSecret
          }
        }).catch(() => {});
      }
      await client.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId }).catch(() => {});
      await client.send('WebAuthn.disable').catch(() => {});
      await client.detach().catch(() => {});
    }
  });
});
