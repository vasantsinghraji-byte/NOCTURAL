/**
 * Profile pictures for customers and partners (app and website).
 *
 *   POST   /profile-photo                 upload my photo (JPG/PNG, checked by content)
 *   DELETE /profile-photo                 remove my photo
 *   GET    /profile-photo/:type/:id       view a photo (redirect to a short-lived link)
 *
 * Who can view: a partner's photo, any signed-in account (patients see who is
 * coming to their home). A customer's photo, only the customer, professionals
 * who have a visit with them, and platform admins.
 */

const express = require('express');
const mongoose = require('mongoose');
const { param } = require('express-validator');
const { validate } = require('../middleware/validation');
const { protectBoth } = require('../middleware/patientAuth');
const { uploadProfilePhoto } = require('../middleware/upload');
const storageConfig = require('../config/storage');
const Patient = require('../models/patient');
const User = require('../models/user');
const NurseBooking = require('../models/nurseBooking');
const logger = require('../utils/logger');

const router = express.Router();
const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};

const modelFor = (req) => (req.userType === 'patient' ? Patient : User);
const photoUrl = (type, id, at) => `/api/v1/profile-photo/${type}/${id}?v=${at.getTime()}`;

async function removeFile(key) {
  if (!key) return;
  try {
    if (storageConfig.USE_S3) {
      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
      await storageConfig.getS3Client().send(new DeleteObjectCommand({ Bucket: storageConfig.S3_BUCKET, Key: key }));
    } else if (storageConfig.USE_LOCAL) {
      await require('fs').promises.unlink(storageConfig.resolveLocalFile(key)); // lgtm[js/path-injection]
    }
  } catch (err) {
    logger.warn('Old profile photo not removed', { error: err.message });
  }
}

router.post('/', protectBoth, uploadProfilePhoto, wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Choose a JPG or PNG photo' });
  const stored = storageConfig.toStoredFile(req.file);
  const type = req.userType === 'patient' ? 'patient' : 'user';
  const at = new Date();
  const prev = await modelFor(req).findByIdAndUpdate(
    req.user._id,
    { $set: { profilePhoto: { url: photoUrl(type, req.user._id, at), publicId: stored.key, uploadedAt: at } } },
    { new: false }
  ).select('profilePhoto').lean();
  if (prev?.profilePhoto?.publicId && prev.profilePhoto.publicId !== stored.key) await removeFile(prev.profilePhoto.publicId);
  res.json({ success: true, profilePhoto: { url: photoUrl(type, req.user._id, at), uploadedAt: at } });
}));

router.delete('/', protectBoth, wrap(async (req, res) => {
  const prev = await modelFor(req).findByIdAndUpdate(req.user._id, { $unset: { profilePhoto: 1 } }, { new: false }).select('profilePhoto').lean();
  await removeFile(prev?.profilePhoto?.publicId);
  res.json({ success: true });
}));

async function canView(req, type, id) {
  if (type === 'user') return true; // partner photos are shown to customers before a visit
  if (req.userType === 'patient') return String(req.user._id) === String(id);
  if (req.user.role === 'platform_admin') return true;
  return !!(await NurseBooking.exists({ patient: id, serviceProvider: req.user._id }));
}

router.get('/:type/:id', protectBoth, [param('type').isIn(['user', 'patient']), param('id').isMongoId()], validate, wrap(async (req, res) => {
  const { type, id } = req.params;
  if (!(await canView(req, type, id))) return res.status(404).send('Not found');
  const Model = type === 'patient' ? Patient : User;
  const doc = await Model.findById(new mongoose.Types.ObjectId(id)).select('profilePhoto').lean();
  const key = doc?.profilePhoto?.publicId;
  if (!key) return res.status(404).send('Not found');
  res.set('Cache-Control', 'private, max-age=300');
  if (storageConfig.USE_CLOUD) {
    const url = await storageConfig.getSignedUrl(key, 600);
    if (!url) return res.status(404).send('Not found');
    return res.redirect(302, url);
  }
  // Local storage only. The path is built from our stored key under the uploads root.
  return res.sendFile(storageConfig.resolveLocalFile(key), { dotfiles: 'allow' });
}));

module.exports = router;
