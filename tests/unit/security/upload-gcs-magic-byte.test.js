const fs = require('fs');
const path = require('path');

describe('GCS upload magic-byte validation', () => {
  const rootDir = path.resolve(__dirname, '..', '..', '..');
  const storageSrc = fs.readFileSync(path.join(rootDir, 'config', 'storage.js'), 'utf8');
  const uploadSrc = fs.readFileSync(path.join(rootDir, 'middleware', 'upload.js'), 'utf8');
  const validatorSrc = fs.readFileSync(path.join(rootDir, 'utils', 'uploadMagicByteValidator.js'), 'utf8');

  it('generic GCS storage should validate stream magic bytes before writing to GCS', () => {
    expect(storageSrc).toMatch(/createMagicByteValidatedStream/);
    expect(storageSrc).toMatch(/file\.stream\.pipe\(validatedUpload\.stream\)\.pipe\(blobStream\)/);
    expect(storageSrc).not.toMatch(/file\.stream\.pipe\(blobStream\)/);
  });

  it('investigation report GCS storage should validate stream magic bytes before writing to GCS', () => {
    const gcsReportBlock = uploadSrc.match(/if \(storageConfig\.USE_GCS && storageConfig\.gcsBucket\)[\s\S]*?reportStorage = multer\.diskStorage/);

    expect(gcsReportBlock).not.toBeNull();
    expect(gcsReportBlock[0]).toMatch(/createMagicByteValidatedStream/);
    expect(gcsReportBlock[0]).toMatch(/file\.stream\.pipe\(validatedUpload\.stream\)\.pipe\(blobStream\)/);
    expect(gcsReportBlock[0]).not.toMatch(/file\.stream\.pipe\(blobStream\)/);
  });

  it('stream validator should inspect magic bytes and reject MIME mismatches', () => {
    expect(validatorSrc).toMatch(/const MAGIC_BYTE_SAMPLE_SIZE = 4100/);
    expect(validatorSrc).toMatch(/detectFileTypeFromBuffer\(sample\)/);
    expect(validatorSrc).toMatch(/ALLOWED_MAGIC_MIMES/);
    expect(validatorSrc).toMatch(/File content does not match declared MIME type/);
    expect(validatorSrc).toMatch(/bufferedChunks\.forEach\(bufferedChunk => this\.push\(bufferedChunk\)\)/);
  });

  it('GCS upload paths should abort and delete rejected objects', () => {
    expect(storageSrc).toMatch(/blobStream\.destroy\(error\)/);
    expect(storageSrc).toMatch(/blob\.delete\(\)/);
    expect(uploadSrc).toMatch(/blobStream\.destroy\(error\)/);
    expect(uploadSrc).toMatch(/blob\.delete\(\)/);
  });
});
