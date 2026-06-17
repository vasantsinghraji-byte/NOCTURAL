const { defineConfig } = require('playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e-webauthn',
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${process.env.WEBAUTHN_E2E_PORT || 4183}`
  }
});
