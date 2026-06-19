const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', process.argv[2] || 'public');
const port = Number(process.env.PORT || 3000);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
  try {
    const requestedPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relativePath = requestedPath === '/' ? 'index.html' : requestedPath.replace(/^\/+/, '');
    const resolvedPath = path.resolve(root, relativePath);
    if (resolvedPath !== root && !resolvedPath.startsWith(`${root}${path.sep}`)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const stats = await fs.promises.stat(resolvedPath);
    const filePath = stats.isDirectory() ? path.join(resolvedPath, 'index.html') : resolvedPath;
    res.writeHead(200, {
      'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (_error) {
    res.writeHead(404).end('Not found');
  }
});

server.listen(port, () => {
  console.log(`Serving ${root} at http://localhost:${port}`);
});
