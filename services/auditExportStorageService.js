/* eslint-disable security/detect-non-literal-fs-filename -- Audit export storage operates on internally generated export file paths and object keys. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Storage } = require('@google-cloud/storage');
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const logger = require('../utils/logger');

const VALID_PROVIDERS = new Set(['local', 'gcs', 's3']);
const DEFAULT_CONTENT_TYPE = 'text/csv; charset=utf-8';

const provider = () => {
  const configured = String(process.env.AUDIT_EXPORT_STORAGE_PROVIDER || '').toLowerCase();
  if (VALID_PROVIDERS.has(configured)) return configured;
  if (process.env.AUDIT_EXPORT_GCS_BUCKET) return 'gcs';
  if (process.env.AUDIT_EXPORT_S3_BUCKET) return 's3';
  return 'local';
};

const prefix = () => String(process.env.AUDIT_EXPORT_STORAGE_PREFIX || 'audit-exports')
  .replace(/\\/g, '/')
  .replace(/^\/+|\/+$/g, '');

const signedUrlTtlSeconds = () => Number(process.env.AUDIT_EXPORT_SIGNED_URL_TTL_SECONDS) || 5 * 60;
const gcsKmsKeyName = () => process.env.AUDIT_EXPORT_GCS_KMS_KEY_NAME || process.env.GCS_KMS_KEY_NAME;
const s3SseMode = () => process.env.AUDIT_EXPORT_S3_SSE || 'AES256';
const s3KmsKeyId = () => process.env.AUDIT_EXPORT_S3_KMS_KEY_ID || process.env.AWS_S3_KMS_KEY_ID;

let gcsBucket = null;
const getGcsBucket = () => {
  if (gcsBucket) return gcsBucket;
  const bucketName = process.env.AUDIT_EXPORT_GCS_BUCKET || process.env.GCS_BUCKET;
  if (!bucketName) throw new Error('AUDIT_EXPORT_GCS_BUCKET or GCS_BUCKET is required for GCS audit exports');

  const gcsConfig = {};
  if (process.env.GCS_PROJECT_ID) gcsConfig.projectId = process.env.GCS_PROJECT_ID;
  if (process.env.GCS_CREDENTIALS) {
    const credentials = JSON.parse(Buffer.from(process.env.GCS_CREDENTIALS, 'base64').toString('utf8'));
    gcsConfig.credentials = credentials;
    gcsConfig.projectId = credentials.project_id;
  }

  gcsBucket = new Storage(gcsConfig).bucket(bucketName);
  return gcsBucket;
};

let s3Client = null;
const getS3Client = () => {
  if (s3Client) return s3Client;
  const endpoint = process.env.AUDIT_EXPORT_S3_ENDPOINT || process.env.AWS_ENDPOINT_URL_S3;
  const config = {
    region: process.env.AUDIT_EXPORT_S3_REGION || process.env.AWS_REGION || 'us-east-1'
  };
  if (endpoint) {
    config.endpoint = endpoint;
    config.forcePathStyle = process.env.AUDIT_EXPORT_S3_FORCE_PATH_STYLE !== 'false';
  }
  if (endpoint || process.env.AWS_ACCESS_KEY_ID) {
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test'
    };
  }
  s3Client = new S3Client(config);
  return s3Client;
};

const s3BucketName = () => {
  const bucket = process.env.AUDIT_EXPORT_S3_BUCKET || process.env.AWS_S3_BUCKET;
  if (!bucket) throw new Error('AUDIT_EXPORT_S3_BUCKET or AWS_S3_BUCKET is required for S3 audit exports');
  return bucket;
};

const objectNameFor = ({ jobId, fileName }) => [prefix(), `${jobId}-${path.basename(fileName)}`]
  .filter(Boolean)
  .join('/');

const isOlderThan = (value, cutoff) => {
  const date = value instanceof Date ? value : new Date(value || 0);
  return !Number.isNaN(date.getTime()) && date < cutoff;
};

const sha256File = localPath => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256');
  const input = fs.createReadStream(localPath);
  input.on('error', reject);
  input.on('data', chunk => hash.update(chunk));
  input.on('end', () => resolve(hash.digest('hex')));
});

const gcsEncryptionMetadata = () => {
  const keyName = gcsKmsKeyName();
  return keyName
    ? { mode: 'gcs:kms', keyId: keyName }
    : { mode: 'gcs:bucket-default' };
};

const s3EncryptionMetadata = () => {
  const mode = s3SseMode();
  const keyId = mode === 'aws:kms' ? s3KmsKeyId() : undefined;
  return {
    mode: `s3:${mode}`,
    ...(keyId ? { keyId } : {})
  };
};

const s3EncryptionCommandFields = () => {
  const mode = s3SseMode();
  return {
    ServerSideEncryption: mode,
    ...(mode === 'aws:kms' && s3KmsKeyId() ? { SSEKMSKeyId: s3KmsKeyId() } : {})
  };
};

const verifyUploadedChecksum = async ({ storageProvider, storageKey, localPath, checksum }) => {
  if (storageProvider === 'local') {
    const storedChecksum = await sha256File(localPath);
    if (storedChecksum !== checksum.value) {
      throw new Error('Local audit export checksum verification failed');
    }
    return;
  }

  if (storageProvider === 'gcs') {
    const [metadata] = await getGcsBucket().file(storageKey).getMetadata();
    if (metadata?.metadata?.sha256 !== checksum.value) {
      throw new Error('GCS audit export checksum verification failed');
    }
    return;
  }

  if (storageProvider === 's3') {
    const head = await getS3Client().send(new HeadObjectCommand({
      Bucket: s3BucketName(),
      Key: storageKey
    }));
    const metadata = head.Metadata || {};
    if (metadata.sha256 !== checksum.value) {
      throw new Error('S3 audit export checksum verification failed');
    }
  }
};

const putFile = async ({ localPath, jobId, fileName, contentType = DEFAULT_CONTENT_TYPE }) => {
  const storageProvider = provider();
  const downloadFileName = path.basename(fileName || localPath);
  const checksum = {
    algorithm: 'sha256',
    value: await sha256File(localPath),
    verifiedAt: new Date()
  };

  if (storageProvider === 'local') {
    await verifyUploadedChecksum({ storageProvider, localPath, checksum });
    return {
      storageProvider,
      storageKey: localPath,
      filePath: localPath,
      downloadFileName,
      encryption: { mode: 'local:none' },
      checksum
    };
  }

  const storageKey = objectNameFor({ jobId, fileName: downloadFileName });

  if (storageProvider === 'gcs') {
    await getGcsBucket().upload(localPath, {
      destination: storageKey,
      resumable: false,
      metadata: {
        contentType,
        metadata: {
          sha256: checksum.value
        }
      },
      ...(gcsKmsKeyName() ? { kmsKeyName: gcsKmsKeyName() } : {})
    });
  } else if (storageProvider === 's3') {
    await getS3Client().send(new PutObjectCommand({
      Bucket: s3BucketName(),
      Key: storageKey,
      Body: fs.createReadStream(localPath),
      ContentType: contentType,
      Metadata: {
        sha256: checksum.value
      },
      ...s3EncryptionCommandFields()
    }));
  }

  await verifyUploadedChecksum({ storageProvider, storageKey, checksum });

  return {
    storageProvider,
    storageKey,
    filePath: null,
    downloadFileName,
    encryption: storageProvider === 'gcs' ? gcsEncryptionMetadata() : s3EncryptionMetadata(),
    checksum
  };
};

const signedDownloadUrl = async (job) => {
  if (!job || !job.storageKey) return null;
  const ttlSeconds = signedUrlTtlSeconds();

  if (job.storageProvider === 'gcs') {
    const [url] = await getGcsBucket().file(job.storageKey).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + ttlSeconds * 1000,
      responseDisposition: `attachment; filename="${job.downloadFileName || 'security-audit.csv'}"`
    });
    return url;
  }

  if (job.storageProvider === 's3') {
    return getSignedUrl(
      getS3Client(),
      new GetObjectCommand({
        Bucket: s3BucketName(),
        Key: job.storageKey,
        ResponseContentDisposition: `attachment; filename="${job.downloadFileName || 'security-audit.csv'}"`
      }),
      { expiresIn: ttlSeconds }
    );
  }

  return null;
};

const deleteObject = async (job) => {
  if (!job) return;

  try {
    if (job.storageProvider === 'gcs' && job.storageKey) {
      await getGcsBucket().file(job.storageKey).delete({ ignoreNotFound: true });
      return;
    }

    if (job.storageProvider === 's3' && job.storageKey) {
      await getS3Client().send(new DeleteObjectCommand({
        Bucket: s3BucketName(),
        Key: job.storageKey
      }));
      return;
    }

    if (job.filePath) {
      await fs.promises.unlink(job.filePath).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  } catch (error) {
    logger.warn('Failed to delete audit export object', {
      jobId: String(job._id || job.id || ''),
      provider: job.storageProvider,
      storageKey: job.storageKey,
      error: error.message
    });
    throw error;
  }
};

const cleanupLocalOrphans = async ({ activeFilePaths, localDirectory, olderThan }) => {
  const entries = await fs.promises.readdir(localDirectory, { withFileTypes: true }).catch(() => []);
  let deleted = 0;
  await Promise.all(entries
    .filter(entry => entry.isFile() && /^security-audit-.*\.csv$/.test(entry.name))
    .map(async (entry) => {
      const filePath = path.join(localDirectory, entry.name);
      if (activeFilePaths.has(filePath)) return;
      const stat = await fs.promises.stat(filePath).catch(() => null);
      if (!stat || !isOlderThan(stat.mtime, olderThan)) return;
      await fs.promises.unlink(filePath).catch(() => {});
      deleted += 1;
    }));
  return deleted;
};

const cleanupGcsOrphans = async ({ activeStorageKeys, olderThan }) => {
  const [files] = await getGcsBucket().getFiles({ prefix: prefix() });
  let deleted = 0;
  await Promise.all(files.map(async (file) => {
    if (activeStorageKeys.has(file.name)) return;
    if (!isOlderThan(file.metadata?.updated || file.metadata?.timeCreated, olderThan)) return;
    await file.delete({ ignoreNotFound: true });
    deleted += 1;
  }));
  return deleted;
};

const cleanupS3Orphans = async ({ activeStorageKeys, olderThan }) => {
  const client = getS3Client();
  const bucket = s3BucketName();
  let continuationToken;
  let deleted = 0;

  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix(),
      ContinuationToken: continuationToken
    }));
    const objects = response.Contents || [];
    await Promise.all(objects.map(async (object) => {
      if (!object.Key || activeStorageKeys.has(object.Key)) return;
      if (!isOlderThan(object.LastModified, olderThan)) return;
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: object.Key }));
      deleted += 1;
    }));
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return deleted;
};

const cleanupOrphanedObjects = async ({ activeJobs = [], localDirectory, olderThan } = {}) => {
  const activeStorageKeys = new Set(activeJobs.map(job => job.storageKey).filter(Boolean));
  const activeFilePaths = new Set(activeJobs.map(job => job.filePath).filter(Boolean));
  const storageProvider = provider();

  if (storageProvider === 'gcs') {
    return cleanupGcsOrphans({ activeStorageKeys, olderThan });
  }

  if (storageProvider === 's3') {
    return cleanupS3Orphans({ activeStorageKeys, olderThan });
  }

  return cleanupLocalOrphans({ activeFilePaths, localDirectory, olderThan });
};

const resetClientsForTest = () => {
  gcsBucket = null;
  s3Client = null;
};

module.exports = {
  provider,
  putFile,
  signedDownloadUrl,
  deleteObject,
  cleanupOrphanedObjects,
  _resetClientsForTest: resetClientsForTest
};
