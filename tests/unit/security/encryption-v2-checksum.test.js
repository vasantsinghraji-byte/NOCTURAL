const crypto = require('crypto');

jest.mock('../../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn()
}));

describe('Security Unit: encryptionV2 checksum helper', () => {
  it('exports checksum instead of a generic hash helper', () => {
    const encryptionV2 = require('../../../utils/encryptionV2');

    expect(typeof encryptionV2.checksum).toBe('function');
    expect(encryptionV2.hash).toBeUndefined();
  });

  it('uses deterministic SHA-256 checksums for non-password data', () => {
    const { checksum, compareHash } = require('../../../utils/encryptionV2');
    const expected = crypto.createHash('sha256').update('record-123').digest('hex');

    expect(checksum('record-123')).toBe(expected);
    expect(compareHash('record-123', expected)).toBe(true);
  });
});
