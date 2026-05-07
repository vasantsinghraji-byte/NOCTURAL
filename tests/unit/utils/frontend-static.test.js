const fs = require('fs');
const os = require('os');
const path = require('path');
const localFileSystem = require('../../../utils/localFileSystem');

const {
  resolveFrontendStaticDir,
  DIST_RELATIVE_PATH,
  PUBLIC_RELATIVE_PATH
} = require('../../../utils/frontendStatic');

describe('resolveFrontendStaticDir', () => {
  let projectRoot;
  let originalNodeEnv;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nocturnal-frontend-static-'));
    localFileSystem.mkdirSync(path.join(projectRoot, PUBLIC_RELATIVE_PATH), { recursive: true });
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    localFileSystem.rmSync(projectRoot, { recursive: true, force: true });
  });

  test('prefers client/dist when the optimized frontend build exists outside tests', () => {
    process.env.NODE_ENV = 'production';
    localFileSystem.mkdirSync(path.join(projectRoot, DIST_RELATIVE_PATH), { recursive: true });

    expect(resolveFrontendStaticDir(projectRoot)).toBe(
      path.resolve(projectRoot, DIST_RELATIVE_PATH)
    );
  });

  test('uses client/public in test mode even when dist is present', () => {
    process.env.NODE_ENV = 'test';
    localFileSystem.mkdirSync(path.join(projectRoot, DIST_RELATIVE_PATH), { recursive: true });

    expect(resolveFrontendStaticDir(projectRoot)).toBe(
      path.resolve(projectRoot, PUBLIC_RELATIVE_PATH)
    );
  });

  test('falls back to client/public when dist is not present outside tests', () => {
    process.env.NODE_ENV = 'production';

    expect(resolveFrontendStaticDir(projectRoot)).toBe(
      path.resolve(projectRoot, PUBLIC_RELATIVE_PATH)
    );
  });
});
