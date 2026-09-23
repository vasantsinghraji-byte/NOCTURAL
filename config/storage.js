const multer = require('multer');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const { createMagicByteValidatedStream } = require('../utils/uploadMagicByteValidator');
const UPLOADS_ROOT = path.resolve(__dirname, '../uploads');

const FIELD_UPLOAD_FOLDERS = {
  profilePhoto: 'profile-photos',
  mciCertificate: 'documents/mci',
  mbbsDegree: 'documents/degrees',
  photoId: 'documents/ids',
  certificate: 'documents/certificates',
  files: 'investigation-reports',
  // Health data: partitioned per patient so an order can only attach the
  // uploader's own prescription (see pharmacyService.createOrder).
  prescription: (req) => `prescriptions/${req.user._id}`
};

const getUploadFolder = (req, file) => {
  const folder = FIELD_UPLOAD_FOLDERS[file.fieldname];
  if (typeof folder === 'function') return folder(req, file);
  return folder || req.uploadType || 'general';
};

// Determine storage backend — only use GCS when explicitly enabled and configured
const USE_GCS = process.env.USE_GCS === 'true' && !!process.env.GCS_BUCKET;
// AWS S3 (production target): STORAGE_PROVIDER=s3 + S3_UPLOADS_BUCKET. Credentials
// come from the default AWS chain (ECS task role in AWS; env keys for MinIO locally).
const USE_S3 = !USE_GCS && process.env.STORAGE_PROVIDER === 's3' && !!process.env.S3_UPLOADS_BUCKET;
const USE_LOCAL = !USE_GCS && !USE_S3;
const USE_CLOUD = !USE_LOCAL;

if (process.env.NODE_ENV === 'production' && USE_LOCAL) {
  // WARNING: container disks are ephemeral (ECS/Fargate, Render). Local uploads
  // are lost on redeploy and are not shared between tasks. Use S3 in production.
  logger.warn('Production environment using local storage — set STORAGE_PROVIDER=s3 and S3_UPLOADS_BUCKET (or USE_GCS=true and GCS_BUCKET) to enable cloud storage');
}
if (process.env.STORAGE_PROVIDER === 's3' && !USE_S3) {
  logger.warn('STORAGE_PROVIDER=s3 but S3_UPLOADS_BUCKET is not set — falling back to local storage');
}

// Google Cloud Storage Client Configuration
let gcsClient = null;
let gcsBucket = null;

if (USE_GCS && process.env.GCS_BUCKET) {
  try {
    const { Storage } = require('@google-cloud/storage');

    // Initialize GCS client using application default credentials or inline credentials
    const gcsConfig = {};

    if (process.env.GCS_PROJECT_ID) {
      gcsConfig.projectId = process.env.GCS_PROJECT_ID;
    }

    // Support for inline credentials (Base64 encoded JSON key)
    if (process.env.GCS_CREDENTIALS) {
      try {
        const credentials = JSON.parse(Buffer.from(process.env.GCS_CREDENTIALS, 'base64').toString('utf8'));
        gcsConfig.credentials = credentials;
        gcsConfig.projectId = credentials.project_id;
      } catch (e) {
        const errMsg = 'Failed to parse GCS_CREDENTIALS — check that the value is valid Base64-encoded JSON';
        logger.error(errMsg, { error: e.message });
        if (process.env.NODE_ENV === 'production') {
          throw new Error(errMsg + ': ' + e.message, { cause: e });
        }
      }
    }

    gcsClient = new Storage(gcsConfig);
    gcsBucket = gcsClient.bucket(process.env.GCS_BUCKET);
    logger.info('Google Cloud Storage initialized', { bucket: process.env.GCS_BUCKET });
  } catch (error) {
    logger.error('Failed to initialize Google Cloud Storage', { error: error.message });
  }
}

// AWS S3 Client Configuration (lazy — the SDK is only loaded when S3 is used)
let s3Client = null;
const S3_BUCKET = process.env.S3_UPLOADS_BUCKET;

const getS3Client = () => {
  if (s3Client) return s3Client;
  const { S3Client } = require('@aws-sdk/client-s3');
  const config = { region: process.env.AWS_REGION || 'ap-south-1' };
  // S3-compatible endpoint for local dev (MinIO / LocalStack).
  if (process.env.S3_ENDPOINT) {
    config.endpoint = process.env.S3_ENDPOINT;
    config.forcePathStyle = process.env.S3_FORCE_PATH_STYLE !== 'false';
  }
  s3Client = new S3Client(config);
  return s3Client;
};

// SSE-S3 by default; SSE-KMS when a key is configured.
const s3EncryptionParams = () => (process.env.S3_UPLOADS_KMS_KEY_ID
  ? { ServerSideEncryption: 'aws:kms', SSEKMSKeyId: process.env.S3_UPLOADS_KMS_KEY_ID }
  : { ServerSideEncryption: 'AES256' });

const deleteS3Object = async (key) => {
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
  await getS3Client().send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
};

/** `<folder>/<yyyy-mm-dd>/<sanitised-name>-<unique><ext>` — shared by cloud engines. */
const buildObjectKey = (req, file) => {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  const ext = path.extname(file.originalname);
  const basename = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
  const dateFolder = new Date().toISOString().split('T')[0];
  return `${getUploadFolder(req, file)}/${dateFolder}/${basename}-${uniqueSuffix}${ext}`;
};

/**
 * Multer storage engine that streams to S3 through the magic-byte validator,
 * so spoofed files are rejected before (or aborted during) the upload.
 * `keyFor(req, file)` lets callers choose the object key layout.
 */
const createS3StorageEngine = (keyFor = buildObjectKey) => ({
  _handleFile(req, file, cb) {
    let key;
    try {
      key = keyFor(req, file);
    } catch (error) {
      return cb(error);
    }

    const { Upload } = require('@aws-sdk/lib-storage');
    const userId = req.user ? req.user._id.toString() : 'anonymous';
    const validatedUpload = createMagicByteValidatedStream(file, { userId });
    let callbackCalled = false;
    const done = (error, result) => {
      if (callbackCalled) return;
      callbackCalled = true;
      cb(error, result);
    };

    const upload = new Upload({
      client: getS3Client(),
      params: {
        Bucket: S3_BUCKET,
        Key: key,
        Body: file.stream.pipe(validatedUpload.stream),
        ContentType: file.mimetype,
        ...s3EncryptionParams(),
        Metadata: {
          fieldname: file.fieldname,
          uploadedby: userId,
          uploaddate: new Date().toISOString()
        }
      },
      leavePartsOnError: false
    });

    const abortUpload = (error) => {
      if (callbackCalled) return;
      upload.abort().catch(() => {});
      deleteS3Object(key).catch((deleteError) => {
        logger.warn('Failed to delete rejected S3 upload', { key, error: deleteError.message });
      });
      done(error);
    };

    validatedUpload.stream.on('error', abortUpload);
    file.stream.on('error', abortUpload);

    upload.done()
      .then(() => done(null, {
        key,
        filename: key,
        location: `s3://${S3_BUCKET}/${key}`,
        bucket: S3_BUCKET,
        size: validatedUpload.getSize(),
        mimetype: file.mimetype
      }))
      .catch(abortUpload);
  },

  _removeFile(req, file, cb) {
    if (!file.key) return cb(null);
    deleteS3Object(file.key).then(() => cb(null), cb);
  }
});

// Local Storage Configuration (fallback for development)
const localStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = getUploadFolder(req, file);
    const uploadPath = path.join(__dirname, '../uploads', folder);

    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${basename}-${uniqueSuffix}${ext}`);
  }
});

// Custom multer storage engine for Google Cloud Storage
const gcsStorage = {
  _handleFile: async function(req, file, cb) {
    if (!gcsBucket) {
      return cb(new Error('Google Cloud Storage not initialized'));
    }

    try {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      const basename = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `${basename}-${uniqueSuffix}${ext}`;

      // Organize by upload type and date
      const folder = getUploadFolder(req, file);
      const dateFolder = new Date().toISOString().split('T')[0];
      const key = `${folder}/${dateFolder}/${filename}`;

      const blob = gcsBucket.file(key);
      const blobStream = blob.createWriteStream({
        resumable: false,
        metadata: {
          contentType: file.mimetype,
          metadata: {
            fieldName: file.fieldname,
            uploadedBy: req.user ? req.user._id.toString() : 'anonymous',
            uploadDate: new Date().toISOString()
          }
        }
      });

      const validatedUpload = createMagicByteValidatedStream(file, {
        userId: req.user ? req.user._id.toString() : 'anonymous'
      });
      let callbackCalled = false;

      const done = (error, result) => {
        if (callbackCalled) return;
        callbackCalled = true;
        cb(error, result);
      };

      const abortUpload = (error) => {
        blobStream.destroy(error);
        blob.delete().catch(deleteError => {
          logger.warn('Failed to delete rejected GCS upload', {
            key,
            error: deleteError.message
          });
        });
        done(error);
      };

      validatedUpload.stream.on('error', abortUpload);
      file.stream.on('error', abortUpload);

      file.stream.pipe(validatedUpload.stream).pipe(blobStream);

      blobStream.on('error', (error) => {
        done(error);
      });

      blobStream.on('finish', () => {
        const publicUrl = `https://storage.googleapis.com/${process.env.GCS_BUCKET}/${key}`;
        done(null, {
          key: key,
          filename: key,
          location: publicUrl,
          bucket: process.env.GCS_BUCKET,
          size: validatedUpload.getSize(),
          mimetype: file.mimetype
        });
      });
    } catch (error) {
      cb(error);
    }
  },
  _removeFile: async function(req, file, cb) {
    if (!gcsBucket || !file.key) {
      return cb(null);
    }
    try {
      await gcsBucket.file(file.key).delete();
      cb(null);
    } catch (error) {
      cb(error);
    }
  }
};

// File Filter for security
// MIME type to allowed extensions mapping
const MIME_EXTENSION_MAP = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
};

const ALLOWED_MIME_TYPES = Object.keys(MIME_EXTENSION_MAP);

const normalizeStorageKey = (key) => {
  if (typeof key !== 'string' || !key.trim()) {
    throw new Error('Stored file key is missing');
  }

  const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized.split('/').includes('..')) {
    throw new Error('Stored file key is invalid');
  }
  return normalized;
};

const getStorageKey = (file) => {
  if (file.key) {
    return normalizeStorageKey(file.key);
  }
  if (!file.path) {
    throw new Error('Uploaded file does not include a storage path');
  }

  const resolvedPath = path.resolve(file.path);
  const relativePath = path.relative(UPLOADS_ROOT, resolvedPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Uploaded file is outside the configured storage root');
  }
  return normalizeStorageKey(relativePath);
};

const toStoredFile = (file) => {
  const key = getStorageKey(file);
  return {
    key,
    url: `/api/v1/uploads/file?key=${encodeURIComponent(key)}`,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size
  };
};

const resolveLocalFile = (key) => {
  const normalized = normalizeStorageKey(key);
  const resolvedPath = path.resolve(UPLOADS_ROOT, normalized);
  if (resolvedPath !== UPLOADS_ROOT && !resolvedPath.startsWith(`${UPLOADS_ROOT}${path.sep}`)) {
    throw new Error('Stored file key resolves outside the upload root');
  }
  return resolvedPath;
};

const fileFilter = (req, file, cb) => {
  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error(`File type not allowed: ${file.mimetype}`), false);
  }

  // Cross-validate file extension against claimed MIME type
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = MIME_EXTENSION_MAP[file.mimetype];
  if (!allowedExtensions.includes(ext)) {
    return cb(new Error(`File extension "${ext}" does not match MIME type "${file.mimetype}"`), false);
  }

  cb(null, true);
};

// Export storage configuration
const selectStorage = () => {
  if (USE_GCS && gcsBucket) return gcsStorage;
  if (USE_S3) return createS3StorageEngine();
  return localStorage;
};

module.exports = {
  USE_GCS,
  USE_S3,
  USE_LOCAL,
  USE_CLOUD,
  gcsClient,
  gcsBucket,
  S3_BUCKET,
  getS3Client,
  createS3StorageEngine,
  buildObjectKey,
  storage: selectStorage(),

  fileFilter,

  // Limits
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
    files: 5 // Maximum 5 files per upload
  },

  // Allowed MIME types and extension map (for consumers that need the list)
  ALLOWED_MIME_TYPES,
  MIME_EXTENSION_MAP,
  getStorageKey,
  toStoredFile,
  resolveLocalFile,

  // Get file URL (works for GCS, S3 and local)
  getFileUrl: (filename) => `/api/v1/uploads/file?key=${encodeURIComponent(normalizeStorageKey(filename))}`,

  // Generate a short-lived signed URL for private cloud files (GCS or S3)
  getSignedUrl: async (key, expiresIn = 3600) => {
    if (USE_S3) {
      try {
        const { GetObjectCommand } = require('@aws-sdk/client-s3');
        const { getSignedUrl: presign } = require('@aws-sdk/s3-request-presigner');
        return await presign(
          getS3Client(),
          new GetObjectCommand({ Bucket: S3_BUCKET, Key: normalizeStorageKey(key) }),
          { expiresIn }
        );
      } catch (error) {
        logger.error('Failed to generate S3 signed URL', { error: error.message });
        return null;
      }
    }

    if (!USE_GCS || !gcsBucket) {
      return null;
    }

    try {
      const [url] = await gcsBucket.file(key).getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + expiresIn * 1000
      });
      return url;
    } catch (error) {
      logger.error('Failed to generate signed URL', { error: error.message });
      return null;
    }
  },

  // List every stored object key in the active cloud bucket (null for local).
  listObjectKeys: async () => {
    if (USE_S3) {
      const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
      const keys = [];
      let ContinuationToken;
      do {
        const page = await getS3Client().send(new ListObjectsV2Command({ Bucket: S3_BUCKET, ContinuationToken }));
        (page.Contents || []).forEach(object => keys.push(object.Key));
        ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (ContinuationToken);
      return keys;
    }
    if (USE_GCS && gcsBucket) {
      const [files] = await gcsBucket.getFiles();
      return files.map(file => file.name);
    }
    return null;
  },

  // Delete file (works for both GCS and local)
  deleteFile: async (filename) => {
    if (!filename) return;
    const key = normalizeStorageKey(filename);
    if (USE_S3) {
      // DeleteObject is idempotent: a missing key is not an error.
      await deleteS3Object(key);
    } else if (USE_GCS && gcsBucket) {
      try {
        await gcsBucket.file(key).delete();
      } catch (error) {
        if (error.code !== 404) {
          logger.error('Failed to delete file from GCS', { filename: key, error: error.message });
          throw error;
        }
      }
    } else {
      const filePath = resolveLocalFile(key);
      const relativePath = path.relative(UPLOADS_ROOT, filePath);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error('Refusing to delete a file outside the configured storage root');
      }
      try {
        await fs.promises.unlink(filePath);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.error('Failed to delete local file', { filename: key, error: error.message });
          throw error;
        }
      }
    }
  }
};
