const { defineConfig } = require('playwright/test');

const hasExternalBaseUrl = Boolean(process.env.PUBLIC_FUNNEL_BASE_URL);
const port = process.env.PUBLIC_FUNNEL_PORT || 4173;

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: process.env.PUBLIC_FUNNEL_BASE_URL || `http://127.0.0.1:${port}`
  },
  webServer: hasExternalBaseUrl ? undefined : {
    command: `node tests/e2e/static-public-server.cjs ${port}`,
    url: `http://127.0.0.1:${port}/index.html`,
    reuseExistingServer: true,
    timeout: 10_000
  }
});
