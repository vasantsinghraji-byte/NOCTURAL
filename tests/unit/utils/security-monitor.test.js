jest.mock('../../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('../../../utils/monitoring', () => ({
  triggerAlert: jest.fn()
}));

const MAX_BLOCK_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

describe('securityMonitor block duration handling', () => {
  let securityMonitor;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    jest.resetModules();
    securityMonitor = require('../../../utils/securityMonitor');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('caps externally supplied block durations before scheduling unblock timers', async () => {
    const ip = '203.0.113.10';

    await securityMonitor.blockIP(ip, {
      reason: 'test',
      duration: Number.MAX_SAFE_INTEGER,
      blockedBy: 'admin-user'
    });

    const [blockedIp] = await securityMonitor.getBlockedIPs();

    expect(blockedIp.expiresAt).toEqual(new Date(Date.now() + MAX_BLOCK_DURATION_MS));
    expect(securityMonitor.isIPBlocked(ip)).toBe(true);

    jest.advanceTimersByTime(MAX_BLOCK_DURATION_MS - 1);
    expect(securityMonitor.isIPBlocked(ip)).toBe(true);

    jest.advanceTimersByTime(1);
    expect(securityMonitor.isIPBlocked(ip)).toBe(false);
  });

  it('keeps invalid block durations permanent instead of scheduling user-controlled timers', async () => {
    const ip = '203.0.113.11';

    await securityMonitor.blockIP(ip, {
      reason: 'test',
      duration: 'not-a-number',
      blockedBy: 'admin-user'
    });

    const [blockedIp] = await securityMonitor.getBlockedIPs();

    expect(blockedIp.expiresAt).toBeNull();
    jest.runOnlyPendingTimers();
    expect(securityMonitor.isIPBlocked(ip)).toBe(true);
  });
});
