/**
 * Nabz Plus membership: free delivery on pharmacy orders and no platform fee
 * on home-care visits (config/revenue.js).
 *
 *  - plans:          sold plans come from the admin panel (MembershipPlan); until
 *                    an admin saves one, the plan in config/revenue.js.
 *  - startTrial:     one free trial per patient, ever (unique index); a trial
 *                    length of 0 (admin settings) switches trials off.
 *  - createCheckout: Razorpay order for the plan price → PENDING_PAYMENT period
 *                    that records the price and length it was sold at.
 *  - verifyCheckout: HMAC signature + server-side payment re-fetch (amount,
 *                    currency, order id, status) → ACTIVE period, stacked after
 *                    any current one. Idempotent per payment id.
 */

const mongoose = require('mongoose');
const Membership = require('../models/membership');
const MembershipPlan = require('../models/membershipPlan');
const gateway = require('../utils/razorpayGateway');
const settlementService = require('./settlementService');
const couponService = require('./couponService');
const { getRevenuePolicy } = require('../config/revenue');
const logger = require('../utils/logger');
const { ConflictError, NotFoundError, PaymentError, ValidationError } = require('../utils/errors');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PLAN = 'PLUS_MONTHLY';

const publicPlan = (p) => ({ code: p.code, name: p.name, price: p.price, days: p.days, ...(p.note ? { note: p.note } : {}) });
const configPlans = () => Object.values(getRevenuePolicy().membership.plans).map((p) => ({ ...p, active: true, sortOrder: 0 }));
const dbReady = () => mongoose.connection.readyState === 1;

/**
 * The plans on sale. `activeOnly: false` also finds plans the admin switched
 * off, so a checkout opened before that still completes.
 */
async function plansFromStore({ activeOnly = true } = {}) {
  if (dbReady() && await MembershipPlan.exists({})) {
    return MembershipPlan.find(activeOnly ? { active: true } : {}).sort({ sortOrder: 1, price: 1 }).lean();
  }
  return configPlans();
}

async function getPlan(code = DEFAULT_PLAN, { activeOnly = true } = {}) {
  const wanted = String(code || '').toUpperCase();
  const plan = (await plansFromStore({ activeOnly })).find((p) => p.code === wanted);
  if (!plan) throw new ValidationError('That plan is not available. Pick another plan.');
  return plan;
}

/** Free-trial length in days (admin settings); 0 switches the trial off. */
const trialDays = () => getRevenuePolicy().membership.trialDays;

/** What members get right now (admin settings), so the apps never promise a switched-off benefit. */
function benefits() {
  const { pharmacy, care } = getRevenuePolicy();
  return {
    freeDelivery: pharmacy.memberFreeDelivery,
    noVisitFee: care.memberFeeWaived && care.customerFeeRate > 0,
    visitFeePercent: Math.round(care.customerFeeRate * 100)
  };
}

async function listPlans() {
  return { plans: (await plansFromStore()).map(publicPlan), trialDays: trialDays(), onlinePayment: gateway.isEnabled(), benefits: benefits() };
}

async function getActiveMembership(patientId, now = new Date()) {
  if (!patientId) return null;
  return Membership.findOne({
    patient: patientId, status: 'ACTIVE', startsAt: { $lte: now }, endsAt: { $gt: now }
  }).sort({ endsAt: -1 });
}

/** Never throws: a lookup failure must not block checkout (charges the normal price). */
async function isMember(patientId) {
  // No database connection (offline tooling / unit tests): price as a non-member
  // instead of letting Mongoose buffer the query.
  if (!dbReady()) return false;
  try {
    return !!(await getActiveMembership(patientId));
  } catch (err) {
    logger.warn('Membership lookup failed; pricing as non-member', { error: err.message });
    return false;
  }
}

async function getStatus(patientId) {
  const [active, trialUsed, latest, offer] = await Promise.all([
    getActiveMembership(patientId),
    Membership.exists({ patient: patientId, source: 'TRIAL' }),
    Membership.findOne({ patient: patientId, status: 'ACTIVE' }).sort({ endsAt: -1 }),
    listPlans()
  ]);
  return {
    active: !!active,
    membership: active,
    validUntil: latest && latest.endsAt > new Date() ? latest.endsAt : null,
    trialAvailable: !trialUsed && offer.trialDays > 0,
    ...offer
  };
}

/** New periods start when the latest active one ends (renewals stack). */
async function nextPeriodStart(patientId, now = new Date()) {
  const latest = await Membership.findOne({ patient: patientId, status: 'ACTIVE', endsAt: { $gt: now } }).sort({ endsAt: -1 });
  return latest ? latest.endsAt : now;
}

async function startTrial(patientId) {
  const days = trialDays();
  if (!(days > 0)) throw new ConflictError('The free trial is not available right now');
  if (await Membership.exists({ patient: patientId, source: 'TRIAL' })) {
    throw new ConflictError('Your free trial has already been used');
  }
  const startsAt = await nextPeriodStart(patientId);
  try {
    return await Membership.create({
      patient: patientId,
      plan: DEFAULT_PLAN,
      source: 'TRIAL',
      status: 'ACTIVE',
      startsAt,
      endsAt: new Date(startsAt.getTime() + days * DAY_MS),
      amount: 0,
      days
    });
  } catch (err) {
    if (err && err.code === 11000) throw new ConflictError('Your free trial has already been used');
    throw err;
  }
}

async function createCheckout(patientId, planCode, couponCode) {
  const plan = await getPlan(planCode);
  const razorpay = gateway.getClient(); // 503 when online payment is off
  const id = new mongoose.Types.ObjectId();
  // Discount code: off the plan price (Nabz pays it); something must be left to pay online.
  let discount = 0;
  let code;
  if (typeof couponCode === 'string' && couponCode.trim()) {
    const used = await couponService.reserve({ code: couponCode, patientId, service: 'MEMBERSHIP', amount: plan.price, orderId: id });
    if (plan.price - used.discount < 1) {
      await couponService.release('MEMBERSHIP', id, 'Code worth the whole plan');
      throw new ValidationError('This code is worth the whole plan. Pick a longer plan or remove the code', 'couponCode');
    }
    discount = used.discount;
    code = used.code;
  }
  const amount = Math.round((plan.price - discount) * 100) / 100;
  let pending;
  try {
    pending = await Membership.create({
      _id: id,
      patient: patientId,
      plan: plan.code,
      source: 'PAID',
      status: 'PENDING_PAYMENT',
      startsAt: new Date(),
      endsAt: new Date(),
      amount,
      listPrice: plan.price,
      couponDiscount: discount,
      ...(code ? { coupon: { code } } : {}),
      days: plan.days
    });
    const gatewayOrder = await razorpay.orders.create({
      amount: gateway.toPaise(amount),
      currency: 'INR',
      receipt: `plus_${pending._id}`,
      notes: { membershipId: String(pending._id), patientId: String(patientId), plan: plan.code, ...(code ? { coupon: code } : {}) }
    });
    pending.razorpay = { orderId: gatewayOrder.id };
    await pending.save();
  } catch (err) {
    // No checkout opened: the code's use goes back.
    if (discount > 0) await couponService.release('MEMBERSHIP', id, 'Checkout could not be opened').catch(() => undefined);
    if (pending) await Membership.updateOne({ _id: id, status: 'PENDING_PAYMENT' }, { $set: { status: 'CANCELLED' } }).catch(() => undefined);
    throw err;
  }
  return {
    membershipId: pending._id,
    razorpayOrderId: pending.razorpay.orderId,
    amount: gateway.toPaise(amount),
    discount,
    currency: 'INR',
    keyId: gateway.getPublicKeyId(),
    plan: publicPlan(plan)
  };
}

async function verifyCheckout(patientId, { razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const razorpay = gateway.getClient();
  const pending = await Membership.findOne({ patient: patientId, 'razorpay.orderId': razorpayOrderId });
  if (!pending) throw new NotFoundError('Membership checkout');
  if (pending.status === 'ACTIVE' && pending.razorpay.paymentId === razorpayPaymentId) return pending; // duplicate callback
  if (pending.status !== 'PENDING_PAYMENT') throw new ConflictError('This checkout is no longer open');

  if (!gateway.verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
    logger.logSecurity('membership_payment_signature_invalid', { membershipId: String(pending._id) });
    throw new PaymentError('Payment verification failed');
  }
  // Never trust the client: re-read the payment and check it pays this checkout.
  const payment = await razorpay.payments.fetch(razorpayPaymentId);
  if (payment.order_id !== razorpayOrderId || payment.currency !== 'INR'
    || Number(payment.amount) !== gateway.toPaise(pending.amount)
    || !['authorized', 'captured'].includes(payment.status)) {
    logger.logSecurity('membership_payment_mismatch', { membershipId: String(pending._id), status: payment.status });
    throw new PaymentError('Payment could not be verified for this membership');
  }
  // Accounts without auto-capture leave payments `authorized` (auto-reversed in days).
  if (payment.status === 'authorized') {
    await razorpay.payments.capture(payment.id, payment.amount, payment.currency);
  }

  // The length sold at checkout; older checkouts (before it was stored) use the
  // plan's, even if the plan has been switched off since.
  const days = pending.days || (await getPlan(pending.plan, { activeOnly: false })).days;
  const startsAt = await nextPeriodStart(patientId);
  const activated = await Membership.findOneAndUpdate(
    { _id: pending._id, status: 'PENDING_PAYMENT' },
    {
      $set: {
        status: 'ACTIVE',
        startsAt,
        endsAt: new Date(startsAt.getTime() + days * DAY_MS),
        'razorpay.paymentId': razorpayPaymentId
      }
    },
    { new: true }
  );
  if (!activated) return Membership.findById(pending._id); // concurrent verify won
  await settlementService.recordMembership(activated);
  logger.info('Nabz Plus activated', { membershipId: String(activated._id), until: activated.endsAt });
  return activated;
}

// ── Admin panel ─────────────────────────────────────────────────────────────

/** First admin visit: copy the config plan into the database so it can be edited. */
async function seedPlansIfEmpty(adminId) {
  if (await MembershipPlan.exists({})) return;
  await Promise.all(configPlans().map((p) => MembershipPlan.updateOne(
    { code: p.code },
    { $setOnInsert: { code: p.code, name: p.name, price: p.price, days: p.days, active: true, sortOrder: 0, updatedBy: adminId } },
    { upsert: true }
  )));
}

/** Every plan (on sale or not) with how many customers hold each right now. */
async function adminListPlans(adminId) {
  await seedPlansIfEmpty(adminId);
  const now = new Date();
  const [plans, counts] = await Promise.all([
    MembershipPlan.find({}).sort({ sortOrder: 1, price: 1 }).lean(),
    Membership.aggregate([
      { $match: { status: 'ACTIVE', startsAt: { $lte: now }, endsAt: { $gt: now } } },
      { $group: { _id: { plan: '$plan', source: '$source' }, n: { $sum: 1 } } }
    ])
  ]);
  const members = (code, source) => (counts.find((c) => c._id.plan === code && c._id.source === source) || {}).n || 0;
  return {
    plans: plans.map((p) => ({ ...publicPlan(p), active: p.active, sortOrder: p.sortOrder || 0, updatedAt: p.updatedAt, members: members(p.code, 'PAID'), trials: members(p.code, 'TRIAL') })),
    trialDays: trialDays(),
    onlinePayment: gateway.isEnabled()
  };
}

/**
 * Create a plan or change one. The code is fixed once created; price and length
 * changes apply to new checkouts only (paid periods keep what they were sold at).
 */
async function adminSavePlan(adminId, code, input = {}) {
  const planCode = String(code || '').trim().toUpperCase();
  if (!MembershipPlan.CODE.test(planCode)) throw new ValidationError('Plan code: 3-30 capital letters, digits or _, starting with a letter');
  await seedPlansIfEmpty(adminId);
  const existing = await MembershipPlan.findOne({ code: planCode });
  const next = {
    name: input.name !== undefined ? String(input.name).trim() : existing && existing.name,
    price: input.price !== undefined ? Number(input.price) : existing && existing.price,
    days: input.days !== undefined ? Number(input.days) : existing && existing.days,
    note: input.note !== undefined ? String(input.note || '').trim() : existing && existing.note,
    active: input.active !== undefined ? input.active === true : existing ? existing.active : true,
    sortOrder: input.sortOrder !== undefined ? Number(input.sortOrder) : existing ? existing.sortOrder : 0
  };
  if (!next.name || next.name.length < 2 || next.name.length > 40) throw new ValidationError('Plan name: 2-40 characters');
  if (!Number.isInteger(next.price) || next.price < 1 || next.price > 100000) throw new ValidationError('Price: a whole number of rupees from ₹1 to ₹1,00,000');
  if (!Number.isInteger(next.days) || next.days < 1 || next.days > 366) throw new ValidationError('Length: 1 to 366 days');
  if (next.note && next.note.length > 60) throw new ValidationError('Note: at most 60 characters');
  if (!Number.isInteger(next.sortOrder) || next.sortOrder < 0 || next.sortOrder > 999) throw new ValidationError('Order: 0 to 999');

  const saved = await MembershipPlan.findOneAndUpdate(
    { code: planCode },
    { $set: { ...next, updatedBy: adminId }, $setOnInsert: { code: planCode } },
    { new: true, upsert: true, runValidators: true }
  );
  logger.logSecurity('membership_plan_saved', {
    adminId: String(adminId),
    plan: planCode,
    created: !existing,
    changes: existing ? Object.keys(next).filter((k) => String(existing[k] ?? '') !== String(next[k] ?? '')) : Object.keys(next)
  });
  return { ...publicPlan(saved), active: saved.active, sortOrder: saved.sortOrder };
}

module.exports = {
  listPlans,
  getPlan,
  getActiveMembership,
  isMember,
  getStatus,
  startTrial,
  createCheckout,
  verifyCheckout,
  adminListPlans,
  adminSavePlan
};
