import { NextResponse, type NextRequest } from 'next/server';

/**
 * The website proxies /api/* to the API (next.config.mjs rewrites), so the API
 * would see every visitor as this server's IP and rate-limit them together.
 * Forward the visitor's IP, signed with a secret the API also knows
 * (PROXY_SHARED_SECRET); the API ignores the header without a valid key.
 *
 * App Runner appends the connecting client's IP as the LAST x-forwarded-for
 * entry, so that's the one we trust (earlier entries can be forged).
 */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  // Never pass through values a visitor sent themselves.
  headers.delete('x-nabz-client-ip');
  headers.delete('x-nabz-proxy-key');

  const secret = process.env.PROXY_SHARED_SECRET;
  const chain = (req.headers.get('x-forwarded-for') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const visitor = chain[chain.length - 1];
  if (secret && visitor) {
    headers.set('x-nabz-client-ip', visitor);
    headers.set('x-nabz-proxy-key', secret);
  }
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: '/api/:path*' };
