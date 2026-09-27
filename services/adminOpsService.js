/**
 * Admin panel operations: user database, contact reveal, suspend, verification
 * queue and the payment log.
 *
 * Personal data is masked by default. Seeing a full email / phone number, and
 * suspending an account, need a fresh 2-step code (route level) and are written
 * to the security audit log here.
 */

const mongoose = require('mongoose');
const Patient = require('../models/patient');
const User = require('../models/user');
const NurseBooking = require('../models/nurseBooking');
const PharmacyOrder = require('../models/pharmacyOrder');
const Membership = require('../models/membership');
const WithdrawalRequest = require('../models/withdrawalRequest');
const securityAuditService = require('./securityAuditService');
const { escapeRegExp } = require('../utils/safeMongo');
const { maskEmail, maskPhone } = require('../utils/logRedaction');
const { ValidationError, NotFoundError } = require('../utils/errors');

const STAFF_ROLES = ['nurse', 'physiotherapist', 'medical_staff'];
const PARTNER_ROLES = [...STAFF_ROLES, 'pharmacy_vendor', 'phlebotomist', 'lab_partner', 'delivery_partner'];
const TYPES = ['customers', 'partners'];

function modelFor(type) {
  if (type === 'customers') return Patient;
  if (type === 'partners') return User;
  throw new ValidationError('Unknown user type');
}

function baseFilter(type) {
  return type === 'partners' ? { role: { $in: PARTNER_ROLES } } : {};
}

function searchFilter(q) {
  const text = String(q || '').trim().slice(0, 80);
  if (!text) return {};
  if (mongoose.isValidObjectId(text)) return { _id: text };
  if (text.includes('@')) return { email: text.toLowerCase() };
  const digits = text.replace(/\D/g, '');
  if (digits.length >= 6 && digits.length === text.replace(/[\s+-]/g, '').length) {
    return { phone: new RegExp(`${escapeRegExp(digits.slice(-10))}$`) };
  }
  return { name: new RegExp(escapeRegExp(text), 'i') };
}

function verificationOf(u) {
  const v = u.careProfile?.verification || {};
  return { id: !!v.idVerified, police: !!v.policeVerified, council: !!v.councilVerified, vaccinated: !!v.vaccinated, verifiedAt: v.verifiedAt || null };
}

function toRow(type, u) {
  const row = {
    _id: String(u._id),
    type,
    name: u.name,
    email: maskEmail(u.email),
    phone: maskPhone(u.phone),
    active: u.isActive !== false,
    joinedAt: u.createdAt
  };
  if (type === 'customers') {
    return { ...row, city: u.address?.city || null, phoneVerified: !!u.phoneVerified, bookings: u.totalBookings || 0 };
  }
  return {
    ...row,
    role: u.role,
    online: !!u.isOnline,
    ...(STAFF_ROLES.includes(u.role) ? { verification: verificationOf(u) } : {}),
    rating: u.rating || null
  };
}

async function listUsers({ type = 'customers', q, role, active, page = 1, limit = 25 } = {}) {
  const Model = modelFor(type);
  const filter = { ...baseFilter(type), ...searchFilter(q) };
  if (type === 'partners' && role && PARTNER_ROLES.includes(role)) filter.role = role;
  if (active === 'true' || active === true) filter.isActive = { $ne: false };
  if (active === 'false' || active === false) filter.isActive = false;
  const size = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * size;
  const select = type === 'customers'
    ? 'name email phone isActive createdAt totalBookings address.city phoneVerified'
    : 'name email phone role isActive isOnline createdAt rating careProfile.verification';
  const [rows, total] = await Promise.all([
    Model.find(filter).select(select).sort({ createdAt: -1 }).skip(skip).limit(size).lean(),
    Model.countDocuments(filter)
  ]);
  return { users: rows.map((u) => toRow(type, u)), total, page: Math.floor(skip / size) + 1, pages: Math.max(1, Math.ceil(total / size)) };
}

async function findUser(type, id) {
  if (!TYPES.includes(type) || !mongoose.isValidObjectId(id)) throw new NotFoundError('User not found');
  const u = await modelFor(type).findOne({ _id: id, ...baseFilter(type) }).lean();
  if (!u) throw new NotFoundError('User not found');
  return u;
}

async function getUser(type, id) {
  const u = await findUser(type, id);
  const row = toRow(type, u);
  if (type === 'customers') {
    const [visits, orders, membership] = await Promise.all([
      NurseBooking.countDocuments({ patient: u._id }),
      PharmacyOrder.countDocuments({ patient: u._id }),
      Membership.findOne({ patient: u._id, status: 'ACTIVE', endsAt: { $gt: new Date() } }).select('plan endsAt').lean()
    ]);
    return { ...row, stats: { visits, orders }, membership: membership ? { plan: membership.plan, endsAt: membership.endsAt } : null };
  }
  const [completed, openWithdrawal] = await Promise.all([
    STAFF_ROLES.includes(u.role) ? NurseBooking.countDocuments({ serviceProvider: u._id, status: 'COMPLETED' }) : Promise.resolve(null),
    WithdrawalRequest.findOne({ user: u._id, status: 'REQUESTED' }).select('amount createdAt').lean()
  ]);
  return {
    ...row,
    profile: u.careProfile ? { qualification: u.careProfile.qualification || null, gender: u.careProfile.gender || null, registrationNumber: u.careProfile.registrationNumber || null } : null,
    payout: u.payout?.method ? { method: u.payout.method, display: u.payout.method === 'UPI' ? maskEmail(u.payout.upiId || '').replace('***', '•••') : `${u.payout.bankName || 'Bank'} ••••${u.payout.accountLast4 || ''}` } : null,
    referralCode: u.referral?.code || null,
    stats: { completedVisits: completed },
    openWithdrawal: openWithdrawal ? { amount: openWithdrawal.amount, since: openWithdrawal.createdAt } : null
  };
}

/** Full email and phone. Route requires a fresh 2-step code; always audited. */
async function revealContact(type, id, admin, req, reason) {
  const u = await findUser(type, id);
  await securityAuditService.record({
    event: 'admin_contact_revealed',
    actorId: admin._id,
    actorType: 'user',
    targetType: type === 'customers' ? 'patient' : 'user',
    targetId: u._id,
    req,
    metadata: { reason: String(reason || '').slice(0, 200) }
  });
  return { email: u.email || null, phone: u.phone || null };
}

/** Suspend or restore an account. Suspended accounts are refused on every request. */
async function setActive(type, id, active, admin, req, reason) {
  const u = await findUser(type, id);
  if (!active && String(u._id) === String(admin._id)) throw new ValidationError('You cannot suspend your own account');
  const set = { isActive: !!active };
  let releasedVisits = 0;
  if (type === 'partners' && !active) {
    set.isOnline = false;
    set.isAvailable = false;
  }
  await modelFor(type).updateOne({ _id: u._id }, { $set: set });
  if (type === 'partners' && !active && STAFF_ROLES.includes(u.role)) {
    releasedVisits = await require('./bookingService').releaseProviderVisits(u._id, 'Provider account suspended');
  }
  await securityAuditService.record({
    event: active ? 'admin_user_restored' : 'admin_user_suspended',
    actorId: admin._id,
    actorType: 'user',
    targetType: type === 'customers' ? 'patient' : 'user',
    targetId: u._id,
    req,
    metadata: { reason: String(reason || '').slice(0, 200), releasedVisits }
  });
  return { active: !!active, releasedVisits };
}

/** Medical staff and their ID / police / council checks, pending first. */
async function listVerification({ status = 'pending', q } = {}) {
  const filter = { role: { $in: STAFF_ROLES }, ...searchFilter(q) };
  if (status === 'pending') {
    filter.$or = [
      { 'careProfile.verification.idVerified': { $ne: true } },
      { 'careProfile.verification.policeVerified': { $ne: true } },
      { 'careProfile.verification.councilVerified': { $ne: true } }
    ];
  } else if (status === 'verified') {
    Object.assign(filter, {
      'careProfile.verification.idVerified': true,
      'careProfile.verification.policeVerified': true,
      'careProfile.verification.councilVerified': true
    });
  }
  const rows = await User.find(filter)
    .select('name email phone role isActive createdAt careProfile')
    .sort({ createdAt: 1 })
    .limit(200)
    .lean();
  return rows.map((u) => ({
    ...toRow('partners', u),
    qualification: u.careProfile?.qualification || null,
    registrationNumber: u.careProfile?.registrationNumber || null,
    gender: u.careProfile?.gender || null,
    verification: verificationOf(u)
  }));
}

// ── Payment log ────────────────────────────────────────────────────────────

const KINDS = ['PAYMENT', 'REFUND', 'CASH', 'FAILED', 'WITHDRAWAL'];
const inRange = (d, from, to) => d && new Date(d) >= from && new Date(d) <= to;
const rangeOr = (fields, from, to) => ({ $or: fields.map((f) => ({ [f]: { $gte: from, $lte: to } })) });

/**
 * Every money movement in a period, newest first: online payments, refunds,
 * cash collected by partners, failed payments and partner withdrawals.
 */
async function paymentLog({ from, to, kind, limit = 300 } = {}) {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 7 * 86400000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) throw new ValidationError('Invalid date range');
  if (end - start > 92 * 86400000) throw new ValidationError('Pick a range of at most 3 months');
  const cap = 500;
  const rows = [];

  const orders = await PharmacyOrder.find(rangeOr(['razorpay.paidAt', 'razorpay.refundedAt', 'deliveredAt', 'refunds.createdAt', 'updatedAt'], start, end))
    .select('orderNumber paymentMode paymentStatus amounts razorpay refunds deliveredAt updatedAt createdAt patient')
    .populate('patient', 'name')
    .sort({ updatedAt: -1 })
    .limit(cap)
    .lean();
  for (const o of orders) {
    const base = { source: 'PHARMACY', ref: o.orderNumber, who: o.patient?.name || null };
    if (o.paymentMode === 'PREPAID' && inRange(o.razorpay?.paidAt, start, end)) {
      rows.push({ ...base, kind: 'PAYMENT', method: 'ONLINE', amount: o.amounts?.originalTotal || o.amounts?.total || 0, status: 'CAPTURED', at: o.razorpay.paidAt, gatewayRef: o.razorpay.paymentId || null });
    }
    if (o.paymentStatus === 'FAILED' && inRange(o.updatedAt, start, end)) {
      rows.push({ ...base, kind: 'FAILED', method: 'ONLINE', amount: o.amounts?.total || 0, status: 'FAILED', at: o.updatedAt, note: o.razorpay?.failureReason || null });
    }
    if (o.paymentMode === 'COD' && inRange(o.deliveredAt, start, end)) {
      rows.push({ ...base, kind: 'CASH', method: 'CASH', amount: o.amounts?.total || 0, status: 'COLLECTED', at: o.deliveredAt });
    }
    for (const r of o.refunds || []) {
      if (inRange(r.doneAt || r.createdAt, start, end)) {
        rows.push({ ...base, kind: 'REFUND', method: 'ONLINE', amount: r.amount, status: r.status, at: r.doneAt || r.createdAt, gatewayRef: r.refundId || null, note: r.error || r.reason || null });
      }
    }
    if (inRange(o.razorpay?.refundedAt, start, end)) {
      rows.push({ ...base, kind: 'REFUND', method: 'ONLINE', amount: o.amounts?.refunded || o.amounts?.total || 0, status: 'DONE', at: o.razorpay.refundedAt, gatewayRef: o.razorpay.refundId || null });
    }
  }

  const visits = await NurseBooking.find(rangeOr(['payment.paidAt', 'payment.refundedAt', 'updatedAt'], start, end))
    .select('serviceType payment updatedAt patient serviceProvider')
    .populate('patient', 'name')
    .populate('serviceProvider', 'name')
    .sort({ updatedAt: -1 })
    .limit(cap)
    .lean();
  for (const v of visits) {
    const p = v.payment || {};
    const base = { source: 'CARE', ref: String(v._id).slice(-8).toUpperCase(), who: v.patient?.name || null, service: v.serviceType };
    if (p.status && ['PAID', 'REFUND_PENDING', 'REFUNDED'].includes(p.status) && inRange(p.paidAt, start, end)) {
      rows.push(p.method === 'CASH'
        ? { ...base, kind: 'CASH', method: 'CASH', amount: p.amount || 0, status: 'COLLECTED', at: p.paidAt, partner: v.serviceProvider?.name || null }
        : { ...base, kind: 'PAYMENT', method: 'ONLINE', amount: p.amount || 0, status: 'CAPTURED', at: p.paidAt, gatewayRef: p.paymentId || null });
    }
    if (p.status === 'FAILED' && inRange(v.updatedAt, start, end)) {
      rows.push({ ...base, kind: 'FAILED', method: p.method || 'ONLINE', amount: p.amount || 0, status: 'FAILED', at: v.updatedAt, note: p.failureReason || null });
    }
    if (inRange(p.refundedAt, start, end)) {
      rows.push({ ...base, kind: 'REFUND', method: 'ONLINE', amount: p.refundAmount || p.amount || 0, status: 'DONE', at: p.refundedAt, gatewayRef: p.refundId || null, note: p.refundReason || null });
    }
  }

  const memberships = await Membership.find({ source: 'PAID', createdAt: { $gte: start, $lte: end } })
    .select('plan status amount razorpay createdAt patient')
    .populate('patient', 'name')
    .limit(cap)
    .lean();
  for (const m of memberships) {
    rows.push({ source: 'MEMBERSHIP', ref: m.plan, who: m.patient?.name || null, kind: m.status === 'PENDING_PAYMENT' ? 'FAILED' : 'PAYMENT', method: 'ONLINE', amount: m.amount || 0, status: m.status, at: m.createdAt, gatewayRef: m.razorpay?.paymentId || null });
  }

  const withdrawals = await WithdrawalRequest.find(rangeOr(['createdAt', 'processedAt'], start, end))
    .select('amount status destination utr createdAt processedAt user')
    .populate('user', 'name role')
    .limit(cap)
    .lean();
  for (const w of withdrawals) {
    rows.push({ source: 'PAYOUT', ref: w.utr || String(w._id).slice(-8).toUpperCase(), who: w.user?.name || null, kind: 'WITHDRAWAL', method: w.destination?.method || null, amount: w.amount, status: w.status, at: w.processedAt || w.createdAt, note: w.destination?.display || null });
  }

  const filtered = kind && KINDS.includes(kind) ? rows.filter((r) => r.kind === kind) : rows;
  filtered.sort((a, b) => new Date(b.at) - new Date(a.at));
  const totals = {};
  for (const k of KINDS) totals[k] = { count: 0, amount: 0 };
  for (const r of rows) {
    totals[r.kind].count += 1;
    totals[r.kind].amount = Math.round((totals[r.kind].amount + (Number(r.amount) || 0)) * 100) / 100;
  }
  return { from: start, to: end, totals, entries: filtered.slice(0, Math.min(Number(limit) || 300, 1000)) };
}

module.exports = { listUsers, getUser, revealContact, setActive, listVerification, paymentLog, PARTNER_ROLES, KINDS };
