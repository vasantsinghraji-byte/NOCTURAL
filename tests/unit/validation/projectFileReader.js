const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..', '..');

function resolveProjectPath(relativePath) {
  const resolvedPath = path.resolve(rootDir, relativePath);

  if (!resolvedPath.startsWith(rootDir)) {
    throw new Error(`Project path escapes repository root: ${relativePath}`);
  }

  return resolvedPath;
}

function readProjectFile(relativePath) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.readFileSync(resolveProjectPath(relativePath), 'utf8');
}

function projectPathExists(relativePath) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.existsSync(resolveProjectPath(relativePath));
}

function listProjectFiles(relativePath, options) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.readdirSync(resolveProjectPath(relativePath), options);
}

function toProjectRelativePath(absolutePath) {
  return path.relative(rootDir, absolutePath).replace(/\\/g, '/');
}

module.exports = {
  rootDir,
  resolveProjectPath,
  readProjectFile,
  projectPathExists,
  listProjectFiles,
  toProjectRelativePath
};
