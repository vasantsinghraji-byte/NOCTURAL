const fs = require('fs');
const path = require('path');

const DIST_RELATIVE_PATH = path.join('client', 'dist');
const PUBLIC_RELATIVE_PATH = path.join('client', 'public');

function resolveFrontendStaticDir(projectRoot = path.resolve(__dirname, '..')) {
  const distDir = path.resolve(projectRoot, DIST_RELATIVE_PATH);

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
