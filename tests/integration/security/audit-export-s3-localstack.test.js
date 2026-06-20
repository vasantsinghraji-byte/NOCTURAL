/* eslint-disable security/detect-non-literal-fs-filename -- Integration test creates temporary CSV fixtures for S3-compatible storage. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  S3Client,
  CreateBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command
} = require('@aws-sdk/client-s3');

const describeIfLocalStack = process.env.RUN_AUDIT_EXPORT_S3_LOCALSTACK === 'true'
  ? describe
  : describe.skip;

describeIfLocalStack('Audit export S3 LocalStack/MinIO integration', () => {
  const bucket = process.env.AUDIT_EXPORT_S3_BUCKET || 'nocturnal-audit-export-test';
  const endpoint = process.env.AUDIT_EXPORT_S3_ENDPOINT || 'http://127.0.0.1:4566';
  let tempDir;
  let storageService;

  beforeAll(async () => {
    process.env.AUDIT_EXPORT_STORAGE_PROVIDER = 's3';
    process.env.AUDIT_EXPORT_STORAGE_PREFIX = 'audit-export-localstack';
    process.env.AUDIT_EXPORT_S3_BUCKET = bucket;
    process.env.AUDIT_EXPORT_S3_ENDPOINT = endpoint;
    process.env.AUDIT_EXPORT_S3_FORCE_PATH_STYLE = 'true';
    process.env.AUDIT_EXPORT_S3_SSE = 'AES256';
    process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || 'test';
    process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || 'test';
    process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';

    const client = new S3Client({
      endpoint,
      forcePathStyle: true,
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });

    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (error) {
      if (!['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes(error.name)) {
        throw error;
      }
    }
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-export-localstack-'));
    jest.resetModules();
    storageService = require('../../../services/auditExportStorageService');
    storageService._resetClientsForTest();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    storageService._resetClientsForTest();
  });

  it('uploads, signs, deletes cancelled files, and removes orphaned S3-compatible export objects', async () => {
    const filePath = path.join(tempDir, 'security-audit-localstack.csv');
    fs.writeFileSync(filePath, 'createdAt,event\n2026-06-16,localstack\n');

    const uploaded = await storageService.putFile({
      localPath: filePath,
      jobId: '64f0000000000000000000cc',
      fileName: 'security-audit-localstack.csv'
    });

    const client = new S3Client({
      endpoint,
      forcePathStyle: true,
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });

    await expect(client.send(new HeadObjectCommand({
      Bucket: bucket,
      Key: uploaded.storageKey
    }))).resolves.toBeTruthy();

    const signedUrl = await storageService.signedDownloadUrl({
      storageProvider: 's3',
      storageKey: uploaded.storageKey,
      downloadFileName: 'security-audit-localstack.csv'
    });
    expect(signedUrl).toContain(bucket);

    await storageService.deleteObject({
      storageProvider: 's3',
      storageKey: uploaded.storageKey
    });

    const orphaned = await storageService.putFile({
      localPath: filePath,
      jobId: '64f0000000000000000000dd',
      fileName: 'security-audit-orphan.csv'
    });

    const deleted = await storageService.cleanupOrphanedObjects({
      activeJobs: [],
      olderThan: new Date(Date.now() + 60 * 1000)
    });
    expect(deleted).toBeGreaterThanOrEqual(1);

    const listed = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: orphaned.storageKey
    }));
    expect(listed.Contents || []).toHaveLength(0);
  });
});
