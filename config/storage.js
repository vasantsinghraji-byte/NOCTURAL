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
  files: 'investigation-reports'
};

const getUploadFolder = (req, file) => FIELD_UPLOAD_FOLDERS[file.fieldname] || req.uploadType || 'general';

// Determine storage backend — only use GCS when explicitly enabled and configured
const USE_GCS = process.env.USE_GCS === 'true' && !!process.env.GCS_BUCKET;
const USE_LOCAL = !USE_GCS;

if (process.env.NODE_ENV === 'production' && !USE_GCS) {
  logger.warn('Production environment using local storage — set USE_GCS=true and GCS_BUCKET to enable cloud storage');
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
module.exports = {
  USE_GCS,
  USE_LOCAL,
  gcsClient,
  gcsBucket,
  storage: USE_GCS && gcsBucket ? gcsStorage : localStorage,

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

  // Get file URL (works for both GCS and local)
  getFileUrl: (filename) => `/api/v1/uploads/file?key=${encodeURIComponent(normalizeStorageKey(filename))}`,

  // Generate signed URL for private GCS files
  getSignedUrl: async (key, expiresIn = 3600) => {
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

  // Delete file (works for both GCS and local)
  deleteFile: async (filename) => {
    if (!filename) return;
    const key = normalizeStorageKey(filename);
    if (USE_GCS && gcsBucket) {
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
