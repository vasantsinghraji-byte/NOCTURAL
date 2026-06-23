const path = require('path');
const storageConfig = require('../../../config/storage');

describe('storage adapter contract', () => {
  it('normalizes local files to the same opaque key contract used by GCS', () => {
    const file = {
      path: path.resolve(__dirname, '../../../uploads/documents/mci/certificate.pdf'),
      originalname: 'certificate.pdf',
      mimetype: 'application/pdf',
      size: 123
    };

    expect(storageConfig.toStoredFile(file)).toEqual({
      key: 'documents/mci/certificate.pdf',
      url: '/api/v1/uploads/file?key=documents%2Fmci%2Fcertificate.pdf',
      originalName: 'certificate.pdf',
      mimeType: 'application/pdf',
      size: 123
    });
  });

  it('rejects traversal keys before resolving or deleting local files', () => {
    expect(() => storageConfig.resolveLocalFile('../outside.txt')).toThrow('Stored file key is invalid');
  });
});
