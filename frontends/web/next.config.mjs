import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */

// Hosted without a shared domain (e.g. App Runner / Amplify default URLs), the
// browser talks only to this site and /api/* is proxied to the API. That keeps
// the API's SameSite=strict auth cookies first-party. Set at build time:
//   API_ORIGIN=https://<api-host>   NEXT_PUBLIC_API_BASE_URL=   (empty = same origin)
const API_ORIGIN = (process.env.API_ORIGIN || '').replace(/\/+$/, '');

// Browser security headers for every response (security bot finding: the website
// sent none, so it could be framed for clickjacking). The Content Security Policy
// is set per request by middleware.ts (it needs a fresh nonce): lib/csp.mjs.

const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(self), payment=(self "https://checkout.razorpay.com"), usb=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' }
];

const nextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework (X-Powered-By: Next.js).
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  // Self-contained server bundle for the Docker image (frontends/web/Dockerfile).
  output: 'standalone',
  // Pin the trace root to this app so server.js always lands at .next/standalone/server.js
  // (otherwise Next guesses from lockfiles further up the tree).
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  // Allow importing the TypeScript sources of ../shared (outside the app root).
  experimental: {
    externalDir: true
  },
  async rewrites() {
    return API_ORIGIN ? [{ source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` }] : [];
  }
};

export default nextConfig;
