let fileTypeModulePromise;
const importModule = new Function('specifier', 'return import(specifier);');

async function loadFileTypeModule() {
  if (!fileTypeModulePromise) {
    fileTypeModulePromise = importModule('file-type');
  }

  return fileTypeModulePromise;
}

// The types we accept have simple signatures: JPG, PNG, PDF, plus WebP photos
// and MP4 / MOV / WebM videos for partner posts. Used when the ESM file-type
// module can't be loaded (e.g. a runtime without dynamic import support), so
// uploads are still checked instead of failing. Each caller still applies its
// own allow-list, so knowing more types here never widens what it accepts.
function detectAcceptedSignature(buffer) {
  const b = Buffer.from(buffer);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-') return { ext: 'pdf', mime: 'application/pdf' };
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  if (b.length >= 12 && b.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = b.subarray(8, 12).toString('latin1');
    return brand === 'qt  ' ? { ext: 'mov', mime: 'video/quicktime' } : { ext: 'mp4', mime: 'video/mp4' };
  }
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 && b.subarray(0, 64).toString('latin1').includes('webm')) return { ext: 'webm', mime: 'video/webm' };
  return undefined;
}

async function detectFileTypeFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) {
    throw new TypeError('detectFileTypeFromBuffer expects a Buffer or Uint8Array');
  }

  let mod;
  try {
    mod = await loadFileTypeModule();
  } catch {
    fileTypeModulePromise = undefined;
    return detectAcceptedSignature(buffer);
  }
  return mod.fileTypeFromBuffer(buffer);
}

function setFileTypeModuleForTest(fileTypeModule) {
  fileTypeModulePromise = Promise.resolve(fileTypeModule);
}

module.exports = {
  detectFileTypeFromBuffer,
  detectAcceptedSignature,
  setFileTypeModuleForTest
};
