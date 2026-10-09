/**
 * Partner posts: photos and short videos on a partner's profile / shop page.
 *
 *   POST   /partner-posts/upload-url      (partner) one-time S3 upload link { mime, size } → { mode, url, key }
 *   POST   /partner-posts/complete        (partner) publish an uploaded file { key, caption }
 *   POST   /partner-posts                 (partner) post a photo or video: multipart "media" + "caption" (no S3 / small files)
 *   GET    /partner-posts/mine            (partner) my posts, incl. hidden ones
 *   DELETE /partner-posts/:id             (partner) delete my post
 *   GET    /partner-posts/mine/:id/media  (partner) open my post's file (any status)
 *   GET    /partner-posts/by/:userId      (public)  a partner's visible posts
 *   GET    /partner-posts/store/:storeId  (public)  a care shop's visible posts (owner + team)
 *   GET    /partner-posts/:id/media       (public)  open a visible post's file (short-lived link)
 *   GET    /partner-posts/admin           (admin)   latest posts for moderation
 *   GET    /partner-posts/admin/:id/media (admin)   open any post's file
 *   PATCH  /partner-posts/admin/:id       (admin)   hide / show a post { hidden, reason }
 */

const express = require('express');
const multer = require('multer');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { protect, authorize } = require('../middleware/auth');
const storageConfig = require('../config/storage');
const posts = require('../services/partnerPostService');

const router = express.Router();
const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};

const partner = [protect, authorize(...posts.PARTNER_ROLES)];
const admin = [protect, authorize('admin', 'platform_admin')];
// In memory so the type can be checked from the bytes before anything is stored.
const media = multer({ storage: multer.memoryStorage(), limits: { fileSize: posts.MAX_UPLOAD_BYTES, files: 1, fields: 4 } }).single('media');
const id = (name) => param(name).isMongoId().withMessage('Invalid id');

async function sendMedia(res, link) {
  if (!link) return res.status(404).send('Not found');
  res.set('Cache-Control', 'private, max-age=300');
  if (storageConfig.USE_CLOUD) {
    const url = await storageConfig.getSignedUrl(link.key, 900);
    return url ? res.redirect(302, url) : res.status(404).send('Not found');
  }
  // Local storage only: the path is built from our stored key under the uploads root.
  return res.type(link.mime).sendFile(storageConfig.resolveLocalFile(link.key), { dotfiles: 'allow' });
}

router.post('/', ...partner, media, [body('caption').optional().isString().isLength({ max: 300 })], validate,
  wrap(async (req, res) => res.status(201).json({ success: true, post: await posts.create(req.user, req.file, req.body.caption) })));

router.post('/upload-url', ...partner, [body('mime').isString().isLength({ max: 40 }), body('size').isInt({ min: 1, max: posts.MAX_UPLOAD_BYTES })], validate,
  wrap(async (req, res) => res.json({ success: true, upload: await posts.createUploadUrl(req.user, req.body) })));

router.post('/complete', ...partner, [body('key').isString().isLength({ max: 200 }), body('caption').optional().isString().isLength({ max: 300 })], validate,
  wrap(async (req, res) => res.status(201).json({ success: true, post: await posts.completeUpload(req.user, req.body) })));

router.get('/mine', ...partner, wrap(async (req, res) => res.json({ success: true, posts: await posts.listMine(req.user._id) })));

router.get('/mine/:id/media', ...partner, [id('id')], validate, wrap(async (req, res) => sendMedia(res, await posts.ownMediaLink(req.params.id, req.user._id))));

router.get('/admin', ...admin, [query('status').optional().isIn(['VISIBLE', 'HIDDEN'])], validate,
  wrap(async (req, res) => res.json({ success: true, posts: await posts.adminList(req.query) })));

router.get('/admin/:id/media', ...admin, [id('id')], validate, wrap(async (req, res) => sendMedia(res, await posts.mediaLink(req.params.id, req.user))));

router.patch('/admin/:id', ...admin, [id('id'), body('hidden').isBoolean(), body('reason').optional().isString().isLength({ max: 200 })], validate,
  wrap(async (req, res) => res.json({ success: true, post: await posts.adminSetHidden(req.params.id, req.user._id, req.body) })));

router.delete('/:id', ...partner, [id('id')], validate, wrap(async (req, res) => {
  await posts.remove(req.user._id, req.params.id);
  res.json({ success: true });
}));

router.get('/by/:userId', [id('userId'), query('limit').optional().isInt({ min: 1, max: 60 })], validate,
  wrap(async (req, res) => res.json({ success: true, posts: await posts.listByAuthor(req.params.userId, req.query) })));

router.get('/store/:storeId', [id('storeId'), query('limit').optional().isInt({ min: 1, max: 60 })], validate,
  wrap(async (req, res) => res.json({ success: true, posts: await posts.listByStore(req.params.storeId, req.query) })));

// Public: visible posts only (hidden ones 404 here).
router.get('/:id/media', [id('id')], validate, wrap(async (req, res) => sendMedia(res, await posts.mediaLink(req.params.id, null))));

module.exports = router;
