const {
  detectFileTypeFromBuffer,
  setFileTypeModuleForTest
} = require('../../../utils/fileTypeDetector');

describe('file type detector', () => {
  beforeEach(() => {
    setFileTypeModuleForTest({
      fileTypeFromBuffer: async (buffer) => {
        const hex = buffer.toString('hex');
        const text = buffer.toString('utf8');

        if (text.startsWith('%PDF')) {
          return { ext: 'pdf', mime: 'application/pdf' };
        }
        if (hex.startsWith('89504e47')) {
          return { ext: 'png', mime: 'image/png' };
        }
        if (hex.startsWith('ffd8ff')) {
          return { ext: 'jpg', mime: 'image/jpeg' };
        }

        return undefined;
      }
    });
  });

  it.each([
    ['PDF', Buffer.from('%PDF-1.4\n%test\n'), 'application/pdf'],
    ['PNG', Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), 'image/png'],
    ['JPEG', Buffer.from('ffd8ffe000104a464946000101', 'hex'), 'image/jpeg']
  ])('detects %s upload signatures', async (_label, buffer, expectedMime) => {
    await expect(detectFileTypeFromBuffer(buffer)).resolves.toEqual(
      expect.objectContaining({ mime: expectedMime })
    );
  });

  it('returns undefined for unknown upload signatures', async () => {
    await expect(detectFileTypeFromBuffer(Buffer.from('not a supported upload'))).resolves.toBeUndefined();
  });

  it('rejects non-buffer input before loading the detector', async () => {
    await expect(detectFileTypeFromBuffer('not-buffer')).rejects.toThrow('Buffer or Uint8Array');
  });
});
