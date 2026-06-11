const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.argv[2] || process.env.PUBLIC_FUNNEL_PORT || 4173);
const publicDir = path.resolve(__dirname, '..', '..', 'client', 'public');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const cspHeader = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net https://unpkg.com https://www.google.com https://www.gstatic.com https://checkout.razorpay.com https://api.razorpay.com",
  "script-src-attr 'none'",
  "style-src 'self' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
  "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' http://127.0.0.1:* http://localhost:* https://api.razorpay.com https://checkout.razorpay.com https://fonts.googleapis.com https://fonts.gstatic.com https://cdnjs.cloudflare.com",
  "frame-src 'self' https://www.google.com https://checkout.razorpay.com"
].join('; ');

const send = (res, statusCode, body, contentType = 'text/plain; charset=utf-8', headers = {}) => {
  res.writeHead(statusCode, { 'Content-Type': contentType, ...headers });
  res.end(body);
};

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    send(res, 404, JSON.stringify({ success: false }), 'application/json; charset=utf-8');
    return;
  }

  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.resolve(publicDir, `.${requestedPath}`);

  if (!filePath.startsWith(publicDir)) {
    send(res, 403, 'Forbidden');
    return;
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.readFile(filePath, (error, content) => {
    if (error) {
      send(res, 404, 'Not found');
      return;
    }

    const contentType = mimeTypes[path.extname(filePath)] || 'application/octet-stream';
    const headers = path.extname(filePath) === '.html'
      ? { 'Content-Security-Policy': cspHeader }
      : {};

    if (requestedPath === '/service-worker.js') {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      headers.Pragma = 'no-cache';
      headers.Expires = '0';
    }

    send(res, 200, content, contentType, headers);
  });
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Static public server listening on ${port}\n`);
});
