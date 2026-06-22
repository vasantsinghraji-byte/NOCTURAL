const fs = require('fs');
const path = require('path');

describe('Encryption V2 KDF parameters', () => {
  const encryptionV2Src = fs.readFileSync(
    path.resolve(__dirname, '..', '..', '..', 'utils', 'encryptionV2.js'),
    'utf8'
  );

  it('should use 600k PBKDF2-SHA256 iterations for the current KDF version', () => {
    expect(encryptionV2Src).toMatch(/CURRENT_KDF_VERSION\s*=\s*['"]v2['"]/);
    expect(encryptionV2Src).toMatch(/iterations:\s*600000/);
    expect(encryptionV2Src).toMatch(/digest:\s*KDF_DIGEST/);
    expect(encryptionV2Src).toMatch(/const KDF_DIGEST\s*=\s*['"]sha256['"]/);
  });

  it('should keep the legacy 100k KDF version for old payload metadata', () => {
    expect(encryptionV2Src).toMatch(/v1:\s*Object\.freeze\(\{[\s\S]*?iterations:\s*100000/);
    expect(encryptionV2Src).toMatch(/v1:\s*Object\.freeze\(\{[\s\S]*?deprecated:\s*true/);
  });

  it('should expose metadata helpers for versioned password-derived keys', () => {
    expect(encryptionV2Src).toMatch(/function deriveKeyWithMetadata/);
    expect(encryptionV2Src).toMatch(/function deriveKeyFromMetadata/);
    expect(encryptionV2Src).toMatch(/function resolveKdfOptions/);
    expect(encryptionV2Src).toMatch(/deriveKeyWithMetadata,/);
    expect(encryptionV2Src).toMatch(/deriveKeyFromMetadata,/);
    expect(encryptionV2Src).toMatch(/KDF_VERSIONS,/);
    expect(encryptionV2Src).toMatch(/CURRENT_KDF_VERSION/);
  });

  it('should preserve backward compatibility with numeric deriveKey iterations', () => {
    expect(encryptionV2Src).toMatch(/typeof options === ['"]number['"]/);
    expect(encryptionV2Src).toMatch(/version:\s*options === KDF_VERSIONS\.v1\.iterations \? ['"]v1['"] : ['"]custom['"]/);
  });
});
