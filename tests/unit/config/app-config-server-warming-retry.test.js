const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..', '..', '..');
const configSrc = fs.readFileSync(path.join(rootDir, 'client/public/js/config.js'), 'utf8');

function loadAppConfig(fetchImpl) {
  const events = [];
  const context = {
    window: {
      location: {
        hostname: 'app.nocturnal.test',
        origin: 'https://app.nocturnal.test',
        protocol: 'https:'
      },
      dispatchEvent(event) {
        events.push({ type: event.type, detail: event.detail });
        return true;
      }
    },
    document: { querySelector: () => null },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {}
    },
    console: { log: () => {}, error: () => {} },
    fetch: fetchImpl,
    FormData: function FormData() {},
    CustomEvent: function CustomEvent(type, options) {
      this.type = type;
      this.detail = options.detail;
    },
    AbortController,
    setTimeout,
    clearTimeout
  };

  vm.createContext(context);
  vm.runInContext(configSrc, context);

  return { AppConfig: context.window.AppConfig, events };
}

const okResponse = (body = { ok: true }) => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  text: async () => JSON.stringify(body)
});

const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });

describe('AppConfig.fetch server-warming retry', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])('retries safe %s requests once', async (method) => {
    const fetchImpl = jest.fn()
      .mockRejectedValueOnce(abortError())
      .mockResolvedValueOnce(okResponse());
    const { AppConfig, events } = loadAppConfig(fetchImpl);

    await AppConfig.fetch('/duties?private=value', { method, parseJson: true });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(events).toEqual([
      { type: 'nocturnal:server-warming', detail: { attempt: 2, method } },
      { type: 'nocturnal:server-warming-complete', detail: { attempt: 2, method, outcome: 'success' } }
    ]);
    expect(JSON.stringify(events)).not.toContain('duties');
    expect(JSON.stringify(events)).not.toContain('private');
  });

  it('does not retry an unsafe mutation without an idempotency key', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const { AppConfig, events } = loadAppConfig(fetchImpl);

    await expect(AppConfig.fetch('/bookings', {
      method: 'POST',
      body: JSON.stringify({ patient: 'private' }),
      parseJson: true
    })).rejects.toThrow('Failed to fetch');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(events).toEqual([]);
  });

  it('retries a mutation only when it carries an explicit idempotency key', async () => {
    const fetchImpl = jest.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(okResponse());
    const { AppConfig, events } = loadAppConfig(fetchImpl);

    await AppConfig.fetch('/payments', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'private-key' },
      parseJson: true
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(events[0]).toEqual({
      type: 'nocturnal:server-warming',
      detail: { attempt: 2, method: 'POST' }
    });
    expect(JSON.stringify(events)).not.toContain('private-key');
  });

  it('does not retry HTTP responses', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: { get: () => null },
      text: async () => JSON.stringify({ message: 'Validation failed' })
    });
    const { AppConfig, events } = loadAppConfig(fetchImpl);

    await expect(AppConfig.fetch('/duties', { parseJson: true }))
      .rejects.toMatchObject({ status: 400 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(events).toEqual([]);
  });

  it('retries a key-bearing mutation once on a guarded 503 with Retry-After', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        headers: { get: (name) => name === 'Retry-After' ? '30' : null },
        text: async () => JSON.stringify({ message: 'This operation is temporarily unavailable' })
      })
      .mockResolvedValueOnce(okResponse());
    const { AppConfig, events } = loadAppConfig(fetchImpl);

    await AppConfig.fetch('/bookings', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'private-key' },
      parseJson: true
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(events[0]).toEqual({
      type: 'nocturnal:server-warming',
      detail: { attempt: 2, method: 'POST' }
    });
  });

  it('dispatches failure completion after the single retry fails', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(abortError());
    const { AppConfig, events } = loadAppConfig(fetchImpl);

    await expect(AppConfig.fetch('/duties', { parseJson: true }))
      .rejects.toThrow('Request timeout');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(events[1]).toEqual({
      type: 'nocturnal:server-warming-complete',
      detail: { attempt: 2, method: 'GET', outcome: 'failure' }
    });
  });
});
