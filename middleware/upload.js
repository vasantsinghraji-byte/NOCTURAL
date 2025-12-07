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
  'uploads/documents/certificates'
];

// Initialize upload directories asynchronously (only for local storage)
const initializeUploadDirs = async () => {
  if (!storageConfig.USE_LOCAL) {
    logger.info('Using S3 storage - skipping local directory initialization');
    return;
  }

  const promises = uploadDirs.map(async (dir) => {
    const fullPath = path.join(__dirname, '..', dir);
    try {
      await fs.promises.mkdir(fullPath, { recursive: true });
    } catch (error) {
      // Directory might already exist, that's OK
      if (error.code !== 'EEXIST') {
        console.error(`Failed to create directory ${fullPath}:`, error);
      }
    }
  });

  await Promise.all(promises);
};

// Initialize directories (non-blocking)
initializeUploadDirs().catch(console.error);

// Set upload type middleware for S3 path organization
const setUploadType = (type) => {
  return (req, res, next) => {
    req.uploadType = type;
    next();
  };
};

// Use storage from config (S3 or local based on environment)
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
 */
const validateFileType = async (req, res, next) => {
  try {
    if (!req.file && !req.files) {
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
        await fs.promises.unlink(file.path).catch(console.error);
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
        await fs.promises.unlink(file.path).catch(console.error);
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

  // File validation middleware (use AFTER multer middleware)
  validateFileType,

  // Upload type setters for S3 organization
  setUploadType,

  // Generic upload
  upload: upload,

  // Storage utilities
  storageConfig
};
