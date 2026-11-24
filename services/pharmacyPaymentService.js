/**
 * Pharmacy Payment Service
 *
 * Razorpay prepaid checkout for PharmacyOrder:
 *   1. patient places a PREPAID order (stock reserved, paymentStatus PENDING,
 *      hidden from the vendor, expires at `paymentExpiresAt`)
 *   2. createGatewayOrder → Razorpay order for the snapshotted total
 *   3. verifyPayment → signature + server-side re-fetch of the payment
 *      (amount/currency/order id) → paymentStatus PAID → vendor sees it
 *   4. expireUnpaidOrders (worker) → reconciles with Razorpay first, then
 *      cancels + restocks orders that were never paid
 *   5. refundOrderPayment → used when a PAID order is cancelled/rejected
 *
 * Every state change is a conditional (compare-and-set) update so concurrent
 * verify / sweep / cancel calls can't double-mark or double-refund.
 */

const mongoose = require('mongoose');
const PharmacyOrder = require('../models/pharmacyOrder');
const PharmacyVendor = require('../models/pharmacyVendor');
const gateway = require('../utils/razorpayGateway');
const logger = require('../utils/logger');
const monitoring = require('../utils/monitoring');
const pharmacyNotificationService = require('./pharmacyNotificationService');
const { getPharmacyOps } = require('../config/pharmacyOps');
const {
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthorizationError,
  PaymentError
} = require('../utils/errors');

const CURRENCY = 'INR';
const UNPAID_STATUSES = ['PENDING', 'FAILED'];
const DEFAULT_PAYMENT_TTL_MINUTES = 15;
const DEFAULT_SWEEP_INTERVAL_MS = 60 * 1000;
// Razorpay payment states that mean the money is secured for this order.
const SUCCESSFUL_PAYMENT_STATES = ['captured', 'authorized'];

let sweeperHandle = null;

function getPaymentTtlMs() {
  const minutes = Number(process.env.PHARMACY_PAYMENT_TTL_MINUTES);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_PAYMENT_TTL_MINUTES) * 60 * 1000;
}

/** True while a PREPAID order is still waiting for money (vendor must not see it). */
function isAwaitingPayment(order) {
  return !!order && order.paymentMode === 'PREPAID' && UNPAID_STATUSES.includes(order.paymentStatus);
}

/** Mongo filter fragment that excludes unpaid PREPAID orders. */
const EXCLUDE_AWAITING_PAYMENT = {
  $nor: [{ paymentMode: 'PREPAID', paymentStatus: { $in: UNPAID_STATUSES } }]
};

function getPaymentOptions() {
  return {
    online: gateway.isEnabled(),
    razorpayKeyId: gateway.getPublicKeyId(),
    currency: CURRENCY,
    paymentWindowMinutes: Math.round(getPaymentTtlMs() / 60000)
  };
}

async function loadPatientOrder(orderId, patientId) {
  if (!mongoose.isValidObjectId(orderId)) throw new ValidationError('Invalid order id');
  const order = await PharmacyOrder.findById(orderId);
  if (!order) throw new NotFoundError('Order', orderId);
  if (String(order.patient) !== String(patientId)) {
    throw new AuthorizationError('You can only pay for your own orders');
  }
  return order;
}

function checkoutPayload(order, gatewayOrder) {
  return {
    razorpayKeyId: gateway.getPublicKeyId(),
    gatewayOrder: {
      id: gatewayOrder.id,
      amount: gatewayOrder.amount,
      currency: gatewayOrder.currency
    },
    order: {
      _id: order._id,
      orderNumber: order.orderNumber,
      total: order.amounts.total,
      paymentExpiresAt: order.paymentExpiresAt
    }
  };
}

/**
 * Create (or reuse) the Razorpay order backing a PREPAID pharmacy order.
 */
async function createGatewayOrder(orderId, patientId) {
  const razorpay = gateway.getClient();
  const order = await loadPatientOrder(orderId, patientId);

  if (order.paymentMode !== 'PREPAID') throw new ConflictError('This order is Cash on Delivery');
  if (order.paymentStatus === 'PAID') throw new ConflictError('This order is already paid');
  if (!isAwaitingPayment(order) || order.status !== 'PLACED') {
    throw new ConflictError(`This order can no longer be paid (${order.status})`);
  }
  if (order.paymentExpiresAt && order.paymentExpiresAt.getTime() <= Date.now()) {
    throw new ConflictError('The payment window for this order has expired. Please place a new order.');
  }

  const amountPaise = gateway.toPaise(order.amounts.total);
  const existingId = order.razorpay && order.razorpay.orderId;

  // Reuse an open gateway order so retries don't create orphans.
  if (existingId) {
    let existing = null;
    try {
      existing = await razorpay.orders.fetch(existingId);
    } catch (err) {
      logger.warn('Could not fetch existing Razorpay order; creating a new one', {
        orderId: String(order._id), razorpayOrderId: existingId, error: err.message
      });
    }
    if (existing && existing.status === 'paid') {
      // Paid on Razorpay but we never heard back — reconcile, never re-charge.
      await reconcileGatewayOrder(order);
      throw new ConflictError('This order is already paid');
    }
    if (existing && existing.amount === amountPaise && existing.currency === CURRENCY) {
      return checkoutPayload(order, existing);
    }
  }

  const gatewayOrder = await razorpay.orders.create({
    amount: amountPaise,
    currency: CURRENCY,
    receipt: order.orderNumber,
    notes: {
      pharmacyOrderId: String(order._id),
      patientId: String(order.patient)
    }
  });

  // Compare-and-set on the previous gateway order id: if a concurrent request
  // already attached a different one, hand back theirs instead of overwriting.
  const updated = await PharmacyOrder.findOneAndUpdate(
    {
      _id: order._id,
      paymentStatus: { $in: UNPAID_STATUSES },
      'razorpay.orderId': existingId || null
    },
    { $set: { 'razorpay.orderId': gatewayOrder.id } },
    { new: true }
  );

  if (!updated) {
    const fresh = await PharmacyOrder.findById(order._id);
    if (!isAwaitingPayment(fresh) || !fresh.razorpay?.orderId) {
      throw new ConflictError('This order can no longer be paid');
    }
    const theirs = await razorpay.orders.fetch(fresh.razorpay.orderId);
    return checkoutPayload(fresh, theirs);
  }

  logger.info('Pharmacy gateway order created', {
    orderId: String(order._id), razorpayOrderId: gatewayOrder.id, amountPaise
  });
  return checkoutPayload(updated, gatewayOrder);
}

/**
 * Refund in full a captured payment that duplicates an order's real payment.
 * Safe to call more than once: it checks what is already refunded on the
 * gateway first. Never throws (the order itself is fine); a failure alerts ops.
 */
async function refundDuplicatePayment(order, gatewayPayment) {
  const razorpay = gateway.getClient();
  try {
    const current = await razorpay.payments.fetch(gatewayPayment.id);
    const due = Number(current.amount || 0) - Number(current.amount_refunded || 0);
    if (current.status !== 'captured' || due <= 0) return { refunded: 0 };
    const refund = await razorpay.payments.refund(gatewayPayment.id, {
      amount: due,
      speed: 'optimum',
      notes: { reason: 'Duplicate payment for an order that was already paid', pharmacyOrderId: String(order._id), keptPaymentId: String(order.razorpay.paymentId) }
    });
    logger.logSecurity('pharmacy_duplicate_payment_refunded', {
      orderId: String(order._id), duplicatePaymentId: gatewayPayment.id, keptPaymentId: order.razorpay.paymentId, refundId: refund && refund.id, amountPaise: due
    });
    return { refunded: due, refundId: refund && refund.id };
  } catch (err) {
    logger.error('Duplicate payment refund failed', { orderId: String(order._id), paymentId: gatewayPayment.id, error: err.message });
    monitoring.triggerAlert('pharmacy_duplicate_refund_failed', { orderId: String(order._id), paymentId: gatewayPayment.id });
    return { refunded: 0, error: err.message };
  }
}

/**
 * Mark an order PAID from a Razorpay payment we've already validated.
 * Idempotent; refunds automatically if the order was cancelled meanwhile.
 */
async function applyCapturedPayment(order, gatewayPayment) {
  const now = new Date();
  const updated = await PharmacyOrder.findOneAndUpdate(
    { _id: order._id, paymentStatus: { $in: UNPAID_STATUSES } },
    {
      $set: {
        paymentStatus: 'PAID',
        'razorpay.paymentId': gatewayPayment.id,
        'razorpay.paidAt': now,
        'milestones.paidAt': now,
        // The store only sees the order now, so its acceptance clock starts now.
        acceptBy: new Date(now.getTime() + getPharmacyOps().acceptSlaSeconds * 1000)
      },
      $unset: { 'razorpay.failureReason': 1 }
    },
    { new: true }
  );

  if (!updated) {
    const fresh = await PharmacyOrder.findById(order._id);
    if (fresh && fresh.razorpay?.paymentId === gatewayPayment.id) return fresh; // already applied
    // A second, different payment for an order that is already paid (e.g. the
    // customer finished UPI in two apps). It has been captured, so give it back.
    if (fresh && fresh.paymentStatus !== 'PENDING' && fresh.paymentStatus !== 'FAILED' && fresh.razorpay?.paymentId) {
      await refundDuplicatePayment(fresh, gatewayPayment);
      return fresh;
    }
    logger.logSecurity('pharmacy_payment_unexpected_state', {
      orderId: String(order._id),
      paymentStatus: fresh?.paymentStatus,
      paymentId: gatewayPayment.id
    });
    throw new ConflictError('This order is not awaiting payment');
  }

  logger.info('Pharmacy order paid', {
    orderId: String(updated._id), paymentId: gatewayPayment.id, total: updated.amounts.total
  });

  // Paid after the order was cancelled/expired — give the money back.
  if (['CANCELLED', 'REJECTED'].includes(updated.status)) {
    return refundOrderPayment(updated, 'Order was cancelled before payment completed');
  }
  // The order just became visible to the store (the CAS above runs once per order).
  await PharmacyVendor.updateOne({ _id: updated.vendor }, { $inc: { 'reliability.offered': 1 } }).catch(() => {});
  pharmacyNotificationService.notifyVendorNewOrder(updated);
  return updated;
}

/** Validate a fetched Razorpay payment against the order it claims to pay. */
function assertPaymentMatchesOrder(order, gatewayPayment) {
  const problems = [];
  if (gatewayPayment.order_id !== order.razorpay?.orderId) problems.push('order_id');
  if (gatewayPayment.amount !== gateway.toPaise(order.amounts.total)) problems.push('amount');
  if (gatewayPayment.currency !== CURRENCY) problems.push('currency');
  if (!SUCCESSFUL_PAYMENT_STATES.includes(gatewayPayment.status)) problems.push('status');

  if (problems.length) {
    logger.logSecurity('pharmacy_payment_mismatch', {
      orderId: String(order._id),
      paymentId: gatewayPayment.id,
      mismatched: problems,
      gatewayStatus: gatewayPayment.status
    });
    throw new PaymentError('Payment could not be verified for this order');
  }
}

/**
 * Accounts without auto-capture leave payments `authorized`; Razorpay
 * auto-reverses those after a few days, so capture before marking PAID.
 */
async function captureIfAuthorized(gatewayPayment) {
  if (gatewayPayment.status !== 'authorized') return gatewayPayment;
  const razorpay = gateway.getClient();
  return razorpay.payments.capture(gatewayPayment.id, gatewayPayment.amount, gatewayPayment.currency);
}

/**
 * Verify the Razorpay checkout callback for a pharmacy order.
 */
async function verifyPayment(orderId, patientId, { razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const razorpay = gateway.getClient();
  const order = await loadPatientOrder(orderId, patientId);

  if (order.paymentStatus === 'PAID' && order.razorpay?.paymentId === razorpayPaymentId) {
    return order; // duplicate callback
  }
  if (!order.razorpay?.orderId || order.razorpay.orderId !== razorpayOrderId) {
    logger.logSecurity('pharmacy_payment_order_id_mismatch', {
      orderId: String(order._id), expected: order.razorpay?.orderId, received: razorpayOrderId
    });
    throw new PaymentError('Payment does not belong to this order');
  }
  if (!gateway.verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
    logger.logSecurity('pharmacy_payment_signature_invalid', {
      orderId: String(order._id), razorpayOrderId
    });
    throw new PaymentError('Payment verification failed');
  }

  // Never trust the client for amount — re-read the payment from Razorpay.
  const gatewayPayment = await razorpay.payments.fetch(razorpayPaymentId);
  assertPaymentMatchesOrder(order, gatewayPayment);
  return applyCapturedPayment(order, await captureIfAuthorized(gatewayPayment));
}

/** Checkout reported a failed attempt; the patient may retry until expiry. */
async function recordPaymentFailure(orderId, patientId, reason) {
  const order = await loadPatientOrder(orderId, patientId);
  if (!isAwaitingPayment(order)) return order;
  const updated = await PharmacyOrder.findOneAndUpdate(
    { _id: order._id, paymentStatus: { $in: UNPAID_STATUSES } },
    {
      $set: {
        paymentStatus: 'FAILED',
        'razorpay.failureReason': String(reason || 'Payment failed').slice(0, 300)
      }
    },
    { new: true }
  );
  return updated || order;
}

// ── Full refunds ─────────────────────────────────────────────────────────
//
// PAID → REFUND_PENDING → REFUNDED. Whoever holds razorpay.refundLockedUntil
// talks to Razorpay. Every attempt after the first asks Razorpay whether an
// earlier one went through; if it can't be asked, nothing is paid. A failed
// attempt waits longer each time (1 min … 6 h), then stops for an admin.

const REFUND_LOCK_MS = 60 * 1000;
const MAX_FULL_REFUND_ATTEMPTS = 12;
const REFUND_BACKOFF_CAP_MS = 6 * 60 * 60 * 1000;
const refundBackoffMs = (attempts) => Math.min(REFUND_BACKOFF_CAP_MS, 60 * 1000 * (2 ** Math.max(0, attempts - 1)));
const lockFree = (now) => [{ 'razorpay.refundLockedUntil': null }, { 'razorpay.refundLockedUntil': { $lte: now } }];

const markRefunded = (orderId, refundId, extra = {}) => PharmacyOrder.findOneAndUpdate(
  { _id: orderId, paymentStatus: 'REFUND_PENDING' },
  {
    $set: {
      paymentStatus: 'REFUNDED',
      'razorpay.refundId': refundId,
      'razorpay.refundMethod': 'GATEWAY',
      'razorpay.refundedAt': new Date(),
      ...extra
    },
    $unset: { 'razorpay.refundError': 1, 'razorpay.refundLockedUntil': 1 }
  },
  { new: true }
);

/** The full refund already sent for this order (partial ones carry a refundEntryId). */
const findFullRefund = (order) => gateway.findRefund(
  gateway.getClient(),
  order.razorpay.paymentId,
  (notes) => notes.pharmacyOrderId === String(order._id) && !notes.refundEntryId
);

/** Pay an order whose refund lock the caller holds. Never throws. */
async function sendFullRefund(locked, { checkFirst, now = new Date() }) {
  try {
    if (!gateway.isEnabled() || !locked.razorpay?.paymentId) throw new Error('Payment gateway unavailable');
    if (checkFirst) {
      const existing = await findFullRefund(locked);
      if (existing) return (await markRefunded(locked._id, existing.id)) || locked;
    }
    const refund = await gateway.getClient().payments.refund(locked.razorpay.paymentId, {
      amount: gateway.toPaise(locked.amounts.total),
      notes: { pharmacyOrderId: String(locked._id), reason: String(locked.razorpay.refundReason || 'Order cancelled').slice(0, 200) }
    });
    const refunded = await markRefunded(locked._id, refund.id);
    logger.info('Pharmacy order refunded', {
      orderId: String(locked._id), refundId: refund.id, amount: locked.amounts.total
    });
    return refunded || locked;
  } catch (err) {
    logger.error('Pharmacy refund failed — order left in REFUND_PENDING', {
      orderId: String(locked._id), paymentId: locked.razorpay?.paymentId, attempts: locked.razorpay?.refundAttempts, error: err.message
    });
    monitoring.triggerAlert('pharmacy_refund_failed', 1, {
      orderId: String(locked._id), paymentId: locked.razorpay?.paymentId
    });
    await PharmacyOrder.updateOne(
      { _id: locked._id, paymentStatus: 'REFUND_PENDING' },
      {
        $set: {
          'razorpay.refundError': String(err.message || 'Refund failed').slice(0, 300),
          'razorpay.refundLockedUntil': new Date(now.getTime() + refundBackoffMs(locked.razorpay?.refundAttempts || 1))
        }
      }
    ).catch(() => {});
    return locked;
  }
}

/**
 * Refund a PAID order in full. Never throws: a gateway failure leaves the order
 * in REFUND_PENDING (with refundError) for retryFullRefunds and the admin queue.
 */
async function refundOrderPayment(order, reason = 'Order cancelled') {
  if (!order || order.paymentMode !== 'PREPAID' || order.paymentStatus !== 'PAID') return order;

  // Lock PAID → REFUND_PENDING so only one caller ever hits the refund API.
  const now = new Date();
  const locked = await PharmacyOrder.findOneAndUpdate(
    { _id: order._id, paymentStatus: 'PAID' },
    {
      $set: {
        paymentStatus: 'REFUND_PENDING',
        'razorpay.refundReason': String(reason).slice(0, 200),
        'razorpay.refundAttempts': 1,
        'razorpay.refundLockedUntil': new Date(now.getTime() + REFUND_LOCK_MS)
      }
    },
    { new: true }
  );
  if (!locked) return PharmacyOrder.findById(order._id);
  return sendFullRefund(locked, { checkFirst: false, now });
}

/**
 * Take the refund lock on an order still owed its money (null = someone else has
 * it, or it's done). Clears the last error: an order with an error is waiting for
 * its next try, one without is being sent, and only the first may be hurried.
 */
const claimFullRefund = (orderId, { now, ignoreLimit = false }) => PharmacyOrder.findOneAndUpdate(
  {
    _id: orderId,
    paymentMode: 'PREPAID',
    paymentStatus: 'REFUND_PENDING',
    ...(ignoreLimit ? {} : { 'razorpay.refundAttempts': { $not: { $gte: MAX_FULL_REFUND_ATTEMPTS } } }),
    $or: lockFree(now)
  },
  {
    $set: { 'razorpay.refundLockedUntil': new Date(now.getTime() + REFUND_LOCK_MS) },
    $unset: { 'razorpay.refundError': 1 },
    $inc: { 'razorpay.refundAttempts': 1 }
  },
  { new: true }
);

/** Worker: full refunds that failed or were interrupted. */
async function retryFullRefunds({ now = new Date(), limit = 20 } = {}) {
  const due = await PharmacyOrder.find({
    paymentMode: 'PREPAID',
    paymentStatus: 'REFUND_PENDING',
    'razorpay.refundAttempts': { $not: { $gte: MAX_FULL_REFUND_ATTEMPTS } },
    $or: lockFree(now)
  }).select('_id').sort({ updatedAt: 1 }).limit(limit).lean();
  let retried = 0;
  for (const { _id } of due) {
    const locked = await claimFullRefund(_id, { now });
    if (!locked) continue;
    await sendFullRefund(locked, { checkFirst: true, now });
    retried += 1;
  }
  return { retried };
}

const busy = () => new ConflictError('This refund is already done, or is being sent right now. Refresh in a minute');

/**
 * Admin: pay an owed refund now. With a bank transfer `reference` nothing is
 * sent to Razorpay, but Razorpay is asked first so the customer isn't paid twice.
 * Covers the full refund, or one partial refund (`entryId`).
 */
async function settleRefund(orderId, { adminId, entryId, reference, now = new Date() } = {}) {
  if (entryId) return settlePartialRefund(orderId, { adminId, entryId, reference, now });
  // An admin doesn't have to sit out the wait between retries, only a send in progress.
  await PharmacyOrder.updateOne(
    { _id: orderId, paymentStatus: 'REFUND_PENDING', 'razorpay.refundError': { $exists: true } },
    { $unset: { 'razorpay.refundLockedUntil': 1, 'razorpay.refundError': 1 } }
  );
  const locked = await claimFullRefund(orderId, { now, ignoreLimit: true });
  if (!locked) throw busy();
  const amount = locked.amounts.total;
  if (!reference) {
    const done = await sendFullRefund(locked, { checkFirst: true, now });
    if (done.paymentStatus !== 'REFUNDED') throw new PaymentError('Razorpay could not send this refund. It stays in the queue');
    return { amount, refundId: done.razorpay.refundId };
  }
  const existing = await alreadySent(() => findFullRefund(locked), locked, () => PharmacyOrder.updateOne({ _id: locked._id }, { $unset: { 'razorpay.refundLockedUntil': 1 } }));
  if (existing) {
    await markRefunded(locked._id, existing.id);
    throw new ConflictError('Razorpay has already refunded this order, so it is marked done. Don’t send a bank transfer');
  }
  await markRefunded(locked._id, String(reference).slice(0, 80), { 'razorpay.refundMethod': 'BANK', 'razorpay.refundedBy': adminId });
  return { amount, refundId: String(reference).slice(0, 80) };
}

/** Before recording a bank transfer: did Razorpay already pay? Refuses if Razorpay can't answer. */
async function alreadySent(find, order, release) {
  if (!gateway.isEnabled() || !order.razorpay?.paymentId) return null;
  try {
    return await find();
  } catch {
    await release();
    throw new PaymentError('Razorpay can’t be reached to check whether it already paid this refund. Try again shortly');
  }
}

async function settlePartialRefund(orderId, { adminId, entryId, reference, now }) {
  await PharmacyOrder.updateOne(
    { _id: orderId, refunds: { $elemMatch: { _id: entryId, status: 'FAILED' } } },
    { $unset: { 'refunds.$.lockedUntil': 1 } }
  );
  if (!reference) {
    const done = await processPartialRefund(orderId, entryId, now, { ignoreLimit: true });
    const entry = done && done.refunds.id(entryId);
    if (!entry) throw new NotFoundError('Refund');
    if (entry.status !== 'DONE') throw entry.status === 'FAILED' ? new PaymentError('Razorpay could not send this refund. It stays in the queue') : busy();
    return { amount: entry.amount, refundId: entry.refundId };
  }
  const locked = await claimPartialRefund(orderId, entryId, now, { ignoreLimit: true });
  if (!locked) throw busy();
  const entry = locked.refunds.id(entryId);
  const existing = await alreadySent(
    () => findExistingGatewayRefund(locked.razorpay.paymentId, entryId), locked,
    () => PharmacyOrder.updateOne({ _id: orderId, 'refunds._id': entryId }, { $set: { 'refunds.$.status': 'FAILED' }, $unset: { 'refunds.$.lockedUntil': 1 } })
  );
  await markPartialDone(orderId, entry, existing ? existing.id : String(reference).slice(0, 80), existing ? {} : { 'refunds.$.method': 'BANK', 'refunds.$.by': adminId });
  if (existing) throw new ConflictError('Razorpay has already refunded this item, so it is marked done. Don’t send a bank transfer');
  return { amount: entry.amount, refundId: String(reference).slice(0, 80) };
}

/** Admin queue: medicine refunds still owed (full, and single items), oldest first. */
async function owedRefunds(limit = 100) {
  const rows = await PharmacyOrder.find({
    $or: [{ paymentStatus: 'REFUND_PENDING' }, { 'refunds.status': { $in: ['PENDING', 'FAILED'] } }]
  }).select('orderNumber patient vendor amounts paymentStatus razorpay refunds updatedAt')
    .populate('patient', 'name').populate('vendor', 'name').sort({ updatedAt: 1 }).limit(limit).lean();
  return rows.flatMap((o) => {
    const base = { id: o._id, orderNumber: o.orderNumber, patient: o.patient, vendor: o.vendor, paymentId: o.razorpay && o.razorpay.paymentId };
    const full = o.paymentStatus === 'REFUND_PENDING' ? [{
      ...base, amount: o.amounts.total, reason: (o.razorpay && o.razorpay.refundReason) || 'Order cancelled', since: o.updatedAt,
      error: o.razorpay && o.razorpay.refundError, stopped: ((o.razorpay && o.razorpay.refundAttempts) || 0) >= MAX_FULL_REFUND_ATTEMPTS
    }] : [];
    const items = (o.refunds || []).filter((r) => r.status !== 'DONE').map((r) => ({
      ...base, entryId: r._id, amount: r.amount, reason: r.reason || 'Item unavailable', since: r.createdAt, error: r.error, stopped: (r.attempts || 0) >= MAX_REFUND_ATTEMPTS
    }));
    return [...full, ...items];
  });
}

// ── Partial refunds (items the store couldn't supply) ─────────────────────
//
// Money rules that must hold at every step:
//   refunded so far + amounts.total (still owed to the store/us) = originalTotal
//   a refund entry is sent to the gateway at most once per lock window, and a
//   retry first asks the gateway whether an earlier attempt already went
//   through (DB write lost after a successful refund), so we never pay twice.

const MAX_REFUND_ATTEMPTS = 8;

/** Queue a partial refund on a PAID order and try it once. Returns the order. */
async function requestPartialRefund(orderId, amount, reason) {
  const value = Math.round(Number(amount) * 100) / 100;
  if (!(value > 0)) return PharmacyOrder.findById(orderId);
  const queued = await PharmacyOrder.findOneAndUpdate(
    { _id: orderId, paymentMode: 'PREPAID', paymentStatus: 'PAID' },
    { $push: { refunds: { amount: value, reason: String(reason || 'Item unavailable').slice(0, 200), status: 'PENDING' } } },
    { new: true }
  );
  if (!queued) return PharmacyOrder.findById(orderId); // COD or unpaid: nothing to refund
  const entry = queued.refunds[queued.refunds.length - 1];
  return processPartialRefund(queued._id, entry._id);
}

const findExistingGatewayRefund = (paymentId, entryId) => gateway.findRefund(gateway.getClient(), paymentId, (notes) => notes.refundEntryId === String(entryId));

const claimPartialRefund = (orderId, entryId, now, { ignoreLimit = false } = {}) => PharmacyOrder.findOneAndUpdate(
  {
    _id: orderId,
    refunds: {
      $elemMatch: {
        _id: entryId,
        status: { $in: ['PENDING', 'FAILED'] },
        ...(ignoreLimit ? {} : { attempts: { $lt: MAX_REFUND_ATTEMPTS } }),
        $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }]
      }
    }
  },
  // PENDING while it is being sent: only a FAILED entry may be hurried by an admin.
  { $set: { 'refunds.$.status': 'PENDING', 'refunds.$.lockedUntil': new Date(now.getTime() + REFUND_LOCK_MS) }, $inc: { 'refunds.$.attempts': 1 } },
  { new: true }
);

const markPartialDone = (orderId, entry, refundId, extra = {}) => PharmacyOrder.findOneAndUpdate(
  { _id: orderId, refunds: { $elemMatch: { _id: entry._id, status: { $ne: 'DONE' } } } },
  {
    $set: { 'refunds.$.status': 'DONE', 'refunds.$.refundId': refundId, 'refunds.$.doneAt': new Date(), ...extra },
    $unset: { 'refunds.$.error': 1, 'refunds.$.lockedUntil': 1 },
    $inc: { 'amounts.refunded': entry.amount }
  },
  { new: true }
);

/** Send one queued refund entry to the gateway (lock, dedupe, refund, record). */
async function processPartialRefund(orderId, entryId, now = new Date(), { ignoreLimit = false } = {}) {
  const locked = await claimPartialRefund(orderId, entryId, now, { ignoreLimit });
  if (!locked) return PharmacyOrder.findById(orderId);
  const entry = locked.refunds.id(entryId);
  const paymentId = locked.razorpay && locked.razorpay.paymentId;
  const markDone = (refundId) => markPartialDone(orderId, entry, refundId);

  try {
    if (!gateway.isEnabled() || !paymentId) throw new Error('Payment gateway unavailable');
    if (entry.attempts > 1) {
      // An earlier attempt may have succeeded before its DB write was lost.
      const existing = await findExistingGatewayRefund(paymentId, entryId);
      if (existing) return (await markDone(existing.id)) || PharmacyOrder.findById(orderId);
    }
    const refund = await gateway.getClient().payments.refund(paymentId, {
      amount: gateway.toPaise(entry.amount),
      notes: { pharmacyOrderId: String(orderId), refundEntryId: String(entryId), reason: String(entry.reason || '').slice(0, 200) }
    });
    logger.info('Pharmacy partial refund sent', { orderId: String(orderId), amount: entry.amount, refundId: refund.id });
    return (await markDone(refund.id)) || PharmacyOrder.findById(orderId);
  } catch (err) {
    logger.error('Pharmacy partial refund failed, will retry', { orderId: String(orderId), entryId: String(entryId), error: err.message });
    monitoring.triggerAlert('pharmacy_partial_refund_failed', 1, { orderId: String(orderId) });
    return PharmacyOrder.findOneAndUpdate(
      { _id: orderId, refunds: { $elemMatch: { _id: entryId, status: { $ne: 'DONE' } } } },
      { $set: { 'refunds.$.status': 'FAILED', 'refunds.$.error': String(err.message || 'Refund failed').slice(0, 300) } },
      { new: true }
    );
  }
}

/** Worker: retry queued/failed partial refunds whose lock has lapsed. */
async function retryPartialRefunds({ now = new Date(), limit = 20 } = {}) {
  const orders = await PharmacyOrder.find({
    refunds: {
      $elemMatch: {
        status: { $in: ['PENDING', 'FAILED'] },
        attempts: { $lt: MAX_REFUND_ATTEMPTS },
        $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }]
      }
    }
  }).select('refunds').limit(limit);
  let retried = 0;
  for (const order of orders) {
    for (const entry of order.refunds) {
      if (!['PENDING', 'FAILED'].includes(entry.status)) continue;
      await processPartialRefund(order._id, entry._id, now);
      retried += 1;
    }
  }
  return { retried };
}

/**
 * If the gateway order was actually paid (e.g. tab closed before verify),
 * apply that payment. Returns true when the order turned out to be paid.
 */
async function reconcileGatewayOrder(order) {
  if (!order.razorpay?.orderId) return false;
  const razorpay = gateway.getClient();
  const gatewayOrder = await razorpay.orders.fetch(order.razorpay.orderId);
  if (gatewayOrder.status !== 'paid' && gatewayOrder.status !== 'attempted') return false;

  const { items = [] } = await razorpay.orders.fetchPayments(order.razorpay.orderId);
  const good = items.find((p) => SUCCESSFUL_PAYMENT_STATES.includes(p.status));
  if (!good) return false;

  assertPaymentMatchesOrder(order, good);
  await applyCapturedPayment(order, await captureIfAuthorized(good));
  return true;
}

/**
 * Cancel + restock PREPAID orders whose payment window lapsed. Orders are
 * reconciled with Razorpay first; if the gateway can't be reached the order
 * is skipped this round rather than cancelled on a guess.
 */
async function expireUnpaidOrders({ now = new Date(), limit = 50 } = {}) {
  // Lazy require: pharmacyService imports this module (refund on cancel).
  const { restockOrder } = require('./pharmacyService');

  const candidates = await PharmacyOrder.find({
    paymentMode: 'PREPAID',
    paymentStatus: { $in: UNPAID_STATUSES },
    status: 'PLACED',
    paymentExpiresAt: { $lte: now }
  }).limit(limit);

  let expired = 0;
  let reconciled = 0;

  for (const order of candidates) {
    try {
      if (order.razorpay?.orderId && gateway.isEnabled()) {
        if (await reconcileGatewayOrder(order)) {
          reconciled += 1;
          continue;
        }
      }
    } catch (err) {
      logger.warn('Skipping unpaid-order expiry; gateway reconcile failed', {
        orderId: String(order._id), error: err.message
      });
      continue;
    }

    const note = 'Payment not completed in time';
    const cancelled = await PharmacyOrder.findOneAndUpdate(
      { _id: order._id, status: 'PLACED', paymentStatus: { $in: UNPAID_STATUSES } },
      {
        $set: { status: 'CANCELLED', cancelledBy: 'SYSTEM', cancellationReason: note, 'milestones.cancelledAt': now },
        $push: { timeline: { status: 'CANCELLED', at: now, note } }
      },
      { new: true }
    );
    if (cancelled) {
      await restockOrder(cancelled, { kind: 'SYSTEM', reason: note });
      expired += 1;
    }
  }

  if (expired || reconciled) {
    logger.info('Unpaid pharmacy orders swept', { expired, reconciled });
  }
  return { expired, reconciled };
}

function startExpiryWorker(options = {}) {
  if (process.env.PHARMACY_PAYMENT_SWEEPER_ENABLED === 'false') return null;
  if (sweeperHandle) return sweeperHandle;

  const intervalMs = Number(options.intervalMs
    || process.env.PHARMACY_PAYMENT_SWEEP_INTERVAL_MS
    || DEFAULT_SWEEP_INTERVAL_MS);

  // Runs from a timer: nothing in here may throw, or it becomes an
  // unhandled rejection that takes the process down.
  const run = async () => {
    try {
      await expireUnpaidOrders();
    } catch (err) {
      try {
        logger.error('Unpaid pharmacy order sweep failed', { error: err.message });
        monitoring.trackError('pharmacy_payment_sweeper', err);
      } catch {
        /* never let error reporting crash the worker */
      }
    }
  };

  sweeperHandle = setInterval(run, intervalMs);
  if (typeof sweeperHandle.unref === 'function') sweeperHandle.unref();
  run();
  logger.info('Pharmacy unpaid-order sweeper started', { intervalMs });
  return sweeperHandle;
}

function stopExpiryWorker() {
  if (!sweeperHandle) return;
  clearInterval(sweeperHandle);
  sweeperHandle = null;
  logger.info('Pharmacy unpaid-order sweeper stopped');
}

module.exports = {
  getPaymentOptions,
  getPaymentTtlMs,
  isAwaitingPayment,
  EXCLUDE_AWAITING_PAYMENT,
  createGatewayOrder,
  verifyPayment,
  recordPaymentFailure,
  refundOrderPayment,
  retryFullRefunds,
  settleRefund,
  owedRefunds,
  requestPartialRefund,
  processPartialRefund,
  retryPartialRefunds,
  expireUnpaidOrders,
  startExpiryWorker,
  stopExpiryWorker
};
