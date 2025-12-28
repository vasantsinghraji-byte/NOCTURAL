const multer = require('multer');
const path = require('path');
const logger = require('../utils/logger');

// Determine storage backend based on environment
const USE_GCS = process.env.USE_GCS === 'true' || process.env.NODE_ENV === 'production';
const USE_LOCAL = !USE_GCS;

// Google Cloud Storage Client Configuration
let gcsClient = null;
let gcsBucket = null;

if (USE_GCS && process.env.GCS_BUCKET) {
  try {
    const { Storage } = require('@google-cloud/storage');

    // Initialize GCS client
    // Uses GOOGLE_APPLICATION_CREDENTIALS env var for auth, or inline credentials
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
        logger.error('Failed to parse GCS_CREDENTIALS', { error: e.message });
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
    const folder = req.uploadType || 'general';
    const uploadPath = path.join(__dirname, '../uploads', folder);

    // Create directory if it doesn't exist
    const fs = require('fs');
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
      const folder = req.uploadType || 'general';
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

      let size = 0;

      file.stream.on('data', (chunk) => {
        size += chunk.length;
      });

      file.stream.pipe(blobStream);

      blobStream.on('error', (error) => {
        cb(error);
      });

      blobStream.on('finish', () => {
        const publicUrl = `https://storage.googleapis.com/${process.env.GCS_BUCKET}/${key}`;
        cb(null, {
          key: key,
          location: publicUrl,
          bucket: process.env.GCS_BUCKET,
          size: size,
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
const fileFilter = (req, file, cb) => {
  // Allowed file types
  const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${file.mimetype}`), false);
  }
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

  // Get file URL (works for both GCS and local)
  getFileUrl: (filename) => {
    if (USE_GCS) {
      const bucket = process.env.GCS_BUCKET;
      return `https://storage.googleapis.com/${bucket}/${filename}`;
    } else {
      return `/uploads/${filename}`;
    }
  },

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
    if (USE_GCS && gcsBucket) {
      try {
        await gcsBucket.file(filename).delete();
      } catch (error) {
        logger.warn('Failed to delete file from GCS', { filename, error: error.message });
      }
    } else {
      const fs = require('fs').promises;
      const filePath = path.join(__dirname, '../uploads', filename);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // File might not exist, ignore error
      }
    }
  }
};
