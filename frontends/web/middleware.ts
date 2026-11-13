import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy } from './lib/csp.mjs';

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
  if (!req.nextUrl.pathname.startsWith('/api/')) return withNonce(req);
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

/**
 * Pages: a fresh nonce per request. Next.js reads the policy from the request
 * headers and stamps the nonce on its own scripts; the browser gets the same
 * policy on the response. Pages render per request (app/layout.tsx reads headers).
 */
function withNonce(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce, { dev: process.env.NODE_ENV === 'development' });
  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

// API calls (signed visitor IP) and every page; not static files or images.
export const config = { matcher: ['/api/:path*', '/((?!_next/static|_next/image|favicon|brand/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml|json|webmanifest)$).*)'] };
