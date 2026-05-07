const fs = require('fs').promises;
const path = require('path');

function assertInsideRoot(rootDir, targetPath) {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(targetPath);

  if (!resolvedTarget.startsWith(resolvedRoot)) {
    throw new Error(`Path escapes scan root: ${targetPath}`);
  }

  return resolvedTarget;
}

async function readTextFile(rootDir, filePath) {
  const resolvedPath = assertInsideRoot(rootDir, filePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.readFile(resolvedPath, 'utf8');
}

async function readDirectory(rootDir, dirPath, options) {
  const resolvedPath = assertInsideRoot(rootDir, dirPath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.readdir(resolvedPath, options);
}

module.exports = {
  readDirectory,
  readTextFile
};
