const http = require('http');
const fs = require('fs');
const path = require('path');
const { test, expect } = require('playwright/test');

const publicDir = path.resolve(__dirname, '..', '..', 'client', 'public');
const port = Number(process.env.WEBAUTHN_E2E_PORT || 4183);
const localOrigin = `http://localhost:${port}`;
const base64Url = value => Buffer.from(value).toString('base64url');

let server;

const contentTypeFor = filePath => ({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png'
})[path.extname(filePath)] || 'application/octet-stream';

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const requested = new URL(req.url, localOrigin).pathname === '/'
      ? '/index.html'
      : new URL(req.url, localOrigin).pathname;
    const filePath = path.resolve(publicDir, `.${requested}`);
    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.readFile(filePath, (error, content) => {
      if (error) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentTypeFor(filePath) });
      res.end(content);
    });
  });
  await new Promise(resolve => server.listen(port, 'localhost', resolve));
});

test.afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});

test.describe('WebAuthn browser ceremony', () => {
  test('enrolls and confirms password changes with a virtual authenticator', async ({ page, context }) => {
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

    let registeredCredentialId;
    let verifyRequest;
    let passwordVerifyRequest;

    await page.route('**/api/v1/webauthn/registration/options', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          challengeId: '64f000000000000000000001',
          options: {
            challenge: base64Url('registration-challenge'),
            rp: { name: 'Nocturnal' },
            user: {
              id: base64Url('user-1'),
              name: 'doctor@example.test',
              displayName: 'Doctor Example'
            },
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
            timeout: 60000,
            attestation: 'none',
            authenticatorSelection: { userVerification: 'required' }
          }
        })
      });
    });

    await page.route('**/api/v1/webauthn/registration/verify', async route => {
      verifyRequest = route.request().postDataJSON();
      registeredCredentialId = verifyRequest.response.id;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, verified: true })
      });
    });

    await page.route('**/api/v1/webauthn/password-change/options', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          challengeId: '64f000000000000000000002',
          options: {
            challenge: base64Url('password-change-challenge'),
            userVerification: 'required',
            allowCredentials: [{ id: registeredCredentialId, type: 'public-key', transports: ['internal'] }],
            timeout: 60000
          }
        })
      });
    });

    await page.route('**/api/v1/webauthn/password-change/verify', async route => {
      passwordVerifyRequest = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, verified: true, confirmationId: '64f000000000000000000003' })
      });
    });

    await page.addInitScript(() => {
      window.NocturnalSession = {
        expectJsonSuccess(data, message) {
          if (data && data.success) return data;
          throw new Error(message || 'Request failed');
        }
      };
    });
    await page.goto(`${localOrigin}/index.html`);
    await page.addScriptTag({ url: `${localOrigin}/js/config.js` });
    await page.addScriptTag({ url: `${localOrigin}/js/session-management.js` });

    await page.evaluate(() => {
      const enroll = document.createElement('button');
      enroll.id = 'testEnrollPasskey';
      enroll.type = 'button';
      enroll.textContent = 'Enroll';
      enroll.addEventListener('click', async () => {
        try {
          window.__enrollResult = await window.NocturnalWebAuthn.enrollPasskey('Virtual authenticator');
        } catch (error) {
          window.__enrollError = error.message;
        }
      });
      document.body.appendChild(enroll);
    });
    await page.getByRole('button', { name: 'Enroll' }).click();
    await expect.poll(() => page.evaluate(() => window.__enrollResult || window.__enrollError)).toBeTruthy();
    expect(await page.evaluate(() => window.__enrollError)).toBeFalsy();

    expect(verifyRequest).toEqual(expect.objectContaining({
      challengeId: '64f000000000000000000001',
      name: 'Virtual authenticator'
    }));
    expect(verifyRequest.response).toEqual(expect.objectContaining({
      id: expect.any(String),
      type: 'public-key'
    }));

    await page.evaluate(() => {
      const confirm = document.createElement('button');
      confirm.id = 'testConfirmPasswordChange';
      confirm.type = 'button';
      confirm.textContent = 'Confirm';
      confirm.addEventListener('click', async () => {
        try {
          window.__confirmationId = await window.NocturnalWebAuthn.confirmPasswordChange();
        } catch (error) {
          window.__confirmError = error.message;
        }
      });
      document.body.appendChild(confirm);
    });
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect.poll(() => page.evaluate(() => window.__confirmationId || window.__confirmError)).toBeTruthy();
    expect(await page.evaluate(() => window.__confirmError)).toBeFalsy();
    const confirmationId = await page.evaluate(() => window.__confirmationId);

    expect(confirmationId).toBe('64f000000000000000000003');
    expect(passwordVerifyRequest).toEqual(expect.objectContaining({
      challengeId: '64f000000000000000000002'
    }));
    expect(passwordVerifyRequest.response.id).toBe(registeredCredentialId);

    await client.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
    await client.send('WebAuthn.disable');
    await client.detach();
  });
});
