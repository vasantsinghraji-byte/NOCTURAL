/**
 * Partner posts: photos and short videos on a partner's profile / shop page.
 *
 * - Only partner accounts can post (customers can't).
 * - The file type is checked from its content (magic bytes), not its name:
 *   JPG / PNG / WebP photos up to 10 MB, MP4 / MOV / WebM videos up to 40 MB.
 * - At most 60 visible posts per partner and 20 new posts a day.
 * - Files live in the private bucket; viewers get a short-lived link.
 * - On S3 the app/website uploads straight to the bucket with a one-time
 *   signed link (exact type and size), into partner-posts-pending/. The post
 *   is only published after the server reads the stored file's first bytes
 *   and moves it to partner-posts/. Abandoned uploads expire after a day.
 * - Admins can hide a post; hidden posts are never shown to customers.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const PartnerPost = require('../models/partnerPost');
const User = require('../models/user');
const CareStore = require('../models/careStore');
const storageConfig = require('../config/storage');
const { detectFileTypeFromBuffer } = require('../utils/fileTypeDetector');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError, AuthorizationError, ConflictError } = require('../utils/errors');

const PARTNER_ROLES = ['nurse', 'physiotherapist', 'medical_staff', 'pharmacy_vendor', 'phlebotomist', 'delivery_partner', 'lab_partner'];
const TYPES = {
  'image/jpeg': { kind: 'IMAGE', ext: 'jpg', max: 10 * 1024 * 1024 },
  'image/png': { kind: 'IMAGE', ext: 'png', max: 10 * 1024 * 1024 },
  'image/webp': { kind: 'IMAGE', ext: 'webp', max: 10 * 1024 * 1024 },
  'video/mp4': { kind: 'VIDEO', ext: 'mp4', max: 40 * 1024 * 1024 },
  'video/quicktime': { kind: 'VIDEO', ext: 'mov', max: 40 * 1024 * 1024 },
  'video/webm': { kind: 'VIDEO', ext: 'webm', max: 40 * 1024 * 1024 }
};
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;
const MAX_VISIBLE = 60;
const MAX_PER_DAY = 20;

const isPartner = (user) => !!user && PARTNER_ROLES.includes(user.role);

function publicPost(p) {
  return {
    _id: p._id,
    author: p.author,
    kind: p.kind,
    caption: p.caption || '',
    mediaUrl: `/api/v1/partner-posts/${p._id}/media`,
    createdAt: p.createdAt,
    ...(p.status === 'HIDDEN' ? { status: 'HIDDEN', hiddenReason: p.hiddenReason } : {})
  };
}

async function putObject(key, buffer, mime) {
  if (storageConfig.USE_S3) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const kms = process.env.S3_UPLOADS_KMS_KEY_ID ? { ServerSideEncryption: 'aws:kms', SSEKMSKeyId: process.env.S3_UPLOADS_KMS_KEY_ID } : { ServerSideEncryption: 'AES256' };
    await storageConfig.getS3Client().send(new PutObjectCommand({ Bucket: storageConfig.S3_BUCKET, Key: key, Body: buffer, ContentType: mime, ...kms }));
    return;
  }
  if (storageConfig.USE_LOCAL) {
    const file = storageConfig.resolveLocalFile(key);
    await fs.promises.mkdir(path.dirname(file), { recursive: true }); // lgtm[js/path-injection]
    await fs.promises.writeFile(file, buffer); // lgtm[js/path-injection]
    return;
  }
  throw new ValidationError('Uploads aren’t available right now');
}

async function deleteObject(key) {
  try {
    if (storageConfig.USE_S3) {
      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
      await storageConfig.getS3Client().send(new DeleteObjectCommand({ Bucket: storageConfig.S3_BUCKET, Key: key }));
    } else if (storageConfig.USE_LOCAL) {
      await fs.promises.unlink(storageConfig.resolveLocalFile(key)); // lgtm[js/path-injection]
    }
  } catch (err) {
    logger.warn('Partner post file not removed', { error: err.message });
  }
}

/** A partner posts a photo or video (`file` is a multer memory file). */
async function create(user, file, caption) {
  if (!isPartner(user)) throw new AuthorizationError('Only partners can post photos and videos');
  if (!file || !file.buffer || !file.buffer.length) throw new ValidationError('Choose a photo or video to post');
  const detected = await detectFileTypeFromBuffer(file.buffer.subarray(0, 4100));
  const type = detected && TYPES[detected.mime];
  if (!type) {
    logger.logSecurity('partner_post_rejected_type', { userId: String(user._id), declared: file.mimetype, detected: detected && detected.mime });
    throw new ValidationError('Post a JPG, PNG or WebP photo, or an MP4, MOV or WebM video');
  }
  if (file.buffer.length > type.max) throw new ValidationError(type.kind === 'VIDEO' ? 'Videos can be up to 40 MB' : 'Photos can be up to 10 MB');

  await checkQuota(user._id);

  const key = `partner-posts/${user._id}/${crypto.randomUUID()}.${type.ext}`;
  await putObject(key, file.buffer, detected.mime);
  const post = await PartnerPost.create({
    author: user._id, authorRole: user.role, kind: type.kind, key, mime: detected.mime,
    size: file.buffer.length, caption: String(caption || '').trim().slice(0, 300) || undefined
  });
  return publicPost(post);
}

const PENDING_KEY = /^partner-posts-pending\/([a-f0-9]{24})\/([0-9a-f-]{36})\.(jpg|png|webp|mp4|mov|webm)$/;

async function checkQuota(userId) {
  const [visible, today] = await Promise.all([
    PartnerPost.countDocuments({ author: userId, status: 'VISIBLE' }),
    PartnerPost.countDocuments({ author: userId, createdAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) } })
  ]);
  if (visible >= MAX_VISIBLE) throw new ConflictError(`You can keep up to ${MAX_VISIBLE} posts. Delete an old one to add more`);
  if (today >= MAX_PER_DAY) throw new ConflictError(`You can add up to ${MAX_PER_DAY} posts a day`);
}

/**
 * Step 1 (S3): a one-time link to upload one file of this exact type and size.
 * Without S3 (local development) the client posts the file to POST / instead.
 */
async function createUploadUrl(user, { mime, size }) {
  if (!isPartner(user)) throw new AuthorizationError('Only partners can post photos and videos');
  const type = TYPES[String(mime || '').toLowerCase()];
  if (!type) throw new ValidationError('Post a JPG, PNG or WebP photo, or an MP4, MOV or WebM video');
  const bytes = Number(size);
  if (!Number.isInteger(bytes) || bytes < 1) throw new ValidationError('File size is missing');
  if (bytes > type.max) throw new ValidationError(type.kind === 'VIDEO' ? 'Videos can be up to 40 MB' : 'Photos can be up to 10 MB');
  await checkQuota(user._id);
  if (!storageConfig.USE_S3) return { mode: 'direct' };
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const key = `partner-posts-pending/${user._id}/${crypto.randomUUID()}.${type.ext}`;
  // Type and length are part of the signature: S3 refuses any other file.
  const url = await getSignedUrl(storageConfig.getS3Client(),
    new PutObjectCommand({ Bucket: storageConfig.S3_BUCKET, Key: key, ContentType: String(mime).toLowerCase(), ContentLength: bytes }),
    { expiresIn: 900 });
  return { mode: 's3', url, key, method: 'PUT', headers: { 'Content-Type': String(mime).toLowerCase() } };
}

/** Step 2 (S3): check what was uploaded, then publish it. */
async function completeUpload(user, { key, caption }) {
  if (!isPartner(user)) throw new AuthorizationError('Only partners can post photos and videos');
  const m = PENDING_KEY.exec(String(key || ''));
  if (!m || m[1] !== String(user._id)) throw new ValidationError('That upload can’t be found. Please try again');
  if (!storageConfig.USE_S3) throw new ValidationError('Uploads aren’t available right now');
  const { HeadObjectCommand, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
  const s3 = storageConfig.getS3Client();
  const Bucket = storageConfig.S3_BUCKET;
  let head;
  try {
    head = await s3.send(new HeadObjectCommand({ Bucket, Key: key }));
  } catch {
    throw new ValidationError('The upload didn’t finish. Please try again');
  }
  const discard = () => s3.send(new DeleteObjectCommand({ Bucket, Key: key })).catch(() => undefined);
  const first = await s3.send(new GetObjectCommand({ Bucket, Key: key, Range: 'bytes=0-4099' }));
  const sample = Buffer.from(await first.Body.transformToByteArray());
  const detected = await detectFileTypeFromBuffer(sample);
  const type = detected && TYPES[detected.mime];
  // The content must be the same kind (photo / video) as the link was signed for.
  const declared = Object.values(TYPES).find((t) => t.ext === m[3]);
  if (!type || !declared || type.kind !== declared.kind) {
    await discard();
    logger.logSecurity('partner_post_rejected_type', { userId: String(user._id), detected: detected && detected.mime, key });
    throw new ValidationError('Post a JPG, PNG or WebP photo, or an MP4, MOV or WebM video');
  }
  if (Number(head.ContentLength) > type.max) { await discard(); throw new ValidationError('That file is too large'); }
  await checkQuota(user._id);
  const finalKey = `partner-posts/${user._id}/${m[2]}.${type.ext}`;
  await s3.send(new CopyObjectCommand({
    Bucket, Key: finalKey, CopySource: `${Bucket}/${key}`, ContentType: detected.mime, MetadataDirective: 'REPLACE', ServerSideEncryption: 'AES256'
  }));
  await discard();
  const post = await PartnerPost.create({
    author: user._id, authorRole: user.role, kind: type.kind, key: finalKey, mime: detected.mime,
    size: Number(head.ContentLength), caption: String(caption || '').trim().slice(0, 300) || undefined
  });
  return publicPost(post);
}

async function listMine(userId) {
  const posts = await PartnerPost.find({ author: userId }).sort({ createdAt: -1 }).limit(MAX_VISIBLE + 20).lean();
  return posts.map(publicPost);
}

async function remove(userId, postId) {
  if (!mongoose.isValidObjectId(postId)) throw new NotFoundError('Post', postId);
  const post = await PartnerPost.findOneAndDelete({ _id: postId, author: userId }).lean();
  if (!post) throw new NotFoundError('Post', postId);
  await deleteObject(post.key);
  return true;
}

/** Visible posts by one partner (only while their account is active). */
async function listByAuthor(authorId, { limit = 30 } = {}) {
  if (!mongoose.isValidObjectId(authorId)) throw new NotFoundError('Partner', authorId);
  const author = await User.findById(authorId).select('role isActive').lean();
  if (!author || author.isActive === false || !isPartner(author)) return [];
  const posts = await PartnerPost.find({ author: authorId, status: 'VISIBLE' }).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 30, 60)).lean();
  return posts.map(publicPost);
}

/** A care shop's posts: its owner's and its team members'. */
async function listByStore(storeId, { limit = 30 } = {}) {
  if (!mongoose.isValidObjectId(storeId)) throw new NotFoundError('Shop', storeId);
  const store = await CareStore.findById(storeId).select('owner members.user status').lean();
  if (!store) throw new NotFoundError('Shop', storeId);
  const people = [store.owner, ...(store.members || []).map((m) => m.user)].filter(Boolean);
  const active = await User.find({ _id: { $in: people }, isActive: { $ne: false } }).select('_id').lean();
  const posts = await PartnerPost.find({ author: { $in: active.map((u) => u._id) }, status: 'VISIBLE' })
    .sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 30, 60)).lean();
  return posts.map(publicPost);
}

/** Who may open a post's file: anyone for visible posts; the author and admins for hidden ones. */
async function mediaLink(postId, viewer) {
  if (!mongoose.isValidObjectId(postId)) return null;
  const post = await PartnerPost.findById(postId).lean();
  if (!post) return null;
  if (post.status !== 'VISIBLE') {
    const own = viewer && String(viewer._id) === String(post.author);
    const admin = viewer && ['admin', 'platform_admin'].includes(viewer.role);
    if (!own && !admin) return null;
  }
  return { key: post.key, mime: post.mime };
}

/** The author's own file, whatever its status. */
async function ownMediaLink(postId, userId) {
  if (!mongoose.isValidObjectId(postId)) return null;
  const post = await PartnerPost.findOne({ _id: postId, author: userId }).select('key mime').lean();
  return post ? { key: post.key, mime: post.mime } : null;
}

async function adminList({ status, limit = 50 } = {}) {
  const filter = status && ['VISIBLE', 'HIDDEN'].includes(status) ? { status } : {};
  const posts = await PartnerPost.find(filter).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 50, 200))
    .populate('author', 'name role').lean();
  return posts.map((p) => ({ ...publicPost(p), status: p.status, hiddenReason: p.hiddenReason, size: p.size, author: p.author }));
}

async function adminSetHidden(postId, adminId, { hidden, reason }) {
  if (!mongoose.isValidObjectId(postId)) throw new NotFoundError('Post', postId);
  const update = hidden
    ? { $set: { status: 'HIDDEN', hiddenReason: String(reason || 'Hidden by Nabz').slice(0, 200), hiddenBy: adminId, hiddenAt: new Date() } }
    : { $set: { status: 'VISIBLE' }, $unset: { hiddenReason: 1, hiddenBy: 1, hiddenAt: 1 } };
  const post = await PartnerPost.findByIdAndUpdate(postId, update, { new: true }).lean();
  if (!post) throw new NotFoundError('Post', postId);
  logger.info('Partner post moderated', { postId: String(postId), adminId: String(adminId), hidden: !!hidden });
  return { ...publicPost(post), status: post.status };
}

module.exports = {
  create, createUploadUrl, completeUpload, listMine, remove, listByAuthor, listByStore, mediaLink, ownMediaLink, adminList, adminSetHidden,
  isPartner, MAX_UPLOAD_BYTES, TYPES, PARTNER_ROLES
};
