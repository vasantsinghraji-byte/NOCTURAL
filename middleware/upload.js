const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { fromBuffer } = require('file-type');
const logger = require('../utils/logger');
const storageConfig = require('../config/storage');

// Ensure upload directories exist (only for local storage)
const uploadDirs = [
  'uploads/profile-photos',
  'uploads/documents/mci',
  'uploads/documents/degrees',
  'uploads/documents/ids',
  'uploads/documents/certificates',
  'uploads/investigation-reports'
];

// Initialize upload directories asynchronously (only for local storage)
const initializeUploadDirs = async () => {
  if (!storageConfig.USE_LOCAL) {
    logger.info('Using Google Cloud Storage - skipping local directory initialization');
    return;
  }

  const promises = uploadDirs.map(async (dir) => {
    const fullPath = path.join(__dirname, '..', dir);
    try {
      await fs.promises.mkdir(fullPath, { recursive: true });
    } catch (error) {
      // Directory might already exist, that's OK
      if (error.code !== 'EEXIST') {
        logger.error('Failed to create upload directory', { path: fullPath, error: error.message });
      }
    }
  });

  await Promise.all(promises);
};

// Initialize directories (non-blocking)
initializeUploadDirs().catch(err => logger.error('Failed to initialize upload directories', { error: err.message }));

// Set upload type middleware for GCS path organization
const setUploadType = (type) => {
  return (req, res, next) => {
    req.uploadType = type;
    next();
  };
};

// Use storage from config (GCS or local based on environment)
const storage = storageConfig.storage;

// File filter for validation - checks MIME type AND extension
const fileFilter = (req, file, cb) => {
  // Allowed MIME types (more secure than extension checking)
  const allowedImageMimes = ['image/jpeg', 'image/jpg', 'image/png'];
  const allowedDocMimes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

  // Allowed extensions (as backup validation)
  const allowedImageExts = /jpeg|jpg|png/;
  const allowedDocExts = /jpeg|jpg|png|pdf/;

  const extname = path.extname(file.originalname).toLowerCase();
  const ext = extname.slice(1); // Remove the dot
  const mimetype = file.mimetype.toLowerCase();

  logger.info('File Upload Attempt', {
    fieldname: file.fieldname,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    userId: req.user ? req.user._id : 'anonymous'
  });

  // Profile photos - only images
  if (file.fieldname === 'profilePhoto') {
    if (allowedImageMimes.includes(mimetype) && allowedImageExts.test(ext)) {
      cb(null, true);
    } else {
      logger.logSecurity('invalid_file_upload', {
        fieldname: file.fieldname,
        mimetype,
        extension: ext,
        userId: req.user ? req.user._id : 'anonymous',
        reason: 'Invalid MIME type or extension for profile photo'
      });
      cb(new Error('Profile photos must be JPG, JPEG, or PNG with valid MIME type'), false);
    }
  }
  // Documents - images or PDFs
  else {
    if (allowedDocMimes.includes(mimetype) && allowedDocExts.test(ext)) {
      cb(null, true);
    } else {
      logger.logSecurity('invalid_file_upload', {
        fieldname: file.fieldname,
        mimetype,
        extension: ext,
        userId: req.user ? req.user._id : 'anonymous',
        reason: 'Invalid MIME type or extension for document'
      });
      cb(new Error('Documents must be JPG, JPEG, PNG, or PDF with valid MIME type'), false);
    }
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: storageConfig.limits,
  fileFilter: fileFilter
});

/**
 * Validate uploaded file using magic numbers (file signature)
 * This prevents MIME type spoofing attacks
 * Note: This only works for local storage - GCS files are validated differently
 */
const validateFileType = async (req, res, next) => {
  try {
    if (!req.file && !req.files) {
      return next();
    }

    // Skip validation for GCS uploads (files are streamed directly)
    if (storageConfig.USE_GCS) {
      return next();
    }

    const filesToValidate = [];

    if (req.file) {
      filesToValidate.push(req.file);
    }

    if (req.files) {
      if (Array.isArray(req.files)) {
        filesToValidate.push(...req.files);
      } else {
        // Handle field-based files
        Object.values(req.files).forEach(fileArray => {
          filesToValidate.push(...fileArray);
        });
      }
    }

    // Validate each file's magic numbers
    for (const file of filesToValidate) {
      // Use async file reading (non-blocking)
      const buffer = await fs.promises.readFile(file.path);
      const fileTypeResult = await fromBuffer(buffer);

      if (!fileTypeResult) {
        // Delete uploaded file asynchronously
        await fs.promises.unlink(file.path).catch(err => logger.warn('Failed to delete invalid file', { path: file.path, error: err.message }));
        logger.logSecurity('file_validation_failed', {
          filename: file.filename,
          reason: 'Could not determine file type from magic numbers',
          userId: req.user ? req.user._id : 'anonymous'
        });
        return res.status(400).json({
          success: false,
          message: 'Invalid file: Could not verify file type'
        });
      }

      // Check if detected MIME type matches what was declared
      const allowedMimes = ['image/jpeg', 'image/png', 'application/pdf'];
      if (!allowedMimes.includes(fileTypeResult.mime)) {
        // Delete uploaded file asynchronously
        await fs.promises.unlink(file.path).catch(err => logger.warn('Failed to delete invalid file', { path: file.path, error: err.message }));
        logger.logSecurity('file_type_mismatch', {
          filename: file.filename,
          declaredMime: file.mimetype,
          actualMime: fileTypeResult.mime,
          userId: req.user ? req.user._id : 'anonymous'
        });
        return res.status(400).json({
          success: false,
          message: `Invalid file type detected: ${fileTypeResult.mime}`
        });
      }

      logger.logFileUpload(file.filename, req.user ? req.user._id : 'anonymous', true);
    }

    next();
  } catch (error) {
    logger.error('File Validation Error', {
      error: error.message,
      userId: req.user ? req.user._id : 'anonymous'
    });
    next(error);
  }
};

/**
 * Create multer upload instance for investigation reports
 * Allows PDF and image files with higher size limits
 * Uses GCS in production, local disk in development
 */
const createReportUpload = () => {
  let reportStorage;

  // Use GCS storage in production
  if (storageConfig.USE_GCS && storageConfig.gcsBucket) {
    // Custom GCS storage engine for investigation reports
    reportStorage = {
      _handleFile: function(req, file, cb) {
        if (!storageConfig.gcsBucket) {
          return cb(new Error('Google Cloud Storage not initialized'));
        }

        try {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          const ext = path.extname(file.originalname);
          const dateFolder = new Date().toISOString().split('T')[0];
          const key = `investigation-reports/${dateFolder}/report-${req.user._id}-${uniqueSuffix}${ext}`;

          const blob = storageConfig.gcsBucket.file(key);
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
              mimetype: file.mimetype,
              filename: key
            });
          });
        } catch (error) {
          cb(error);
        }
      },
      _removeFile: function(req, file, cb) {
        if (!storageConfig.gcsBucket || !file.key) {
          return cb(null);
        }
        storageConfig.gcsBucket.file(file.key).delete()
          .then(() => cb(null))
          .catch((error) => cb(error));
      }
    };
  } else {
    // Fallback to local storage for development
    reportStorage = multer.diskStorage({
      destination: (_req, _file, cb) => {
        const dir = path.join(__dirname, '..', 'uploads/investigation-reports');
        fs.mkdir(dir, { recursive: true }, (err) => {
          if (err && err.code !== 'EEXIST') {
            return cb(err);
          }
          cb(null, dir);
        });
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `report-${req.user._id}-${uniqueSuffix}${ext}`);
      }
    });
  }

  const reportFileFilter = (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    const allowedExts = /jpeg|jpg|png|pdf/;
    const extname = path.extname(file.originalname).toLowerCase().slice(1);

    if (allowedMimes.includes(file.mimetype.toLowerCase()) && allowedExts.test(extname)) {
      cb(null, true);
    } else {
      logger.logSecurity('invalid_report_upload', {
        mimetype: file.mimetype,
        extension: extname,
        userId: req.user ? req.user._id : 'anonymous'
      });
      cb(new Error('Investigation reports must be JPG, PNG, or PDF files'), false);
    }
  };

  return multer({
    storage: reportStorage,
    limits: {
      fileSize: 20 * 1024 * 1024, // 20MB per file for reports
      files: 10 // Max 10 files per report
    },
    fileFilter: reportFileFilter
  });
};

// Export upload middleware configurations
module.exports = {
  // Single file uploads (with validation)
  uploadProfilePhoto: upload.single('profilePhoto'),
  uploadMCICertificate: upload.single('mciCertificate'),
  uploadMBBSDegree: upload.single('mbbsDegree'),
  uploadPhotoId: upload.single('photoId'),
  uploadCertificate: upload.single('certificate'),

  // Multiple document uploads
  uploadDocuments: upload.fields([
    { name: 'mciCertificate', maxCount: 1 },
    { name: 'mbbsDegree', maxCount: 1 },
    { name: 'photoId', maxCount: 1 }
  ]),

  // Investigation report upload factory
  createReportUpload,

  // File validation middleware (use AFTER multer middleware)
  validateFileType,

  // Upload type setters for GCS organization
  setUploadType,

  // Generic upload
  upload: upload,

  // Storage utilities
  storageConfig
};
