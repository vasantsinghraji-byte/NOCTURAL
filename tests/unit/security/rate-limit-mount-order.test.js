const fs = require('fs');
const path = require('path');

describe('rate limiter mount order', () => {
  const appSrc = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'app.js'), 'utf8');

  it('mounts user scoped upload, search, and payment limiters after authentication', () => {
    expect(appSrc).toContain("const { protect } = require('./middleware/auth');");
    expect(appSrc).toContain("app.use('/api/v1/uploads', protect, uploadRateLimiter)");
    expect(appSrc).toContain("app.use('/api/v1/users/upload-document', protect, uploadRateLimiter)");
    expect(appSrc).toContain("app.use('/api/v1/duties/search', protect, searchRateLimiter)");
    expect(appSrc).toContain("app.use('/api/v1/users/search', protect, searchRateLimiter)");
    expect(appSrc).toContain("app.use('/api/v1/payments', protect, paymentRateLimiter)");
    expect(appSrc).toContain("app.use('/api/v1/earnings', protect, paymentRateLimiter)");
  });

  it('keeps public authentication and waitlist limiters before route handlers without requiring protect', () => {
    expect(appSrc).toContain("app.use('/api/v1/auth/login', authRateLimiter)");
    expect(appSrc).toContain("app.use('/api/v1/auth/register', authRateLimiter)");
    expect(appSrc).toContain("app.use('/api/v1/hospital-waitlist', hospitalWaitlistRateLimiter)");
    expect(appSrc).not.toContain("app.use('/api/v1/auth/login', protect, authRateLimiter)");
  });
});
