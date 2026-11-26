/**
 * "Can we reach Nabz?" for the offline banner, in the app and on the website.
 *
 * Wrap the API client's fetch with `trackFetch`: a request that can't reach the
 * server (no internet, server down) marks the connection lost, and the next
 * request that gets any answer marks it back. While it is lost, `startRecheck`
 * pings the server now and then so the banner goes away on its own.
 */

type Listener = (online: boolean) => void;

export class Connection {
  private online = true;
  private listeners = new Set<Listener>();

  isOnline(): boolean { return this.online; }

  set(online: boolean): void {
    if (online === this.online) return;
    this.online = online;
    for (const l of this.listeners) l(online);
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  }

  /** fetch that reports whether the server answered. Errors are passed on unchanged. */
  trackFetch(base: typeof fetch): typeof fetch {
    return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      try {
        const res = await base(input, init);
        this.set(true); // any HTTP answer, even an error page, means we reached it
        return res;
      } catch (err) {
        // A request we cancelled ourselves says nothing about the connection.
        if (!(err instanceof Error && err.name === 'AbortError')) this.set(false);
        throw err;
      }
    }) as typeof fetch;
  }

  /**
   * While offline, call `ping` every `everyMs` (it should make one cheap request
   * through the tracked fetch). Returns a stop function.
   */
  startRecheck(ping: () => Promise<unknown>, everyMs = 15000, timers: { setInterval: typeof setInterval; clearInterval: typeof clearInterval } = globalThis): () => void {
    const t = timers.setInterval(() => { if (!this.online) ping().catch(() => undefined); }, everyMs);
    return () => timers.clearInterval(t);
  }
}

/** One per app or website. */
export const connection = new Connection();
