const fs = require('fs');
const path = require('path');

const DIST_RELATIVE_PATH = path.join('client', 'dist');
const PUBLIC_RELATIVE_PATH = path.join('client', 'public');

function resolveFrontendStaticDir(projectRoot = path.resolve(__dirname, '..')) {
  if (process.env.NODE_ENV === 'test') {
    return path.resolve(projectRoot, PUBLIC_RELATIVE_PATH);
  }

  const distDir = path.resolve(projectRoot, DIST_RELATIVE_PATH);

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (fs.existsSync(distDir)) {
    return distDir;
  }

  return path.resolve(projectRoot, PUBLIC_RELATIVE_PATH);
}

module.exports = {
  resolveFrontendStaticDir,
  DIST_RELATIVE_PATH,
  PUBLIC_RELATIVE_PATH
};
