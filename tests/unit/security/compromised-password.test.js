const { ValidationError } = require('../../../utils/errors');

describe('compromised password protection', () => {
  const originalFetch = global.fetch;
  const originalEnabled = process.env.COMPROMISED_PASSWORD_CHECK_ENABLED;
  const originalFailOpen = process.env.COMPROMISED_PASSWORD_CHECK_FAIL_OPEN;
  const originalCircuitThreshold = process.env.COMPROMISED_PASSWORD_CIRCUIT_FAILURE_THRESHOLD;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalEnabled === undefined) delete process.env.COMPROMISED_PASSWORD_CHECK_ENABLED;
    else process.env.COMPROMISED_PASSWORD_CHECK_ENABLED = originalEnabled;
    if (originalFailOpen === undefined) delete process.env.COMPROMISED_PASSWORD_CHECK_FAIL_OPEN;
    else process.env.COMPROMISED_PASSWORD_CHECK_FAIL_OPEN = originalFailOpen;
    if (originalCircuitThreshold === undefined) delete process.env.COMPROMISED_PASSWORD_CIRCUIT_FAILURE_THRESHOLD;
    else process.env.COMPROMISED_PASSWORD_CIRCUIT_FAILURE_THRESHOLD = originalCircuitThreshold;
    jest.resetModules();
  });

  it('always rejects obvious locally-known compromised passwords', async () => {
    const service = require('../../../services/compromisedPasswordService');
    await expect(service.assertPasswordNotCompromised('Password123'))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('uses only a SHA-1 prefix for remote k-anonymity checks', async () => {
    process.env.COMPROMISED_PASSWORD_CHECK_ENABLED = 'true';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => 'OTHER:1' });
    const service = require('../../../services/compromisedPasswordService');

    await service.assertPasswordNotCompromised('UniquePassword@934720');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/range\/[A-F0-9]{5}$/),
      expect.objectContaining({ headers: expect.objectContaining({ 'Add-Padding': 'true' }) })
    );
    expect(global.fetch.mock.calls[0][0]).not.toContain('UniquePassword');
  });

  it('fails closed when the remote check is enabled and unavailable', async () => {
    process.env.COMPROMISED_PASSWORD_CHECK_ENABLED = 'true';
    process.env.COMPROMISED_PASSWORD_CHECK_FAIL_OPEN = 'false';
    global.fetch = jest.fn().mockRejectedValue(new Error('network unavailable'));
    const service = require('../../../services/compromisedPasswordService');

    await expect(service.assertPasswordNotCompromised('UniquePassword@934720'))
      .rejects.toMatchObject({ name: 'ExternalServiceError', statusCode: 503 });
  });

  it('caches HIBP prefix responses and avoids repeated provider calls', async () => {
    process.env.COMPROMISED_PASSWORD_CHECK_ENABLED = 'true';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => 'OTHER:1' });
    const service = require('../../../services/compromisedPasswordService');

    await service.assertPasswordNotCompromised('UniquePassword@111111');
    await service.assertPasswordNotCompromised('UniquePassword@111111');

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('opens the circuit after the configured number of provider failures', async () => {
    process.env.COMPROMISED_PASSWORD_CHECK_ENABLED = 'true';
    process.env.COMPROMISED_PASSWORD_CHECK_FAIL_OPEN = 'false';
    process.env.COMPROMISED_PASSWORD_CIRCUIT_FAILURE_THRESHOLD = '1';
    global.fetch = jest.fn().mockRejectedValue(new Error('network unavailable'));
    const service = require('../../../services/compromisedPasswordService');

    await expect(service.assertPasswordNotCompromised('UniquePassword@222222')).rejects.toBeDefined();
    await expect(service.assertPasswordNotCompromised('UniquePassword@333333')).rejects.toBeDefined();

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
