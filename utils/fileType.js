const detectFileTypeFromBuffer = async (buffer) => {
  const fileType = await import('file-type');

  if (typeof fileType.fileTypeFromBuffer === 'function') {
    return fileType.fileTypeFromBuffer(buffer);
  }

  if (typeof fileType.fromBuffer === 'function') {
    return fileType.fromBuffer(buffer);
  }

  return null;
};

module.exports = {
  detectFileTypeFromBuffer
};
