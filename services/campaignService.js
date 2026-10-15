/**
 * Offer / announcement campaigns run from the admin panel.
 *
 * - Admin creates a campaign for an audience, now or scheduled, with an expiry.
 * - Customers and partners read live ones in their feed (app + website).
 * - If push is requested, the scheduled tick sends it once at `sendAt` to
 *   everyone in the audience who hasn't turned push off.
 */

const mongoose = require('mongoose');
const Campaign = require('../models/campaign');
const MobileDevice = require('../models/mobileDevice');
const Patient = require('../models/patient');
const User = require('../models/user');
const { ValidationError, NotFoundError } = require('../utils/errors');
const logger = require('../utils/logger');

const STAFF_ROLES = ['nurse', 'physiotherapist', 'medical_staff'];
const PARTNER_ROLES = [...STAFF_ROLES, 'pharmacy_vendor', 'phlebotomist', 'lab_partner', 'delivery_partner'];
const MAX_DAYS = 60;

/** Which campaign audiences a signed-in account belongs to. */
function audiencesFor(kind, role) {
  if (kind === 'patient') return ['CUSTOMERS'];
  const out = [];
  if (PARTNER_ROLES.includes(role)) out.push('PARTNERS');
  if (STAFF_ROLES.includes(role)) out.push('MEDICAL_STAFF');
  if (role === 'pharmacy_vendor') out.push('PHARMACIES');
  return out;
}

function statusOf(c, now = new Date()) {
  if (c.cancelledAt) return 'CANCELLED';
  if (new Date(c.sendAt) > now) return 'SCHEDULED';
  if (new Date(c.expiresAt) <= now) return 'ENDED';
  return 'LIVE';
}

function toAdmin(c, now = new Date()) {
  const o = typeof c.toObject === 'function' ? c.toObject() : c;
  return { ...o, status: statusOf(o, now) };
}

function toFeed(c) {
  return {
    _id: String(c._id),
    title: c.title,
    body: c.body,
    cta: c.cta && c.cta.path ? { label: c.cta.label || 'Open', path: c.cta.path } : null,
    offerCode: c.offerCode || null,
    sendAt: c.sendAt,
    expiresAt: c.expiresAt
  };
}

async function create(input, adminId, now = new Date()) {
  const sendAt = input.sendAt ? new Date(input.sendAt) : now;
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : new Date(sendAt.getTime() + 7 * 86400000);
  if (Number.isNaN(sendAt.getTime()) || Number.isNaN(expiresAt.getTime())) throw new ValidationError('Invalid date');
  if (sendAt < new Date(now.getTime() - 60000)) throw new ValidationError('Send time is in the past');
  if (expiresAt <= sendAt) throw new ValidationError('The campaign must end after it starts');
  if (expiresAt - sendAt > MAX_DAYS * 86400000) throw new ValidationError(`A campaign can run for at most ${MAX_DAYS} days`);
  if (input.cta && input.cta.path && !/^\/(?!\/)/.test(input.cta.path)) throw new ValidationError('The button must link to a page inside Nabz');
  const campaign = await Campaign.create({
    title: input.title,
    body: input.body,
    cta: input.cta && input.cta.path ? { label: input.cta.label || 'Open', path: input.cta.path } : undefined,
    offerCode: input.offerCode || undefined,
    audience: input.audience,
    sendAt,
    expiresAt,
    push: { status: input.push ? 'PENDING' : 'OFF' },
    createdBy: adminId
  });
  return toAdmin(campaign, now);
}

async function list({ limit = 50 } = {}, now = new Date()) {
  const rows = await Campaign.find({}).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 50, 200)).lean();
  return rows.map((c) => toAdmin(c, now));
}

async function cancel(id, adminId) {
  const c = await Campaign.findOneAndUpdate(
    { _id: id, cancelledAt: null },
    { $set: { cancelledAt: new Date(), cancelledBy: adminId } },
    { new: true }
  );
  if (!c) throw new NotFoundError('Campaign not found or already cancelled');
  // A push that hasn't gone out yet never will.
  await Campaign.updateOne({ _id: id, 'push.status': 'PENDING' }, { $set: { 'push.status': 'SKIPPED', 'push.note': 'Cancelled before sending' } });
  return toAdmin(await Campaign.findById(id).lean());
}

/** Live campaigns for a signed-in customer or partner, newest first. */
async function feed(kind, role, now = new Date()) {
  const audiences = audiencesFor(kind, role);
  if (!audiences.length) return [];
  const rows = await Campaign.find({
    audience: { $in: audiences },
    cancelledAt: null,
    sendAt: { $lte: now },
    expiresAt: { $gt: now }
  }).sort({ sendAt: -1 }).limit(20).lean();
  return rows.map(toFeed);
}

async function recordOpen(id) {
  if (!mongoose.isValidObjectId(id)) return;
  await Campaign.updateOne({ _id: id, cancelledAt: null }, { $inc: { opens: 1 } });
}

/** Device tokens for everyone in the audience who allows push. */
async function audienceTokens(audience) {
  let owners;
  let ownerType;
  if (audience === 'CUSTOMERS') {
    ownerType = 'patient';
    owners = await Patient.find({ isActive: { $ne: false }, 'preferences.notificationChannels.push': { $ne: false } }).distinct('_id');
  } else {
    ownerType = 'provider';
    const roles = audience === 'MEDICAL_STAFF' ? STAFF_ROLES : audience === 'PHARMACIES' ? ['pharmacy_vendor'] : PARTNER_ROLES;
    owners = await User.find({ role: { $in: roles }, isActive: { $ne: false }, 'notificationSettings.push': { $ne: false } }).distinct('_id');
  }
  if (!owners.length) return [];
  return MobileDevice.find({ owner: { $in: owners }, ownerType, enabled: true }).distinct('token');
}

/** Tick step: send due pushes once. Claims each campaign before sending. */
async function sendDuePushes(now = new Date(), deps = {}) {
  const push = deps.push || require('./pushNotificationService');
  const due = await Campaign.find({ 'push.status': 'PENDING', cancelledAt: null, sendAt: { $lte: now }, expiresAt: { $gt: now } }).select('_id').limit(5).lean();
  let sent = 0;
  for (const { _id } of due) {
    const c = await Campaign.findOneAndUpdate({ _id, 'push.status': 'PENDING' }, { $set: { 'push.status': 'SENDING' } }, { new: true });
    if (!c) continue;
    try {
      const tokens = await audienceTokens(c.audience);
      const result = await push.sendToTokens({ tokens, title: c.title, body: c.body, data: { campaignId: String(c._id), path: c.cta?.path || '' } });
      const status = result.disabled ? 'SKIPPED' : 'DONE';
      await Campaign.updateOne({ _id }, { $set: {
        'push.status': status,
        'push.targeted': tokens.length,
        'push.sent': result.sentCount,
        'push.failed': result.failedCount,
        'push.note': result.disabled ? 'Server push is off (Firebase not configured). Shown in the in-app feed only.' : (tokens.length ? undefined : 'No devices in this audience yet'),
        'push.doneAt': new Date()
      } });
      sent += result.sentCount;
    } catch (err) {
      logger.error('Campaign push failed', { campaignId: String(_id), error: err.message });
      await Campaign.updateOne({ _id }, { $set: { 'push.status': 'FAILED', 'push.note': String(err.message).slice(0, 200), 'push.doneAt': new Date() } });
    }
  }
  return { campaigns: due.length, sent };
}

module.exports = { create, list, cancel, feed, recordOpen, sendDuePushes, audiencesFor, statusOf, AUDIENCES: Campaign.AUDIENCES };
