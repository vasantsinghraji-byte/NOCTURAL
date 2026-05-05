let fileTypeModulePromise;
const importModule = new Function('specifier', 'return import(specifier);');

async function loadFileTypeModule() {
  if (!fileTypeModulePromise) {
    fileTypeModulePromise = importModule('file-type');
  }

  return fileTypeModulePromise;
}

async function detectFileTypeFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) {
    throw new TypeError('detectFileTypeFromBuffer expects a Buffer or Uint8Array');
  }

  const { fileTypeFromBuffer } = await loadFileTypeModule();
  return fileTypeFromBuffer(buffer);
}

function setFileTypeModuleForTest(fileTypeModule) {
  fileTypeModulePromise = Promise.resolve(fileTypeModule);
}

module.exports = {
  detectFileTypeFromBuffer,
  setFileTypeModuleForTest
};
