const fs = require('fs');

function existsSync(filePath) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.existsSync(filePath);
}

function mkdirSync(dirPath, options) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.mkdirSync(dirPath, options);
}

function mkdir(dirPath, options, callback) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.mkdir(dirPath, options, callback);
}

async function mkdirAsync(dirPath, options) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.promises.mkdir(dirPath, options);
}

async function readFile(filePath) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.promises.readFile(filePath);
}

async function stat(filePath) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.promises.stat(filePath);
}

function statSync(filePath) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.statSync(filePath);
}

function readdirSync(dirPath) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.readdirSync(dirPath);
}

async function unlink(filePath) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.promises.unlink(filePath);
}

module.exports = {
  existsSync,
  mkdir,
  mkdirAsync,
  mkdirSync,
  readFile,
  readdirSync,
  stat,
  statSync,
  unlink
};
