const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../../..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

describe('Docker/frontend static runtime contract', () => {
  test('Docker image keeps shipping the optimized frontend build', () => {
    expect(readProjectFile('Dockerfile')).toContain('/app/client/dist ./client/dist');
  });

  test('server entrypoints resolve the frontend static directory dynamically', () => {
    const serverSrc = readProjectFile('server.js');
    const appSrc = readProjectFile('app.js');

    expect(serverSrc).toContain("const app = require('./app');");

    expect(appSrc).toContain("const { resolveFrontendStaticDir } = require('./utils/frontendStatic');");
    expect(appSrc).toContain('const frontendStaticDir = resolveFrontendStaticDir();');
    expect(appSrc).toContain("app.use(express.static(frontendStaticDir));");
    expect(appSrc).toContain("app.get('/service-worker.js'");
    expect(appSrc).toContain("'Cache-Control': 'no-cache, no-store, must-revalidate'");
  });
});
