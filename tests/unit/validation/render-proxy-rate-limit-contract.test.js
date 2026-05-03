const fs = require('fs');
const path = require('path');

describe('Render proxy rate-limit contract', () => {
  const appSrc = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'app.js'), 'utf8');

  it('configures Express trust proxy before rate limiters read req.ip', () => {
    const trustProxyIndex = appSrc.indexOf("app.set('trust proxy'");
    const rateLimiterIndex = appSrc.indexOf('app.use(globalRateLimiter)');

    expect(trustProxyIndex).toBeGreaterThan(-1);
    expect(rateLimiterIndex).toBeGreaterThan(-1);
    expect(trustProxyIndex).toBeLessThan(rateLimiterIndex);
  });

  it('keeps an explicit opt-out for non-proxied local deployments', () => {
    expect(appSrc).toContain("process.env.TRUST_PROXY === 'false'");
    expect(appSrc).toContain("app.set('trust proxy', false)");
    expect(appSrc).toContain("app.set('trust proxy', 1)");
  });
});
