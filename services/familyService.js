/**
 * Care Circle: family members who help manage someone's care.
 *
 *   helper  invites by phone   → link PENDING
 *   member  accepts / declines → ACTIVE / DECLINED
 *   either  removes            → REMOVED
 *
 * An active helper sees the member's upcoming visits, plans and lab bookings
 * (not lab reports), gets the member's visit and order updates, and books
 * for them from their own account ("someone else").
 */
const FamilyLink = require('../models/familyLink');
const Patient = require('../models/patient');
const { NotFoundError, ValidationError, ConflictError, AuthorizationError } = require('../utils/errors');
const logger = require('../utils/logger');

const MAX_LINKS = 6;
const FANOUT_TYPES = new Set(['CARE_VISIT_UPDATE', 'PHARMACY_ORDER_UPDATE']);
const first = (name) => String(name || '').trim().split(/\s+/)[0] || 'Your family member';

async function notify(patientId, title, message, metadata = {}) {
  try {
    const Notification = require('../models/notification');
    await Notification.create({
      user: patientId, recipientModel: 'Patient', type: 'SYSTEM_ANNOUNCEMENT', priority: 'MEDIUM', title, message,
      channels: { inApp: true, push: true }, metadata: { ...metadata, family: true }, expiresAt: new Date(Date.now() + 14 * 86400000)
    });
    await require('./pushNotificationService').sendToOwner({ owner: patientId, userType: 'patient', title, body: message, data: { type: 'FAMILY', ...metadata } }).catch(() => undefined);
  } catch (err) {
    logger.warn('Family notice failed', { error: err.message });
  }
}

const view = (l, me) => {
  const helperSide = String(l.helper && (l.helper._id || l.helper)) === String(me);
  const other = helperSide ? l.member : l.helper;
  return {
    _id: l._id,
    role: helperSide ? 'HELPER' : 'MEMBER', // my side of the link
    status: l.status,
    relation: l.relation,
    person: other && other._id ? { _id: other._id, name: other.name } : null,
    createdAt: l.createdAt
  };
};

async function listMine(patientId) {
  const links = await FamilyLink.find({ $or: [{ helper: patientId }, { member: patientId }], status: { $in: ['PENDING', 'ACTIVE'] } })
    .populate('helper', 'name').populate('member', 'name').sort({ createdAt: -1 }).lean();
  const all = links.map((l) => view(l, patientId));
  return {
    members: all.filter((l) => l.role === 'HELPER'), // people I help
    helpers: all.filter((l) => l.role === 'MEMBER' && l.status === 'ACTIVE'), // people helping me
    invites: all.filter((l) => l.role === 'MEMBER' && l.status === 'PENDING') // waiting for my answer
  };
}

async function invite(helperId, { phone, relation } = {}) {
  const digits = String(phone || '').replace(/\D/g, '').slice(-10);
  if (!/^[6-9]\d{9}$/.test(digits)) throw new ValidationError('Enter their 10-digit mobile number');
  const member = await Patient.findOne({ phone: digits }).select('name').lean();
  if (!member) {
    const e = new ValidationError('No Nabz account uses this number. Ask them to sign up, or book for them as “someone else”.');
    e.code = 'NO_ACCOUNT';
    throw e;
  }
  if (String(member._id) === String(helperId)) throw new ValidationError('That’s your own number');
  if (await FamilyLink.countDocuments({ helper: helperId, status: { $in: ['PENDING', 'ACTIVE'] } }) >= MAX_LINKS) {
    throw new ValidationError(`You can help up to ${MAX_LINKS} people`);
  }
  try {
    const link = await FamilyLink.create({ helper: helperId, member: member._id, relation: relation ? String(relation).slice(0, 40) : undefined });
    const helper = await Patient.findById(helperId).select('name').lean();
    notify(member._id, `${first(helper && helper.name)} wants to help with your care`, 'Open Nabz to allow it. They will see your visits and can book for you. Your lab reports stay private.', { linkId: String(link._id) });
    return view({ ...link.toObject(), member }, helperId);
  } catch (err) {
    if (err && err.code === 11000) throw new ConflictError('You have already invited this person');
    throw err;
  }
}

async function respond(memberId, linkId, accept) {
  const link = await FamilyLink.findOneAndUpdate(
    { _id: linkId, member: memberId, status: 'PENDING' },
    { $set: { status: accept ? 'ACTIVE' : 'DECLINED', respondedAt: new Date() } },
    { returnDocument: 'after' }
  ).populate('helper', 'name').populate('member', 'name').lean();
  if (!link) throw new NotFoundError('Invitation');
  notify(link.helper._id, accept ? `${first(link.member.name)} accepted` : `${first(link.member.name)} declined`,
    accept ? 'You can now see their visits and book for them.' : 'You can still book for them as “someone else”.', { linkId: String(link._id) });
  return view(link, memberId);
}

async function remove(patientId, linkId) {
  const link = await FamilyLink.findOneAndUpdate(
    { _id: linkId, $or: [{ helper: patientId }, { member: patientId }], status: { $in: ['PENDING', 'ACTIVE'] } },
    { $set: { status: 'REMOVED', removedBy: patientId } },
    { returnDocument: 'after' }
  ).lean();
  if (!link) throw new NotFoundError('Link');
  return { removed: true };
}

/** True when `viewerId` is the patient or an active helper of the patient. */
async function canSee(viewerId, patientId) {
  if (String(viewerId) === String(patientId)) return true;
  return Boolean(await FamilyLink.exists({ helper: viewerId, member: patientId, status: 'ACTIVE' }));
}

/** A member's care as their helper sees it: what's coming up and what's running. */
async function memberCare(helperId, memberId) {
  if (String(helperId) === String(memberId) || !(await canSee(helperId, memberId))) throw new AuthorizationError('Ask them to accept your Care Circle invitation first');
  const NurseBooking = require('../models/nurseBooking');
  const CarePlan = require('../models/carePlan');
  const LabOrder = require('../models/labOrder');
  const [member, visits, plans, labs] = await Promise.all([
    Patient.findById(memberId).select('name').lean(),
    NurseBooking.find({ patient: memberId, status: { $in: ['REQUESTED', 'ASSIGNED', 'CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED'] } })
      .sort({ scheduledDate: -1, scheduledTime: -1 }).limit(12).populate('serviceProvider', 'name').lean(),
    CarePlan.find({ patient: memberId, status: { $in: ['ACTIVE', 'PENDING_PAYMENT'] } }).populate('store', 'name').sort({ createdAt: -1 }).limit(5).lean(),
    LabOrder.find({ patient: memberId, status: { $ne: 'CANCELLED' } }).populate('store', 'name').sort({ createdAt: -1 }).limit(5).lean()
  ]);
  if (!member) throw new NotFoundError('Member');
  return {
    member: { _id: member._id, name: member.name },
    visits: visits.map((v) => ({
      _id: v._id, serviceType: v.serviceType, status: v.status, scheduledDate: v.scheduledDate, scheduledTime: v.scheduledTime,
      professional: v.serviceProvider && v.serviceProvider.name, planId: v.marketplace && v.marketplace.plan
    })),
    plans: plans.map((p) => ({ _id: p._id, serviceName: p.serviceName, store: p.store && p.store.name, status: p.status, sessionsTotal: p.sessionsTotal, sessionsCompleted: p.sessionsCompleted })),
    labOrders: labs.map((o) => ({ _id: o._id, lab: o.store && o.store.name, tests: (o.items || []).map((i) => i.name), status: o.status, slot: o.slot }))
  };
}

/**
 * Called after a customer gets a visit or order update: the same update goes
 * to everyone actively helping them. Never throws; never loops (copies are
 * marked as family notices).
 */
async function fanOut(notification) {
  try {
    if (!notification || notification.recipientModel !== 'Patient' || !FANOUT_TYPES.has(notification.type)) return 0;
    if (notification.metadata && notification.metadata.family) return 0;
    const links = await FamilyLink.find({ member: notification.user, status: 'ACTIVE' }).select('helper').lean();
    if (!links.length) return 0;
    const member = await Patient.findById(notification.user).select('name').lean();
    const name = first(member && member.name);
    const Notification = require('../models/notification');
    const push = require('./pushNotificationService');
    for (const l of links) {
      await Notification.create({
        user: l.helper, recipientModel: 'Patient', type: notification.type, priority: notification.priority || 'MEDIUM',
        title: `${name}: ${notification.title}`, message: notification.message,
        channels: { inApp: true, push: true }, metadata: { ...(notification.metadata || {}), family: true, memberId: String(notification.user) },
        expiresAt: notification.expiresAt
      });
      await push.sendToOwner({ owner: l.helper, userType: 'patient', title: `${name}: ${notification.title}`, body: notification.message, data: { type: notification.type, memberId: String(notification.user) } }).catch(() => undefined);
    }
    return links.length;
  } catch (err) {
    logger.warn('Family fan-out failed', { error: err.message });
    return 0;
  }
}

module.exports = { listMine, invite, respond, remove, canSee, memberCare, fanOut, MAX_LINKS };
