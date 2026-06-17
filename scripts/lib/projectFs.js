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

function readTextFileSync(rootDir, filePath) {
  const resolvedPath = assertInsideRoot(rootDir, filePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return require('fs').readFileSync(resolvedPath, 'utf8');
}

async function readDirectory(rootDir, dirPath, options) {
  const resolvedPath = assertInsideRoot(rootDir, dirPath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.readdir(resolvedPath, options);
}

function readDirectorySync(rootDir, dirPath, options) {
  const resolvedPath = assertInsideRoot(rootDir, dirPath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return require('fs').readdirSync(resolvedPath, options);
}

function pathExistsSync(rootDir, filePath) {
  const resolvedPath = assertInsideRoot(rootDir, filePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return require('fs').existsSync(resolvedPath);
}

function makeDirectorySync(rootDir, dirPath, options) {
  const resolvedPath = assertInsideRoot(rootDir, dirPath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return require('fs').mkdirSync(resolvedPath, options);
}

function writeTextFileSync(rootDir, filePath, content, options) {
  const resolvedPath = assertInsideRoot(rootDir, filePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return require('fs').writeFileSync(resolvedPath, content, options);
}

function copyFileSync(rootDir, sourcePath, targetPath) {
  const resolvedSource = assertInsideRoot(rootDir, sourcePath);
  const resolvedTarget = assertInsideRoot(rootDir, targetPath);
  return require('fs').copyFileSync(resolvedSource, resolvedTarget);
}

function removeSync(rootDir, filePath, options) {
  const resolvedPath = assertInsideRoot(rootDir, filePath);
  return require('fs').rmSync(resolvedPath, options);
}

function statSync(rootDir, filePath) {
  const resolvedPath = assertInsideRoot(rootDir, filePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return require('fs').statSync(resolvedPath);
}

module.exports = {
  copyFileSync,
  makeDirectorySync,
  pathExistsSync,
  readDirectory,
  readDirectorySync,
  readTextFile,
  readTextFileSync,
  removeSync,
  statSync,
  writeTextFileSync
};
