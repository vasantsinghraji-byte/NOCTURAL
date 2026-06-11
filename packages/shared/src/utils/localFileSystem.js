const fs = require('fs');

function existsSync(filePath) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.existsSync(filePath);
}

function mkdirSync(dirPath, options) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.mkdirSync(dirPath, options);
}

module.exports = {
  existsSync,
  mkdirSync
};
