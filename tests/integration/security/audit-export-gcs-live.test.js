/* eslint-disable security/detect-non-literal-fs-filename -- Integration test creates temporary CSV fixtures for a short-lived GCS bucket. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Storage } = require('@google-cloud/storage');

const describeIfLiveGcs = process.env.RUN_AUDIT_EXPORT_GCS_LIVE === 'true'
  ? describe
  : describe.skip;

describeIfLiveGcs('Audit export live GCS integration', () => {
  let tempDir;
  let bucketName;
  let storage;
  let storageService;

  beforeAll(async () => {
    const projectId = process.env.GCS_AUDIT_EXPORT_TEST_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) {
      throw new Error('GCS_AUDIT_EXPORT_TEST_PROJECT or GOOGLE_CLOUD_PROJECT is required');
    }

    storage = new Storage({ projectId });
    bucketName = `nocturnal-audit-export-${crypto.randomBytes(6).toString('hex')}`;
    await storage.createBucket(bucketName, {
      location: process.env.GCS_AUDIT_EXPORT_TEST_LOCATION || 'US',
      labels: {
        app: 'nocturnal',
        purpose: 'audit-export-test'
      }
    });

    process.env.AUDIT_EXPORT_STORAGE_PROVIDER = 'gcs';
    process.env.AUDIT_EXPORT_GCS_BUCKET = bucketName;
    process.env.AUDIT_EXPORT_STORAGE_PREFIX = `live-gcs-${Date.now()}`;
    process.env.GCS_PROJECT_ID = projectId;
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-export-live-gcs-'));
    jest.resetModules();
    storageService = require('../../../services/auditExportStorageService');
    storageService._resetClientsForTest();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    storageService._resetClientsForTest();
  });

  afterAll(async () => {
    if (storage && bucketName) {
      const bucket = storage.bucket(bucketName);
      const [files] = await bucket.getFiles().catch(() => [[]]);
      await Promise.all(files.map(file => file.delete({ ignoreNotFound: true }).catch(() => {})));
      await bucket.delete().catch(() => {});
    }
    delete process.env.AUDIT_EXPORT_STORAGE_PROVIDER;
    delete process.env.AUDIT_EXPORT_GCS_BUCKET;
    delete process.env.AUDIT_EXPORT_STORAGE_PREFIX;
  });

  it('uploads, signs, deletes, and cleans orphaned GCS audit export objects', async () => {
    const filePath = path.join(tempDir, 'security-audit-live-gcs.csv');
    fs.writeFileSync(filePath, 'createdAt,event\n2026-06-16,live-gcs\n');

    const uploaded = await storageService.putFile({
      localPath: filePath,
      jobId: '64f0000000000000000000ee',
      fileName: 'security-audit-live-gcs.csv'
    });

    const bucket = storage.bucket(bucketName);
    await expect(bucket.file(uploaded.storageKey).exists()).resolves.toEqual([true]);

    const signedUrl = await storageService.signedDownloadUrl({
      storageProvider: 'gcs',
      storageKey: uploaded.storageKey,
      downloadFileName: 'security-audit-live-gcs.csv'
    });
    expect(signedUrl).toContain('storage.googleapis.com');

    await storageService.deleteObject({
      storageProvider: 'gcs',
      storageKey: uploaded.storageKey
    });
    await expect(bucket.file(uploaded.storageKey).exists()).resolves.toEqual([false]);

    const orphan = await storageService.putFile({
      localPath: filePath,
      jobId: '64f0000000000000000000ef',
      fileName: 'security-audit-live-gcs-orphan.csv'
    });
    const deleted = await storageService.cleanupOrphanedObjects({
      activeJobs: [],
      olderThan: new Date(Date.now() + 60 * 1000)
    });

    expect(deleted).toBeGreaterThanOrEqual(1);
    await expect(bucket.file(orphan.storageKey).exists()).resolves.toEqual([false]);
  });
});
