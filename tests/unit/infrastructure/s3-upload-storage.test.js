/**
 * S3 upload storage (AWS target) — SDK mocked, no network.
 *
 * Locks: S3 is selected by STORAGE_PROVIDER=s3 + S3_UPLOADS_BUCKET, uploads
 * stream through the magic-byte validator with SSE, spoofed files are aborted
 * and deleted, prescriptions are partitioned per patient, and reads are
 * short-lived presigned URLs.
 */

const { Readable } = require('stream');

// Plain classes (not jest.fn): jest.config sets resetMocks, which would wipe
// factory implementations before each test.
const sdkCalls = { uploads: [], commands: [], presign: [] };

jest.mock('@aws-sdk/client-s3', () => {
  class Command {
    constructor(input) { this.input = input; this.name = this.constructor.name; }
  }
  class DeleteObjectCommand extends Command {}
  class GetObjectCommand extends Command {}
  class ListObjectsV2Command extends Command {}
  class S3Client {
    constructor(config) { this.config = config; }
    async send(command) {
      sdkCalls.commands.push(command);
      if (command.name === 'ListObjectsV2Command') {
        return command.input.ContinuationToken
          ? { Contents: [{ Key: 'b.png' }], IsTruncated: false }
          : { Contents: [{ Key: 'a.png' }], IsTruncated: true, NextContinuationToken: 't1' };
      }
      return {};
    }
  }
  return { S3Client, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command };
});

jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: class {
    constructor({ params }) { this.params = params; sdkCalls.uploads.push(params); }
    done() {
      return new Promise((resolve, reject) => {
        this.params.Body.on('data', () => {});
        this.params.Body.on('end', resolve);
        this.params.Body.on('error', reject);
      });
    }
    abort() { return Promise.resolve(); }
  }
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: async (client, command, options) => {
    sdkCalls.presign.push({ command, options });
    return `https://signed.example/${command.input.Key}?X-Amz-Expires=${options.expiresIn}`;
  }
}));

// 1×1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

const loadStorage = (env) => {
  let storage;
  const saved = { ...process.env };
  Object.assign(process.env, env);
  jest.isolateModules(() => {
    // file-type is ESM-only; stub the signature check like file-type-detector.test.js.
    require('../../../utils/fileTypeDetector').setFileTypeModuleForTest({
      fileTypeFromBuffer: async (buffer) => (buffer.toString('hex').startsWith('89504e47')
        ? { ext: 'png', mime: 'image/png' }
        : undefined)
    });
    storage = require('../../../config/storage');
  });
  process.env = saved;
  return storage;
};

const S3_ENV = { STORAGE_PROVIDER: 's3', S3_UPLOADS_BUCKET: 'medrush-test-uploads', USE_GCS: 'false', AWS_REGION: 'ap-south-1' };

const runEngine = (engine, req, file) => new Promise((resolve) => {
  engine._handleFile(req, file, (error, info) => resolve({ error, info }));
});

beforeEach(() => {
  sdkCalls.uploads.length = 0;
  sdkCalls.commands.length = 0;
  sdkCalls.presign.length = 0;
});

describe('S3 upload storage', () => {
  it('is selected only with STORAGE_PROVIDER=s3 and a bucket', () => {
    expect(loadStorage(S3_ENV)).toMatchObject({ USE_S3: true, USE_CLOUD: true, USE_LOCAL: false });
    expect(loadStorage({ ...S3_ENV, S3_UPLOADS_BUCKET: '' })).toMatchObject({ USE_S3: false, USE_LOCAL: true });
  });

  it('streams a valid prescription to a per-patient key with server-side encryption', async () => {
    const storage = loadStorage(S3_ENV);
    const req = { user: { _id: 'patient123' } };
    const file = { fieldname: 'prescription', originalname: 'rx scan.png', mimetype: 'image/png', stream: Readable.from([PNG]) };

    const { error, info } = await runEngine(storage.storage, req, file);

    expect(error).toBeFalsy();
    expect(info.key).toMatch(/^prescriptions\/patient123\/\d{4}-\d{2}-\d{2}\/rx_scan-\d+-\d+\.png$/);
    expect(sdkCalls.uploads[0]).toMatchObject({
      Bucket: 'medrush-test-uploads',
      Key: info.key,
      ContentType: 'image/png',
      ServerSideEncryption: 'AES256'
    });
    expect(storage.toStoredFile({ ...file, key: info.key }).key).toBe(info.key);
  });

  it('aborts and deletes a spoofed file (declared PNG, actually text)', async () => {
    const storage = loadStorage(S3_ENV);
    const file = {
      fieldname: 'prescription',
      originalname: 'fake.png',
      mimetype: 'image/png',
      stream: Readable.from([Buffer.from('#!/bin/sh\necho definitely not an image\n'.repeat(20))])
    };

    const { error } = await runEngine(storage.storage, { user: { _id: 'p1' } }, file);

    expect(error).toBeTruthy();
    await new Promise(setImmediate);
    expect(sdkCalls.commands.some(c => c.name === 'DeleteObjectCommand')).toBe(true);
  });

  it('uses SSE-KMS when a key is configured', async () => {
    const storage = loadStorage({ ...S3_ENV, S3_UPLOADS_KMS_KEY_ID: 'arn:aws:kms:ap-south-1:1:key/abc' });
    // Env is read at upload time, so keep it set for the call.
    process.env.S3_UPLOADS_KMS_KEY_ID = 'arn:aws:kms:ap-south-1:1:key/abc';
    try {
      const file = { fieldname: 'profilePhoto', originalname: 'me.png', mimetype: 'image/png', stream: Readable.from([PNG]) };
      await runEngine(storage.storage, { user: { _id: 'u1' } }, file);
      expect(sdkCalls.uploads[0]).toMatchObject({ ServerSideEncryption: 'aws:kms', SSEKMSKeyId: 'arn:aws:kms:ap-south-1:1:key/abc' });
    } finally {
      delete process.env.S3_UPLOADS_KMS_KEY_ID;
    }
  });

  it('hands out short-lived presigned read URLs and rejects traversal keys', async () => {
    const storage = loadStorage(S3_ENV);
    const url = await storage.getSignedUrl('prescriptions/p1/2026-09-22/a.png', 300);
    expect(url).toContain('X-Amz-Expires=300');
    expect(sdkCalls.presign[0].command.input).toEqual({ Bucket: 'medrush-test-uploads', Key: 'prescriptions/p1/2026-09-22/a.png' });

    expect(await storage.getSignedUrl('../etc/passwd')).toBeNull();
  });

  it('lists every key across paginated responses (orphan reconciliation)', async () => {
    const storage = loadStorage(S3_ENV);
    await expect(storage.listObjectKeys()).resolves.toEqual(['a.png', 'b.png']);
    expect(await loadStorage({ STORAGE_PROVIDER: '', USE_GCS: 'false' }).listObjectKeys()).toBeNull();
  });
});

describe('prescription ownership', () => {
  const { isOwnPrescriptionKey } = require('../../../services/pharmacyService');

  it('only accepts keys under the ordering patient\'s own prefix', () => {
    expect(isOwnPrescriptionKey('prescriptions/p1/2026-09-22/rx.png', 'p1')).toBe(true);
    expect(isOwnPrescriptionKey('prescriptions/p2/2026-09-22/rx.png', 'p1')).toBe(false);
    expect(isOwnPrescriptionKey('prescriptions/p1/../p2/rx.png', 'p1')).toBe(false);
    expect(isOwnPrescriptionKey('profile-photos/rx.png', 'p1')).toBe(false);
    expect(isOwnPrescriptionKey(undefined, 'p1')).toBe(false);
  });
});
