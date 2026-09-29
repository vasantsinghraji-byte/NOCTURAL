/**
 * Partner verification: which documents each partner needs, uploads, admin
 * review, expiry, and keeping the staff trust badges in step.
 *
 * - A new upload is PENDING until an admin approves it. An approved document
 *   stays valid while its replacement is reviewed, so renewing a licence never
 *   takes anyone offline.
 * - Badges (careProfile.verification) follow the documents once a partner has
 *   any document for that badge; older manually-ticked badges are left alone.
 * - An approved document that passes its expiry date becomes EXPIRED: the
 *   badge drops (staff go offline, upcoming visits are reassigned) and a
 *   pharmacy with no valid drug licence is suspended.
 */

const mongoose = require('mongoose');
const PartnerDocument = require('../models/partnerDocument');
const User = require('../models/user');
const { KINDS, REQUIREMENTS, EXPIRY_REMINDER_DAYS } = require('../config/partnerDocuments');
const { ValidationError, NotFoundError, ConflictError } = require('../utils/errors');
const logger = require('../utils/logger');

const STAFF_ROLES = ['nurse', 'physiotherapist', 'medical_staff'];
const FLAGS = ['id', 'police', 'council', 'vaccinated'];
const DAY = 86400000;
// Documents that let someone into a patient's home. With VERIFICATION_TWO_PERSON=true
// two different admins must approve them (turn on once there are two admins).
const HOME_ACCESS_ROLES = [...STAFF_ROLES, 'phlebotomist', 'delivery_partner'];
const CORE_KINDS = ['AADHAAR', 'POLICE_CHECK', 'NURSING_REGISTRATION', 'NURSING_QUALIFICATION', 'PHYSIO_DEGREE', 'QUALIFICATION', 'PHLEBOTOMY_CERTIFICATE', 'DRIVING_LICENCE'];
const twoPersonRule = () => process.env.VERIFICATION_TWO_PERSON === 'true';

const requirementsFor = (role) => REQUIREMENTS[role] || [];
const isValid = (d, now = new Date()) => d && d.status === 'APPROVED' && (!d.expiresAt || new Date(d.expiresAt) > now);

function notify(userId, type, title, message) {
  return require('./notificationService').createNotification({
    user: userId, recipientModel: 'User', type, title, message, actionUrl: '/partner/verification', priority: 'HIGH', channels: { inApp: true }
  }).catch((err) => logger.warn('Verification notification failed', { error: err.message }));
}

function publicDoc(d) {
  if (!d) return null;
  return {
    _id: String(d._id),
    kind: d.kind,
    status: d.status,
    source: d.source,
    number: d.number || null,
    expiresAt: d.expiresAt || null,
    uploadedAt: d.createdAt,
    note: d.review?.note || null,
    fileName: d.file?.originalName || null,
    awaitingSecondApproval: d.status === 'PENDING' && !!d.review?.firstBy,
    digilocker: d.digilocker?.name ? { name: d.digilocker.name, dob: d.digilocker.dob, nameMatches: d.digilocker.nameMatches } : null
  };
}

async function currentDocs(userId) {
  return PartnerDocument.find({ user: userId, superseded: false }).sort({ createdAt: -1 }).lean();
}

/** Checklist for a partner: each required document with its latest status. */
async function getStatus(userId, now = new Date()) {
  const user = await User.findById(userId).select('role name').lean();
  if (!user) throw new NotFoundError('Partner not found');
  const docs = await currentDocs(userId);
  const items = requirementsFor(user.role).map((kind) => {
    const mine = docs.filter((d) => d.kind === kind);
    const valid = mine.find((d) => isValid(d, now));
    const latest = mine[0] || null;
    const cfg = KINDS[kind];
    const soon = valid?.expiresAt && new Date(valid.expiresAt) - now < EXPIRY_REMINDER_DAYS * DAY;
    return {
      kind,
      label: cfg.label,
      hint: cfg.hint || null,
      numberLabel: cfg.numberLabel || null,
      hasExpiry: !!cfg.hasExpiry,
      optional: !!cfg.optional,
      digilocker: !!cfg.digilocker,
      state: valid ? (soon ? 'EXPIRING' : 'VERIFIED') : latest ? latest.status : 'MISSING',
      valid: publicDoc(valid),
      latest: publicDoc(latest)
    };
  });
  const required = items.filter((i) => !i.optional);
  return {
    role: user.role,
    complete: required.length > 0 && required.every((i) => i.state === 'VERIFIED' || i.state === 'EXPIRING'),
    missing: required.filter((i) => i.state === 'MISSING' || i.state === 'REJECTED' || i.state === 'EXPIRED').length,
    inReview: items.filter((i) => i.latest && i.latest.status === 'PENDING').length,
    items,
    digilocker: { available: require('./digilockerService').isConfigured() }
  };
}

function parseExpiry(value, now = new Date()) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new ValidationError('Invalid expiry date');
  if (d <= now) throw new ValidationError('This document has already expired. Upload a valid one.');
  if (d - now > 30 * 365 * DAY) throw new ValidationError('Check the expiry date');
  return d;
}

/** A partner uploads (or re-uploads) one document. `file` comes from storage (toStoredFile). */
async function submitDocument(userId, { kind, number, expiresAt }, file, now = new Date()) {
  const user = await User.findById(userId).select('role').lean();
  if (!user) throw new NotFoundError('Partner not found');
  if (!requirementsFor(user.role).includes(kind)) throw new ValidationError('This document isn’t needed for your partner type');
  const cfg = KINDS[kind];
  if (!file || !file.key) throw new ValidationError('Attach a photo or PDF of the document');
  const num = String(number || '').trim().toUpperCase();
  // WARNING: never accept a full Aadhaar number. Only the last 4 digits are kept.
  if (kind === 'AADHAAR' && /\d{8,}/.test(num.replace(/\s/g, ''))) throw new ValidationError('Enter only the last 4 digits of Aadhaar, and upload a masked copy');
  if (cfg.numberLabel && !cfg.optional && !num) throw new ValidationError(`Enter the ${cfg.numberLabel.toLowerCase()}`);
  if (num && cfg.numberPattern && !cfg.numberPattern.test(num)) throw new ValidationError(`Check the ${(cfg.numberLabel || 'number').toLowerCase()}`);
  const expiry = parseExpiry(expiresAt, now);
  if (cfg.hasExpiry && !expiry) throw new ValidationError('Enter the date this document expires');

  // Replace an earlier upload that is still waiting (or was rejected); keep approved ones.
  await PartnerDocument.updateMany({ user: userId, kind, superseded: false, status: { $in: ['PENDING', 'REJECTED'] } }, { $set: { superseded: true } });
  const doc = await PartnerDocument.create({
    user: userId,
    kind,
    source: 'UPLOAD',
    number: num || undefined,
    expiresAt: expiry || undefined,
    file: { key: file.key, mimeType: file.mimeType, size: file.size, originalName: String(file.originalName || '').slice(0, 200) }
  });
  return publicDoc(doc);
}

/** Recompute trust badges from documents, only for badges that have documents. */
async function syncFlags(userId, actorId = null, now = new Date()) {
  const user = await User.findById(userId).select('role careProfile.verification').lean();
  if (!user || !STAFF_ROLES.includes(user.role)) return { changed: false };
  const docs = await currentDocs(userId);
  const kinds = requirementsFor(user.role);
  const current = user.careProfile?.verification || {};
  const currentByFlag = { id: !!current.idVerified, police: !!current.policeVerified, council: !!current.councilVerified, vaccinated: !!current.vaccinated };
  const update = {};
  for (const flag of FLAGS) {
    const flagKinds = kinds.filter((k) => KINDS[k].flag === flag && !(KINDS[k].optional && flag !== 'vaccinated'));
    if (!flagKinds.length || !docs.some((d) => flagKinds.includes(d.kind))) continue;
    const ok = flagKinds.every((k) => docs.some((d) => d.kind === k && isValid(d, now)));
    if (ok !== currentByFlag[flag]) update[flag] = ok;
  }
  if (!Object.keys(update).length) return { changed: false };
  const result = await require('./staffDashboardService').setVerification(userId, actorId, update);
  return { changed: true, flags: update, releasedVisits: result.releasedVisits };
}

/** Admin decision on a pending document. Route requires a fresh 2FA code; audited there. */
async function review(docId, adminId, { decision, note, expiresAt }, now = new Date()) {
  if (!mongoose.isValidObjectId(docId)) throw new NotFoundError('Document not found');
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw new ValidationError('Approve or reject');
  const reason = String(note || '').trim().slice(0, 300);
  if (decision === 'REJECTED' && reason.length < 3) throw new ValidationError('Tell the partner why it was rejected');
  const set = { status: decision, 'review.by': adminId, 'review.at': now, 'review.note': reason || undefined, 'review.auto': false };
  if (decision === 'APPROVED' && expiresAt) set.expiresAt = parseExpiry(expiresAt, now);
  if (decision === 'APPROVED' && twoPersonRule()) {
    const pending = await PartnerDocument.findOne({ _id: docId, status: 'PENDING', superseded: false }).populate('user', 'role').lean();
    if (pending && CORE_KINDS.includes(pending.kind) && HOME_ACCESS_ROLES.includes(pending.user?.role)) {
      if (!pending.review?.firstBy) {
        await PartnerDocument.updateOne({ _id: docId, status: 'PENDING', 'review.firstBy': null }, { $set: { 'review.firstBy': adminId, 'review.firstAt': now, ...(set.expiresAt ? { expiresAt: set.expiresAt } : {}) } });
        return { document: publicDoc({ ...pending, review: { note: 'First approval recorded' } }), awaitingSecondApproval: true };
      }
      if (String(pending.review.firstBy) === String(adminId)) throw new ValidationError('A second admin must give the final approval');
    }
  }
  const doc = await PartnerDocument.findOneAndUpdate({ _id: docId, status: 'PENDING', superseded: false }, { $set: set }, { new: true });
  if (!doc) throw new ConflictError('This document was already reviewed or replaced');
  if (decision === 'APPROVED') {
    const cfg = KINDS[doc.kind];
    if (cfg.hasExpiry && !doc.expiresAt) {
      await PartnerDocument.updateOne({ _id: doc._id }, { $set: { status: 'PENDING' }, $unset: { review: 1 } });
      throw new ValidationError('Enter the expiry date shown on the document before approving');
    }
    await PartnerDocument.updateMany({ user: doc.user, kind: doc.kind, _id: { $ne: doc._id }, superseded: false }, { $set: { superseded: true } });
  }
  const sync = await syncFlags(doc.user, adminId, now);
  const label = KINDS[doc.kind].label;
  await notify(doc.user, decision === 'APPROVED' ? 'DOCUMENT_VERIFIED' : 'DOCUMENT_REJECTED',
    decision === 'APPROVED' ? `${label} verified` : `${label} needs another look`,
    decision === 'APPROVED' ? 'Thanks. Your document is verified.' : `Reason: ${reason}. Please upload it again.`);
  return { document: publicDoc(doc.toObject()), sync };
}

/** Documents waiting for review (oldest first), with who sent them. */
async function reviewQueue({ status = 'PENDING', limit = 100 } = {}) {
  const filter = { superseded: false };
  if (status !== 'ALL') filter.status = status;
  const rows = await PartnerDocument.find(filter)
    .sort({ createdAt: status === 'PENDING' ? 1 : -1 })
    .limit(Math.min(Number(limit) || 100, 300))
    .populate('user', 'name role')
    .lean();
  return rows.map((d) => ({
    ...publicDoc(d),
    label: KINDS[d.kind]?.label || d.kind,
    hasExpiry: !!KINDS[d.kind]?.hasExpiry,
    mimeType: d.file?.mimeType || null,
    user: d.user ? { _id: String(d.user._id), name: d.user.name, role: d.user.role } : null
  }));
}

/** Short-lived link to view a document file (admin; audited by the route). */
async function fileFor(docId) {
  if (!mongoose.isValidObjectId(docId)) throw new NotFoundError('Document not found');
  const doc = await PartnerDocument.findById(docId).select('file user kind').lean();
  if (!doc || !doc.file?.key) throw new NotFoundError('This document has no file (it came from DigiLocker)');
  return doc;
}

/** Tick step: expire documents, then reminders before expiry. */
async function sweepExpiry(now = new Date()) {
  const expired = await PartnerDocument.find({ status: 'APPROVED', superseded: false, expiresAt: { $lte: now } }).select('_id user kind').lean();
  const users = new Set();
  for (const d of expired) {
    const r = await PartnerDocument.updateOne({ _id: d._id, status: 'APPROVED' }, { $set: { status: 'EXPIRED' } });
    if (!r.modifiedCount) continue;
    users.add(String(d.user));
    await notify(d.user, 'PROFILE_INCOMPLETE', `${KINDS[d.kind].label} has expired`, 'Upload the renewed document to keep working on Nabz.');
    if (d.kind === 'DRUG_LICENCE') await suspendStoreWithoutLicence(d.user, now);
  }
  for (const u of users) await syncFlags(u, null, now);

  const soon = await PartnerDocument.find({
    status: 'APPROVED', superseded: false, reminderSentAt: null,
    expiresAt: { $gt: now, $lte: new Date(now.getTime() + EXPIRY_REMINDER_DAYS * DAY) }
  }).select('_id user kind expiresAt').limit(200).lean();
  for (const d of soon) {
    const r = await PartnerDocument.updateOne({ _id: d._id, reminderSentAt: null }, { $set: { reminderSentAt: now } });
    if (!r.modifiedCount) continue;
    const days = Math.max(1, Math.ceil((new Date(d.expiresAt) - now) / DAY));
    await notify(d.user, 'PROFILE_INCOMPLETE', `${KINDS[d.kind].label} expires in ${days} day${days === 1 ? '' : 's'}`, 'Upload the renewed document now so you can keep working without a break.');
  }
  return { expired: expired.length, reminded: soon.length };
}

async function suspendStoreWithoutLicence(userId, now) {
  const user = await User.findById(userId).select('pharmacyVendor').lean();
  if (!user?.pharmacyVendor) return;
  const valid = await PartnerDocument.exists({ user: userId, kind: 'DRUG_LICENCE', status: 'APPROVED', superseded: false, expiresAt: { $gt: now } });
  if (valid) return;
  const PharmacyVendor = require('../models/pharmacyVendor');
  await PharmacyVendor.updateOne({ _id: user.pharmacyVendor, status: 'APPROVED' }, { $set: { status: 'SUSPENDED', isOpen: false } });
  logger.warn('Pharmacy suspended: drug licence expired', { vendorId: String(user.pharmacyVendor) });
}

/** Aadhaar from DigiLocker: approved automatically when the name matches the account. */
async function recordDigilockerAadhaar(userId, { name, dob, gender, last4 }, now = new Date()) {
  const user = await User.findById(userId).select('name role').lean();
  if (!user) throw new NotFoundError('Partner not found');
  const nameMatches = namesMatch(user.name, name);
  await PartnerDocument.updateMany({ user: userId, kind: 'AADHAAR', superseded: false }, { $set: { superseded: true } });
  const doc = await PartnerDocument.create({
    user: userId,
    kind: 'AADHAAR',
    source: 'DIGILOCKER',
    status: nameMatches ? 'APPROVED' : 'PENDING',
    number: last4 && /^\d{4}$/.test(last4) ? last4 : undefined,
    digilocker: { name: String(name || '').slice(0, 120), dob: String(dob || '').slice(0, 20), gender: String(gender || '').slice(0, 10), nameMatches, fetchedAt: now },
    review: nameMatches ? { at: now, auto: true, note: 'Verified by DigiLocker' } : { note: 'Name on Aadhaar differs from the account name' }
  });
  if (nameMatches) await syncFlags(userId, null, now);
  return publicDoc(doc.toObject());
}

/** Lenient name comparison: every word of the shorter name appears in the longer one. */
function namesMatch(a, b) {
  const words = (s) => String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1);
  const x = words(a);
  const y = words(b);
  if (!x.length || !y.length) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.every((w) => long.includes(w));
}

module.exports = {
  requirementsFor,
  getStatus,
  submitDocument,
  review,
  reviewQueue,
  fileFor,
  syncFlags,
  sweepExpiry,
  recordDigilockerAadhaar,
  namesMatch
};
