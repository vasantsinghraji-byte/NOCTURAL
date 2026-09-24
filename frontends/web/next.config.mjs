import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */

// Hosted without a shared domain (e.g. App Runner / Amplify default URLs), the
// browser talks only to this site and /api/* is proxied to the API. That keeps
// the API's SameSite=strict auth cookies first-party. Set at build time:
//   API_ORIGIN=https://<api-host>   NEXT_PUBLIC_API_BASE_URL=   (empty = same origin)
const API_ORIGIN = (process.env.API_ORIGIN || '').replace(/\/+$/, '');

const nextConfig = {
  reactStrictMode: true,
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
