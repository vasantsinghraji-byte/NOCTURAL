/**
 * Nabz Plus membership: free delivery on pharmacy orders and no platform fee
 * on home-care visits (config/revenue.js).
 *
 *  - startTrial:     one free trial per patient, ever (unique index).
 *  - createCheckout: Razorpay order for the plan price → PENDING_PAYMENT period.
 *  - verifyCheckout: HMAC signature + server-side payment re-fetch (amount,
 *                    currency, order id, status) → ACTIVE period, stacked after
 *                    any current one. Idempotent per payment id.
 */

const mongoose = require('mongoose');
const Membership = require('../models/membership');
const gateway = require('../utils/razorpayGateway');
const settlementService = require('./settlementService');
const { getRevenuePolicy } = require('../config/revenue');
const logger = require('../utils/logger');
const { ConflictError, NotFoundError, PaymentError, ValidationError } = require('../utils/errors');

const DAY_MS = 24 * 60 * 60 * 1000;

function getPlan(code = 'PLUS_MONTHLY') {
  const plan = getRevenuePolicy().membership.plans[code];
  if (!plan) throw new ValidationError('Unknown membership plan');
  return plan;
}

function listPlans() {
  const { plans, trialDays } = getRevenuePolicy().membership;
  return { plans: Object.values(plans), trialDays, onlinePayment: gateway.isEnabled() };
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
  if (mongoose.connection.readyState !== 1) return false;
  try {
    return !!(await getActiveMembership(patientId));
  } catch (err) {
    logger.warn('Membership lookup failed; pricing as non-member', { error: err.message });
    return false;
  }
}

async function getStatus(patientId) {
  const [active, trialUsed, latest] = await Promise.all([
    getActiveMembership(patientId),
    Membership.exists({ patient: patientId, source: 'TRIAL' }),
    Membership.findOne({ patient: patientId, status: 'ACTIVE' }).sort({ endsAt: -1 })
  ]);
  return {
    active: !!active,
    membership: active,
    validUntil: latest && latest.endsAt > new Date() ? latest.endsAt : null,
    trialAvailable: !trialUsed,
    ...listPlans()
  };
}

/** New periods start when the latest active one ends (renewals stack). */
async function nextPeriodStart(patientId, now = new Date()) {
  const latest = await Membership.findOne({ patient: patientId, status: 'ACTIVE', endsAt: { $gt: now } }).sort({ endsAt: -1 });
  return latest ? latest.endsAt : now;
}

async function startTrial(patientId) {
  const { trialDays } = getRevenuePolicy().membership;
  if (await Membership.exists({ patient: patientId, source: 'TRIAL' })) {
    throw new ConflictError('Your free trial has already been used');
  }
  const startsAt = await nextPeriodStart(patientId);
  try {
    return await Membership.create({
      patient: patientId,
      plan: 'PLUS_MONTHLY',
      source: 'TRIAL',
      status: 'ACTIVE',
      startsAt,
      endsAt: new Date(startsAt.getTime() + trialDays * DAY_MS),
      amount: 0
    });
  } catch (err) {
    if (err && err.code === 11000) throw new ConflictError('Your free trial has already been used');
    throw err;
  }
}

async function createCheckout(patientId, planCode) {
  const plan = getPlan(planCode);
  const razorpay = gateway.getClient(); // 503 when online payment is off
  const pending = await Membership.create({
    patient: patientId,
    plan: plan.code,
    source: 'PAID',
    status: 'PENDING_PAYMENT',
    startsAt: new Date(),
    endsAt: new Date(),
    amount: plan.price
  });
  const gatewayOrder = await razorpay.orders.create({
    amount: gateway.toPaise(plan.price),
    currency: 'INR',
    receipt: `plus_${pending._id}`,
    notes: { membershipId: String(pending._id), patientId: String(patientId), plan: plan.code }
  });
  pending.razorpay = { orderId: gatewayOrder.id };
  await pending.save();
  return {
    membershipId: pending._id,
    razorpayOrderId: gatewayOrder.id,
    amount: gateway.toPaise(plan.price),
    currency: 'INR',
    keyId: gateway.getPublicKeyId(),
    plan
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

  const plan = getPlan(pending.plan);
  const startsAt = await nextPeriodStart(patientId);
  const activated = await Membership.findOneAndUpdate(
    { _id: pending._id, status: 'PENDING_PAYMENT' },
    {
      $set: {
        status: 'ACTIVE',
        startsAt,
        endsAt: new Date(startsAt.getTime() + plan.days * DAY_MS),
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

module.exports = {
  listPlans,
  getActiveMembership,
  isMember,
  getStatus,
  startTrial,
  createCheckout,
  verifyCheckout
};
