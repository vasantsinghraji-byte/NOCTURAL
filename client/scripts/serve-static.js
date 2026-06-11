#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
]);

function parseArgs(argv) {
  const options = {
    root: 'public',
    port: Number.parseInt(process.env.PORT || '3000', 10)
  };

  argv.forEach((arg, index) => {
    if (arg.startsWith('--port=')) {
      options.port = Number.parseInt(arg.slice('--port='.length), 10);
      return;
    }

    if (arg === '--port') {
      options.port = Number.parseInt(argv[index + 1], 10);
      return;
    }

    if (!arg.startsWith('--') && argv[index - 1] !== '--port') {
      options.root = arg;
    }
  });

  return options;
}

function send(response, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-cache',
    'Content-Type': contentType
  });
  response.end(body);
}

function resolveRequestPath(rootDir, requestUrl) {
  let pathname;

  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  } catch (_error) {
    return null;
  }

  const normalizedPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(rootDir, `.${normalizedPath}`);

  if (!filePath.startsWith(`${rootDir}${path.sep}`) && filePath !== rootDir) {
    return null;
  }

  return filePath;
}

function serveFile(rootDir, request, response) {
  const filePath = resolveRequestPath(rootDir, request.url);

  if (!filePath) {
    send(response, 403, 'Forbidden');
    return;
  }

  // The request path is resolved under rootDir before filesystem access.
  fs.stat(filePath, (statError, stats) => { // eslint-disable-line security/detect-non-literal-fs-filename
    if (statError || !stats.isFile()) {
      send(response, 404, 'Not Found');
      return;
    }

    const contentType = mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
    response.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Length': stats.size,
      'Content-Type': contentType
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    fs.createReadStream(filePath).pipe(response); // eslint-disable-line security/detect-non-literal-fs-filename
  });
}

const options = parseArgs(process.argv.slice(2));
const rootDir = path.resolve(process.cwd(), options.root);

if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
  process.stderr.write('Invalid --port value\n');
  process.exit(1);
}

if (!fs.existsSync(rootDir)) { // eslint-disable-line security/detect-non-literal-fs-filename
  process.stderr.write(`Static root not found: ${rootDir}\n`);
  process.exit(1);
}

const server = http.createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    send(response, 405, 'Method Not Allowed');
    return;
  }

  serveFile(rootDir, request, response);
});

server.listen(options.port, () => {
  process.stdout.write(`Serving ${rootDir} at http://localhost:${options.port}\n`);
});
