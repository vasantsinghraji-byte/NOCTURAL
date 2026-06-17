/* eslint-disable security/detect-non-literal-fs-filename -- Tests create temporary CSV fixtures under os.tmpdir(). */
const fs = require('fs');
const os = require('os');
const path = require('path');

const mockS3Send = jest.fn();
const mockS3Client = jest.fn(() => ({ send: mockS3Send }));
const mockGetSignedUrl = jest.fn(async () => 'https://signed.example.test/audit-export.csv');
const mockUpload = jest.fn();
const mockGcsSignedUrl = jest.fn(async () => ['https://gcs-signed.example.test/audit-export.csv']);
const mockGcsMetadata = jest.fn();
const mockGcsDelete = jest.fn(async () => {});
const mockGetFiles = jest.fn();
let mockS3Checksum;
let mockGcsChecksum;
const mockBucket = {
  upload: mockUpload,
  file: jest.fn(() => ({
    getSignedUrl: mockGcsSignedUrl,
    getMetadata: mockGcsMetadata,
    delete: mockGcsDelete
  })),
  getFiles: mockGetFiles
};
const mockStorage = jest.fn(() => ({
  bucket: jest.fn(() => mockBucket)
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: mockS3Client,
  PutObjectCommand: class PutObjectCommand {
    constructor(input) { this.input = input; }
  },
  DeleteObjectCommand: class DeleteObjectCommand {
    constructor(input) { this.input = input; }
  },
  GetObjectCommand: class GetObjectCommand {
    constructor(input) { this.input = input; }
  },
  HeadObjectCommand: class HeadObjectCommand {
    constructor(input) { this.input = input; }
  },
  ListObjectsV2Command: class ListObjectsV2Command {
    constructor(input) { this.input = input; }
  }
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mockGetSignedUrl
}));

jest.mock('@google-cloud/storage', () => ({
  Storage: mockStorage
}));

describe('Audit export cloud storage contracts', () => {
  let tempDir;
  let tempFile;
  let storageService;

  const resetEnv = () => {
    for (const key of [
      'AUDIT_EXPORT_STORAGE_PROVIDER',
      'AUDIT_EXPORT_STORAGE_PREFIX',
      'AUDIT_EXPORT_S3_BUCKET',
      'AUDIT_EXPORT_S3_ENDPOINT',
      'AUDIT_EXPORT_S3_FORCE_PATH_STYLE',
      'AUDIT_EXPORT_S3_SSE',
      'AUDIT_EXPORT_S3_KMS_KEY_ID',
      'AUDIT_EXPORT_GCS_BUCKET',
      'AUDIT_EXPORT_GCS_KMS_KEY_NAME',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY'
    ]) {
      delete process.env[key];
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockS3Checksum = undefined;
    mockGcsChecksum = undefined;
    mockS3Client.mockImplementation(() => ({ send: mockS3Send }));
    mockS3Send.mockImplementation(async (command) => {
      const body = command?.input?.Body;
      if (body && typeof body.resume === 'function') {
        mockS3Checksum = command.input.Metadata?.sha256;
        await new Promise((resolve, reject) => {
          body.on('end', resolve);
          body.on('error', reject);
          body.resume();
        });
      }
      if (!body && command?.input?.Key && command?.input?.Bucket) {
        return { Metadata: { sha256: mockS3Checksum } };
      }
      return {};
    });
    mockStorage.mockImplementation(() => ({
      bucket: jest.fn(() => mockBucket)
    }));
    mockUpload.mockImplementation(async (_filePath, options) => {
      mockGcsChecksum = options?.metadata?.metadata?.sha256;
    });
    mockGcsSignedUrl.mockResolvedValue(['https://gcs-signed.example.test/audit-export.csv']);
    mockGcsMetadata.mockImplementation(async () => [{ metadata: { sha256: mockGcsChecksum } }]);
    mockGcsDelete.mockResolvedValue(undefined);
    mockBucket.file.mockImplementation(() => ({
      getSignedUrl: mockGcsSignedUrl,
      getMetadata: mockGcsMetadata,
      delete: mockGcsDelete
    }));
    resetEnv();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-export-storage-'));
    tempFile = path.join(tempDir, 'security-audit-test.csv');
    fs.writeFileSync(tempFile, 'createdAt,event\n2026-06-16,test\n');
    storageService = require('../../../services/auditExportStorageService');
    storageService._resetClientsForTest();
  });

  afterEach(() => {
    resetEnv();
    storageService._resetClientsForTest();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('uploads S3 exports with KMS/SSE fields, signs downloads, deletes cancelled objects, and cleans orphans', async () => {
    process.env.AUDIT_EXPORT_STORAGE_PROVIDER = 's3';
    process.env.AUDIT_EXPORT_STORAGE_PREFIX = 'audit-exports-test';
    process.env.AUDIT_EXPORT_S3_BUCKET = 'audit-export-bucket';
    process.env.AUDIT_EXPORT_S3_ENDPOINT = 'http://127.0.0.1:4566';
    process.env.AUDIT_EXPORT_S3_SSE = 'aws:kms';
    process.env.AUDIT_EXPORT_S3_KMS_KEY_ID = 'arn:aws:kms:us-east-1:123456789012:key/test';

    const result = await storageService.putFile({
      localPath: tempFile,
      jobId: '64f0000000000000000000aa',
      fileName: 'security-audit-test.csv'
    });

    expect(result.storageProvider).toBe('s3');
    expect(result.checksum).toEqual(expect.objectContaining({
      algorithm: 'sha256',
      value: expect.any(String),
      verifiedAt: expect.any(Date)
    }));
    expect(result.encryption).toEqual({
      mode: 's3:aws:kms',
      keyId: 'arn:aws:kms:us-east-1:123456789012:key/test'
    });
    expect(mockS3Client).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: 'http://127.0.0.1:4566',
      forcePathStyle: true
    }));
    expect(mockS3Send.mock.calls[0][0].input).toEqual(expect.objectContaining({
      Bucket: 'audit-export-bucket',
      Key: 'audit-exports-test/64f0000000000000000000aa-security-audit-test.csv',
      Metadata: {
        sha256: result.checksum.value
      },
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: 'arn:aws:kms:us-east-1:123456789012:key/test'
    }));

    await storageService.signedDownloadUrl({
      storageProvider: 's3',
      storageKey: result.storageKey,
      downloadFileName: 'security-audit-test.csv'
    });
    expect(mockGetSignedUrl).toHaveBeenCalled();

    await storageService.deleteObject({ storageProvider: 's3', storageKey: result.storageKey });
    expect(mockS3Send.mock.calls.some(call => call[0].input.Key === result.storageKey)).toBe(true);

    mockS3Send.mockReset();
    mockS3Send
      .mockResolvedValueOnce({
        Contents: [
          { Key: 'audit-exports-test/orphan.csv', LastModified: new Date('2026-01-01T00:00:00Z') },
          { Key: result.storageKey, LastModified: new Date('2026-01-01T00:00:00Z') }
        ],
        IsTruncated: false
      })
      .mockResolvedValueOnce({});

    const deleted = await storageService.cleanupOrphanedObjects({
      activeJobs: [{ storageKey: result.storageKey }],
      olderThan: new Date('2026-06-16T00:00:00Z')
    });

    expect(deleted).toBe(1);
    expect(mockS3Send.mock.calls[1][0].input).toEqual(expect.objectContaining({
      Bucket: 'audit-export-bucket',
      Key: 'audit-exports-test/orphan.csv'
    }));
  });

  it('uploads GCS exports with KMS metadata, signs downloads, deletes cancelled objects, and cleans orphans', async () => {
    process.env.AUDIT_EXPORT_STORAGE_PROVIDER = 'gcs';
    process.env.AUDIT_EXPORT_STORAGE_PREFIX = 'audit-exports-gcs';
    process.env.AUDIT_EXPORT_GCS_BUCKET = 'audit-export-gcs-bucket';
    process.env.AUDIT_EXPORT_GCS_KMS_KEY_NAME = 'projects/test/locations/global/keyRings/ring/cryptoKeys/key';

    const result = await storageService.putFile({
      localPath: tempFile,
      jobId: '64f0000000000000000000bb',
      fileName: 'security-audit-test.csv'
    });

    expect(result.storageProvider).toBe('gcs');
    expect(result.checksum).toEqual(expect.objectContaining({
      algorithm: 'sha256',
      value: expect.any(String),
      verifiedAt: expect.any(Date)
    }));
    expect(result.encryption).toEqual({
      mode: 'gcs:kms',
      keyId: 'projects/test/locations/global/keyRings/ring/cryptoKeys/key'
    });
    expect(mockUpload).toHaveBeenCalledWith(tempFile, expect.objectContaining({
      destination: 'audit-exports-gcs/64f0000000000000000000bb-security-audit-test.csv',
      metadata: expect.objectContaining({
        metadata: {
          sha256: result.checksum.value
        }
      }),
      kmsKeyName: 'projects/test/locations/global/keyRings/ring/cryptoKeys/key'
    }));

    await storageService.signedDownloadUrl({
      storageProvider: 'gcs',
      storageKey: result.storageKey,
      downloadFileName: 'security-audit-test.csv'
    });
    expect(mockGcsSignedUrl).toHaveBeenCalledWith(expect.objectContaining({
      action: 'read',
      responseDisposition: 'attachment; filename="security-audit-test.csv"'
    }));

    await storageService.deleteObject({ storageProvider: 'gcs', storageKey: result.storageKey });
    expect(mockGcsDelete).toHaveBeenCalledWith({ ignoreNotFound: true });

    const orphanFile = {
      name: 'audit-exports-gcs/orphan.csv',
      metadata: { updated: '2026-01-01T00:00:00Z' },
      delete: jest.fn(async () => {})
    };
    const activeFile = {
      name: result.storageKey,
      metadata: { updated: '2026-01-01T00:00:00Z' },
      delete: jest.fn(async () => {})
    };
    mockGetFiles.mockResolvedValue([[orphanFile, activeFile]]);

    const deleted = await storageService.cleanupOrphanedObjects({
      activeJobs: [{ storageKey: result.storageKey }],
      olderThan: new Date('2026-06-16T00:00:00Z')
    });

    expect(deleted).toBe(1);
    expect(orphanFile.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
    expect(activeFile.delete).not.toHaveBeenCalled();
  });
});
