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
const storageConfig = require('../config/storage');
const idempotency = require('../middleware/idempotency');
const { nullProtoObject } = require('../utils/safeMongo');

const DELETABLE_DOCUMENT_TYPES = ['mciCertificate', 'mbbsDegree', 'photoId'];

function getUploadedFiles(req) {
  if (req.file) return [req.file];
  if (!req.files) return [];
  if (Array.isArray(req.files)) return req.files;
  return Object.values(req.files).flat();
}

function toStoredDocument(file, additionalFields = {}) {
  const storedFile = storageConfig.toStoredFile(file);
  return {
    ...additionalFields,
    url: storedFile.url,
    publicId: storedFile.key,
    uploadedAt: new Date()
  };
}

async function deleteStoredFiles(keys) {
  await Promise.all(keys.filter(Boolean).map(key => storageConfig.deleteFile(key)));
}

async function cleanupRequestFiles(req) {
  const keys = getUploadedFiles(req).flatMap(file => {
    try {
      return [storageConfig.getStorageKey(file)];
    } catch {
      return [];
    }
  });
  await deleteStoredFiles(keys);
}

function userOwnsStorageKey(user, requestedKey) {
  const keys = [
    user.profilePhoto?.publicId,
    user.documents?.mciCertificate?.publicId,
    user.documents?.mbbsDegree?.publicId,
    user.documents?.photoId?.publicId,
    ...(user.documents?.additionalCertificates || []).map(document => document.publicId)
  ].filter(Boolean);

  return keys.includes(requestedKey);
}

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

// Download an uploaded file only when the key is referenced by the caller's record.
router.get('/file', protect, async (req, res) => {
  try {
    const key = storageConfig.getStorageKey({ key: req.query.key });
    const user = await User.findById(req.user._id)
      .select('documents profilePhoto');

    if (!user || !userOwnsStorageKey(user, key)) {
      return res.status(404).send('File not found');
    }

    if (storageConfig.USE_GCS) {
      const signedUrl = await storageConfig.getSignedUrl(key);
      if (!signedUrl) {
        return res.status(404).send('File not found');
      }
      return res.redirect(302, signedUrl);
    }

    return res.sendFile(storageConfig.resolveLocalFile(key));
  } catch (error) {
    logUploadError(error, req, 'file_download');
    return res.status(404).send('File not found');
  }
});

// Upload profile photo
router.post('/profile-photo', protect, idempotency({ route: 'uploads/profile-photo', required: true }), uploadProfilePhoto, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      await cleanupRequestFiles(req);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const oldKey = user.profilePhoto?.publicId;
    // Update user profile photo
    user.profilePhoto = toStoredDocument(req.file);

    // Recalculate profile strength
    user.calculateProfileStrength();
    await user.save();
    await deleteStoredFiles([oldKey]);

    res.json({
      success: true,
      message: 'Profile photo uploaded successfully',
      data: {
        profilePhoto: user.profilePhoto,
        profileStrength: user.profileStrength
      }
    });
  } catch (error) {
    await cleanupRequestFiles(req);
    sendUploadError(res, req, error, 'profile_photo_upload');
  }
});

// Upload MCI certificate
router.post('/mci-certificate', protect, idempotency({ route: 'uploads/mci-certificate', required: true }), uploadMCICertificate, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      await cleanupRequestFiles(req);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.documents) {
      user.documents = {};
    }

    const oldKey = user.documents.mciCertificate?.publicId;
    user.documents.mciCertificate = toStoredDocument(req.file, { verified: false });

    user.calculateProfileStrength();
    await user.save();
    await deleteStoredFiles([oldKey]);

    res.json({
      success: true,
      message: 'MCI certificate uploaded successfully. Awaiting verification.',
      data: {
        document: user.documents.mciCertificate,
        profileStrength: user.profileStrength
      }
    });
  } catch (error) {
    await cleanupRequestFiles(req);
    sendUploadError(res, req, error, 'mci_certificate_upload');
  }
});

// Upload MBBS degree
router.post('/mbbs-degree', protect, idempotency({ route: 'uploads/mbbs-degree', required: true }), uploadMBBSDegree, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      await cleanupRequestFiles(req);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.documents) {
      user.documents = {};
    }

    const oldKey = user.documents.mbbsDegree?.publicId;
    user.documents.mbbsDegree = toStoredDocument(req.file, { verified: false });

    user.calculateProfileStrength();
    await user.save();
    await deleteStoredFiles([oldKey]);

    res.json({
      success: true,
      message: 'MBBS degree uploaded successfully. Awaiting verification.',
      data: {
        document: user.documents.mbbsDegree,
        profileStrength: user.profileStrength
      }
    });
  } catch (error) {
    await cleanupRequestFiles(req);
    sendUploadError(res, req, error, 'mbbs_degree_upload');
  }
});

// Upload photo ID
router.post('/photo-id', protect, idempotency({ route: 'uploads/photo-id', required: true }), uploadPhotoId, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      await cleanupRequestFiles(req);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.documents) {
      user.documents = {};
    }

    const oldKey = user.documents.photoId?.publicId;
    user.documents.photoId = toStoredDocument(req.file, { verified: false });

    user.calculateProfileStrength();
    await user.save();
    await deleteStoredFiles([oldKey]);

    res.json({
      success: true,
      message: 'Photo ID uploaded successfully. Awaiting verification.',
      data: {
        document: user.documents.photoId,
        profileStrength: user.profileStrength
      }
    });
  } catch (error) {
    await cleanupRequestFiles(req);
    sendUploadError(res, req, error, 'photo_id_upload');
  }
});

// Upload additional certificate
router.post('/certificate', protect, idempotency({ route: 'uploads/certificate', required: true }), uploadCertificate, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const { certificateName } = req.body;
    if (!certificateName) {
      await cleanupRequestFiles(req);
      return res.status(400).json({ success: false, message: 'Certificate name is required' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      await cleanupRequestFiles(req);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.documents) {
      user.documents = {};
    }
    if (!user.documents.additionalCertificates) {
      user.documents.additionalCertificates = [];
    }

    user.documents.additionalCertificates.push(toStoredDocument(req.file, { name: certificateName }));

    await user.save();

    res.json({
      success: true,
      message: 'Certificate uploaded successfully',
      data: {
        certificates: user.documents.additionalCertificates
      }
    });
  } catch (error) {
    await cleanupRequestFiles(req);
    sendUploadError(res, req, error, 'certificate_upload');
  }
});

// Upload multiple documents at once
router.post('/documents', protect, idempotency({ route: 'uploads/documents', required: true }), uploadDocuments, async (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      await cleanupRequestFiles(req);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.documents) {
      user.documents = {};
    }

    const uploadedFiles = nullProtoObject();
    const replacedKeys = [];

    // Process MCI certificate
    if (req.files.mciCertificate && req.files.mciCertificate[0]) {
      const file = req.files.mciCertificate[0];
      replacedKeys.push(user.documents.mciCertificate?.publicId);
      user.documents.mciCertificate = toStoredDocument(file, { verified: false });
      uploadedFiles.mciCertificate = true;
    }

    // Process MBBS degree
    if (req.files.mbbsDegree && req.files.mbbsDegree[0]) {
      const file = req.files.mbbsDegree[0];
      replacedKeys.push(user.documents.mbbsDegree?.publicId);
      user.documents.mbbsDegree = toStoredDocument(file, { verified: false });
      uploadedFiles.mbbsDegree = true;
    }

    // Process photo ID
    if (req.files.photoId && req.files.photoId[0]) {
      const file = req.files.photoId[0];
      replacedKeys.push(user.documents.photoId?.publicId);
      user.documents.photoId = toStoredDocument(file, { verified: false });
      uploadedFiles.photoId = true;
    }

    user.calculateProfileStrength();
    await user.save();
    await deleteStoredFiles(replacedKeys);

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
    await cleanupRequestFiles(req);
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
router.delete('/:documentType', protect, idempotency({ route: 'uploads/delete', required: true }), async (req, res) => {
  try {
    const { documentType } = req.params;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    let deletedKey;
    if (documentType === 'profilePhoto') {
      deletedKey = user.profilePhoto?.publicId;
      if (!deletedKey) {
        return res.status(404).json({ success: false, message: 'Document not found' });
      }
      user.profilePhoto = undefined;
    } else if (DELETABLE_DOCUMENT_TYPES.includes(documentType) && user.documents?.[documentType]) {
      deletedKey = user.documents[documentType].publicId;
      user.documents[documentType] = undefined;
    } else {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    user.calculateProfileStrength();
    await user.save();
    await deleteStoredFiles([deletedKey]);

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

router.delete('/certificate/:certificateId', protect, idempotency({ route: 'uploads/delete-certificate', required: true }), async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const certificate = user?.documents?.additionalCertificates?.id(req.params.certificateId);
    if (!certificate?.publicId) {
      return res.status(404).json({ success: false, message: 'Certificate not found' });
    }
    const deletedKey = certificate.publicId;
    certificate.deleteOne();
    await user.save();
    await deleteStoredFiles([deletedKey]);
    return res.json({ success: true, message: 'Certificate deleted successfully' });
  } catch (error) {
    sendUploadError(res, req, error, 'certificate_delete');
  }
});

module.exports = router;
