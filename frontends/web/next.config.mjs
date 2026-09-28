import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */

// Hosted without a shared domain (e.g. App Runner / Amplify default URLs), the
// browser talks only to this site and /api/* is proxied to the API. That keeps
// the API's SameSite=strict auth cookies first-party. Set at build time:
//   API_ORIGIN=https://<api-host>   NEXT_PUBLIC_API_BASE_URL=   (empty = same origin)
const API_ORIGIN = (process.env.API_ORIGIN || '').replace(/\/+$/, '');

// Browser security headers for every page (security bot finding: the website
// sent none, so it could be framed for clickjacking). Allowed third parties:
// Razorpay checkout (script, frames, telemetry) and the OpenStreetMap embed.
// Scripts keep 'unsafe-inline' because Next.js hydration uses inline scripts;
// a nonce-based policy is the next step.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com",
  "frame-src https://www.openstreetmap.org https://api.razorpay.com https://checkout.razorpay.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests'
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(), payment=(self "https://checkout.razorpay.com"), usb=(), interest-cohort=()' },
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
