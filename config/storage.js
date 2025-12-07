const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');

// Determine storage backend based on environment
const USE_S3 = process.env.USE_S3 === 'true' || process.env.NODE_ENV === 'production';
const USE_LOCAL = !USE_S3;

// S3 Client Configuration
let s3Client = null;
if (USE_S3) {
  s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    } : undefined // Uses IAM role if running on AWS (ECS/EC2)
  });
}

// S3 Storage Configuration
const s3Storage = USE_S3 ? multerS3({
  s3: s3Client,
  bucket: process.env.S3_BUCKET || 'nocturnal-uploads',
  acl: 'private', // Files are private by default
  contentType: multerS3.AUTO_CONTENT_TYPE,
  metadata: (req, file, cb) => {
    cb(null, {
      fieldName: file.fieldname,
      uploadedBy: req.user ? req.user._id.toString() : 'anonymous',
      uploadDate: new Date().toISOString()
    });
  },
  key: (req, file, cb) => {
    // Generate unique filename with timestamp and random string
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${basename}-${uniqueSuffix}${ext}`;

    // Organize by upload type and date
    const folder = req.uploadType || 'general';
    const dateFolder = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const key = `${folder}/${dateFolder}/${filename}`;

    cb(null, key);
  }
}) : null;

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
  USE_S3,
  USE_LOCAL,
  s3Client,
  storage: USE_S3 ? s3Storage : localStorage,
  fileFilter,

  // Limits
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
    files: 5 // Maximum 5 files per upload
  },

  // Get file URL (works for both S3 and local)
  getFileUrl: (filename) => {
    if (USE_S3) {
      const bucket = process.env.S3_BUCKET || 'nocturnal-uploads';
      const region = process.env.AWS_REGION || 'us-east-1';
      return `https://${bucket}.s3.${region}.amazonaws.com/${filename}`;
    } else {
      return `/uploads/${filename}`;
    }
  },

  // Generate signed URL for private S3 files
  getSignedUrl: async (key, expiresIn = 3600) => {
    if (!USE_S3 || !s3Client) {
      return null;
    }

    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET || 'nocturnal-uploads',
      Key: key
    });

    return await getSignedUrl(s3Client, command, { expiresIn });
  },

  // Delete file (works for both S3 and local)
  deleteFile: async (filename) => {
    if (USE_S3 && s3Client) {
      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
      const command = new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET || 'nocturnal-uploads',
        Key: filename
      });
      await s3Client.send(command);
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
