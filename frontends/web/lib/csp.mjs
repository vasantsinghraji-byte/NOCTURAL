/**
 * Content Security Policy for every page, with a fresh nonce per request
 * (set by middleware.ts; Next.js adds the nonce to its own scripts).
 *
 * script-src: 'nonce-…' + 'strict-dynamic' means only scripts we rendered, or
 * scripts they load (Razorpay checkout, Google sign-in), can run; injected
 * inline scripts can't. 'unsafe-inline' and the host list are ignored by
 * browsers that understand nonces and only keep very old browsers working.
 * Allowed third parties: Razorpay checkout, the OpenStreetMap embed and
 * Google sign-in (accounts.google.com/gsi only).
 */
export function contentSecurityPolicy(nonce, { dev = false } = {}) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''} 'unsafe-inline' https://checkout.razorpay.com https://accounts.google.com/gsi/client`,
    "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://accounts.google.com/gsi/ https://*.s3.ap-south-1.amazonaws.com wss://*.appsync-realtime-api.ap-south-1.amazonaws.com",
    "media-src 'self' blob: https://*.s3.ap-south-1.amazonaws.com",
    "frame-src https://www.openstreetmap.org https://api.razorpay.com https://checkout.razorpay.com https://accounts.google.com/gsi/",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests'
  ].join('; ');
}
