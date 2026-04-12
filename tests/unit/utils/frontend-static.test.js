const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  resolveFrontendStaticDir,
  DIST_RELATIVE_PATH,
  PUBLIC_RELATIVE_PATH
} = require('../../../utils/frontendStatic');

describe('resolveFrontendStaticDir', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nocturnal-frontend-static-'));
    fs.mkdirSync(path.join(projectRoot, PUBLIC_RELATIVE_PATH), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  test('prefers client/dist when the optimized frontend build exists', () => {
    fs.mkdirSync(path.join(projectRoot, DIST_RELATIVE_PATH), { recursive: true });

    expect(resolveFrontendStaticDir(projectRoot)).toBe(
      path.resolve(projectRoot, DIST_RELATIVE_PATH)
    );
  });

  test('falls back to client/public when dist is not present', () => {
    expect(resolveFrontendStaticDir(projectRoot)).toBe(
      path.resolve(projectRoot, PUBLIC_RELATIVE_PATH)
    );
  });
});
