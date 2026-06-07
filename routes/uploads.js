const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { protect } = require('../middleware/auth');
const {
  uploadProfilePhoto,
  uploadMCICertificate,
  uploadMBBSDegree,
  uploadPhotoId,
  uploadCertificate,
  uploadDocuments
} = require('../middleware/upload');
const User = require('../models/user');
const logger = require('../utils/logger');

function getRequestId(req) {
  if (!req.requestId) {
    req.requestId = req.get('x-request-id') || crypto.randomUUID();
  }

  return req.requestId;
}

function toPublic(_err, req) {
  return {
    success: false,
    error: 'upload_failed',
    requestId: getRequestId(req)
  };
}

function logUploadError(err, req, action) {
  const requestId = getRequestId(req);

  logger.error('Upload route error', {
    action,
    requestId,
    userId: req.user?._id,
    path: req.originalUrl,
    method: req.method,
    error: err.message,
    stack: err.stack
  });

  return requestId;
}

function sendUploadError(res, req, err, action) {
  logUploadError(err, req, action);
  res.status(500).json(toPublic(err, req));
}

// Upload profile photo
router.post('/profile-photo', protect, uploadProfilePhoto, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Update user profile photo
    user.profilePhoto = {
      url: `/uploads/profile-photos/${req.file.filename}`,
      publicId: req.file.filename,
      uploadedAt: new Date()
    };

    // Recalculate profile strength
    user.calculateProfileStrength();
    await user.save();

    res.json({
      success: true,
      message: 'Profile photo uploaded successfully',
      data: {
        profilePhoto: user.profilePhoto,
        profileStrength: user.profileStrength
      }
    });
  } catch (error) {
    sendUploadError(res, req, error, 'profile_photo_upload');
  }
});

// Upload MCI certificate
router.post('/mci-certificate', protect, uploadMCICertificate, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.documents) {
      user.documents = {};
    }

    user.documents.mciCertificate = {
      url: `/uploads/documents/mci/${req.file.filename}`,
      publicId: req.file.filename,
      verified: false,
      uploadedAt: new Date()
    };

    user.calculateProfileStrength();
    await user.save();

    res.json({
      success: true,
      message: 'MCI certificate uploaded successfully. Awaiting verification.',
      data: {
        document: user.documents.mciCertificate,
        profileStrength: user.profileStrength
      }
    });
  } catch (error) {
    sendUploadError(res, req, error, 'mci_certificate_upload');
  }
});

// Upload MBBS degree
router.post('/mbbs-degree', protect, uploadMBBSDegree, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.documents) {
      user.documents = {};
    }

    user.documents.mbbsDegree = {
      url: `/uploads/documents/degrees/${req.file.filename}`,
      publicId: req.file.filename,
      verified: false,
      uploadedAt: new Date()
    };

    user.calculateProfileStrength();
    await user.save();

    res.json({
      success: true,
      message: 'MBBS degree uploaded successfully. Awaiting verification.',
      data: {
        document: user.documents.mbbsDegree,
        profileStrength: user.profileStrength
      }
    });
  } catch (error) {
    sendUploadError(res, req, error, 'mbbs_degree_upload');
  }
});

// Upload photo ID
router.post('/photo-id', protect, uploadPhotoId, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.documents) {
      user.documents = {};
    }

    user.documents.photoId = {
      url: `/uploads/documents/ids/${req.file.filename}`,
      publicId: req.file.filename,
      verified: false,
      uploadedAt: new Date()
    };

    user.calculateProfileStrength();
    await user.save();

    res.json({
      success: true,
      message: 'Photo ID uploaded successfully. Awaiting verification.',
      data: {
        document: user.documents.photoId,
        profileStrength: user.profileStrength
      }
    });
  } catch (error) {
    sendUploadError(res, req, error, 'photo_id_upload');
  }
});

// Upload additional certificate
router.post('/certificate', protect, uploadCertificate, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const { certificateName } = req.body;
    if (!certificateName) {
      return res.status(400).json({ success: false, message: 'Certificate name is required' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.documents) {
      user.documents = {};
    }
    if (!user.documents.additionalCertificates) {
      user.documents.additionalCertificates = [];
    }

    user.documents.additionalCertificates.push({
      name: certificateName,
      url: `/uploads/documents/certificates/${req.file.filename}`,
      publicId: req.file.filename,
      uploadedAt: new Date()
    });

    await user.save();

    res.json({
      success: true,
      message: 'Certificate uploaded successfully',
      data: {
        certificates: user.documents.additionalCertificates
      }
    });
  } catch (error) {
    sendUploadError(res, req, error, 'certificate_upload');
  }
});

// Upload multiple documents at once
router.post('/documents', protect, uploadDocuments, async (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.documents) {
      user.documents = {};
    }

    const uploadedFiles = {};

    // Process MCI certificate
    if (req.files.mciCertificate && req.files.mciCertificate[0]) {
      const file = req.files.mciCertificate[0];
      user.documents.mciCertificate = {
        url: `/uploads/documents/mci/${file.filename}`,
        publicId: file.filename,
        verified: false,
        uploadedAt: new Date()
      };
      uploadedFiles.mciCertificate = true;
    }

    // Process MBBS degree
    if (req.files.mbbsDegree && req.files.mbbsDegree[0]) {
      const file = req.files.mbbsDegree[0];
      user.documents.mbbsDegree = {
        url: `/uploads/documents/degrees/${file.filename}`,
        publicId: file.filename,
        verified: false,
        uploadedAt: new Date()
      };
      uploadedFiles.mbbsDegree = true;
    }

    // Process photo ID
    if (req.files.photoId && req.files.photoId[0]) {
      const file = req.files.photoId[0];
      user.documents.photoId = {
        url: `/uploads/documents/ids/${file.filename}`,
        publicId: file.filename,
        verified: false,
        uploadedAt: new Date()
      };
      uploadedFiles.photoId = true;
    }

    user.calculateProfileStrength();
    await user.save();

    res.json({
      success: true,
      message: 'Documents uploaded successfully. Awaiting verification.',
      data: {
        uploaded: uploadedFiles,
        documents: user.documents,
        profileStrength: user.profileStrength
      }
    });
  } catch (error) {
    sendUploadError(res, req, error, 'documents_upload');
  }
});

// Get upload status and document list
router.get('/status', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('documents profilePhoto profileStrength');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      data: {
        profilePhoto: user.profilePhoto,
        documents: user.documents,
        profileStrength: user.profileStrength,
        missingDocuments: user.getMissingFields()
      }
    });
  } catch (error) {
    sendUploadError(res, req, error, 'upload_status');
  }
});

// Delete uploaded document
router.delete('/:documentType', protect, async (req, res) => {
  try {
    const { documentType } = req.params;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (documentType === 'profilePhoto') {
      user.profilePhoto = undefined;
    } else if (user.documents && user.documents[documentType]) {
      user.documents[documentType] = undefined;
    } else {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    user.calculateProfileStrength();
    await user.save();

    res.json({
      success: true,
      message: 'Document deleted successfully',
      data: {
        profileStrength: user.profileStrength
      }
    });
  } catch (error) {
    sendUploadError(res, req, error, 'document_delete');
  }
});

module.exports = router;
