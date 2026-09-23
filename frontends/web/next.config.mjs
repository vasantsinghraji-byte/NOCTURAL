/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow importing the TypeScript sources of ../shared (outside the app root).
  experimental: {
    externalDir: true
  }
};

export default nextConfig;
