/**
 * Double-tap and retry safety for money requests (place an order, book, pay,
 * withdraw). Used by the API client for both the app and the website.
 *
 *   in flight   the same request (method + path + body) while the first is
 *               still running gets the first one's result: one request is sent
 *   2 minutes   the same request again within REPEAT_WINDOW_MS reuses the same
 *               Idempotency-Key, so the server replays the original result
 *               instead of creating a second order (also covers a retry after
 *               the network dropped the first response)
 *
 * The server side (middleware/idempotency.js) stores the key per account and
 * route, rejects the same key with a different body, and caches only
 * successful responses, so a failed attempt can be retried.
 */

export const REPEAT_WINDOW_MS = 2 * 60 * 1000;

/** POST/PUT routes where a duplicate would create or move money twice. */
export const MONEY_ROUTES: RegExp[] = [
  /^\/pharmacy\/orders$/,
  /^\/pharmacy\/checkouts$/,
  /^\/pharmacy\/orders\/[^/]+\/(payment|payment\/verify|cancel|items)$/,
  /^\/bookings$/,
  /^\/bookings\/package$/,
  /^\/bookings\/[^/]+\/(cancel|offer\/accept)$/,
  /^\/marketplace\/plans$/,
  /^\/marketplace\/plans\/[^/]+\/(payment\/order|payment\/verify|cancel)$/,
  /^\/marketplace\/labs\/orders$/,
  /^\/marketplace\/labs\/orders\/[^/]+\/(payment\/order|payment\/verify|cancel)$/,
  /^\/marketplace\/partner\/ads\/wallet\/(order|verify)$/,
  /^\/membership\/(trial|checkout|verify)$/,
  /^\/partners\/me\/withdrawals$/,
  /^\/payments-b2c\/.+$/
];

export function isMoneyRequest(method: string, path: string): boolean {
  const m = method.toUpperCase();
  if (m !== 'POST' && m !== 'PUT') return false;
  const clean = path.split('?')[0];
  return MONEY_ROUTES.some((re) => re.test(clean));
}

/** A random key; uniqueness is what matters here, not secrecy. */
export function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array; randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export class RepeatGuard {
  private inFlight = new Map<string, Promise<unknown>>();
  private keys = new Map<string, { key: string; at: number }>();
  private now: () => number;
  private windowMs: number;

  // Plain fields, not constructor parameter properties: Node's built-in
  // TypeScript stripping (used by the tests) doesn't support those.
  constructor(now: () => number = () => Date.now(), windowMs: number = REPEAT_WINDOW_MS) {
    this.now = now;
    this.windowMs = windowMs;
  }

  static fingerprint(method: string, path: string, body: unknown): string {
    return `${method.toUpperCase()} ${path} ${body === undefined ? '' : JSON.stringify(body)}`;
  }

  /** The Idempotency-Key for this request: reused within the window. */
  keyFor(fingerprint: string): string {
    const t = this.now();
    for (const [fp, v] of this.keys) if (t - v.at > this.windowMs) this.keys.delete(fp);
    const known = this.keys.get(fingerprint);
    if (known) return known.key;
    const key = newIdempotencyKey();
    this.keys.set(fingerprint, { key, at: t });
    return key;
  }

  /** Run `send` once per identical request in flight, with a stable key. */
  run<T>(fingerprint: string, send: (idempotencyKey: string) => Promise<T>): Promise<T> {
    const pending = this.inFlight.get(fingerprint);
    if (pending) return pending as Promise<T>;
    const p = send(this.keyFor(fingerprint)).finally(() => { this.inFlight.delete(fingerprint); });
    this.inFlight.set(fingerprint, p);
    return p;
  }
}
