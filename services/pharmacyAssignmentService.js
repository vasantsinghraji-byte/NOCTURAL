/**
 * Pharmacy Assignment Service: getting every order to a store that will
 * actually fill it.
 *
 *   accept SLA    A store must accept within `acceptSlaSeconds`. Silence moves
 *                 the order to the next best store (Zomato's order-inaction
 *                 relay). Several misses in a row auto-pause the store.
 *   decline       A store can reject (or cancel after accepting) with a reason.
 *                 Stock/capacity reasons move the order on; prescription
 *                 problems follow the order, so those cancel and refund.
 *   missing items A store can mark single items "don't have it": the item is
 *                 dropped and refunded, the store's count is zeroed, and the
 *                 rest of the order carries on (Instamart/Blinkit style).
 *
 * Concurrency rule used everywhere: every move is ONE compare-and-set on the
 * order (filter on the state we read). Whoever wins the CAS does the side
 * effects (stock, refunds, metrics); a loser undoes only what it did itself.
 * The store accepting, the customer cancelling and the timeout sweeper can
 * all race on the same order and each unit of stock still moves exactly once.
 */

const mongoose = require('mongoose');
const PharmacyOrder = require('../models/pharmacyOrder');
const PharmacyVendor = require('../models/pharmacyVendor');
const VendorInventory = require('../models/vendorInventory');
const InventoryMovement = require('../models/inventoryMovement');
const Notification = require('../models/notification');
const availability = require('./pharmacyAvailabilityService');
const pharmacyPaymentService = require('./pharmacyPaymentService');
const pharmacyNotificationService = require('./pharmacyNotificationService');
const pushNotificationService = require('./pushNotificationService');
const { getPharmacyOps } = require('../config/pharmacyOps');
const { PHARMACY_REJECTION_REASONS, PHARMACY_REASSIGNABLE_REJECTIONS } = require('../constants/enums');
const { ValidationError, NotFoundError, ConflictError, AuthorizationError } = require('../utils/errors');
const logger = require('../utils/logger');
const monitoring = require('../utils/monitoring');

const round2 = (n) => Math.round(n * 100) / 100;
const lazyPharmacyService = () => require('./pharmacyService'); // circular: pharmacyService → here

// ── Small helpers ──────────────────────────────────────────────────────────

async function recordMovements(rows) {
  const clean = rows.filter(Boolean);
  if (clean.length === 0) return;
  try {
    await InventoryMovement.insertMany(clean, { ordered: false });
  } catch (err) {
    logger.error('Inventory ledger write failed', { error: err.message, count: clean.length });
  }
}

/** In-app + push to the patient. Never throws. */
async function notifyPatient(order, title, message) {
  try {
    const data = { type: 'PHARMACY_ORDER_UPDATE', orderId: String(order._id), orderNumber: order.orderNumber };
    await Notification.create({
      user: order.patient,
      recipientModel: 'Patient',
      type: 'PHARMACY_ORDER_UPDATE',
      title,
      message,
      priority: 'HIGH',
      actionUrl: `/orders/${order._id}`,
      actionLabel: 'View order',
      channels: { inApp: true, push: true },
      metadata: data,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    await pushNotificationService.sendToOwner({ owner: order.patient, userType: 'patient', title, body: message, data })
      .catch(() => {});
  } catch (err) {
    logger.warn('Patient order notification failed', { orderId: String(order._id), error: err.message });
  }
}

const availableItems = (order) => order.items.filter((i) => (i.status || 'AVAILABLE') === 'AVAILABLE');

/**
 * Give an order's units back to a store. Items the store said it doesn't have
 * are zeroed instead (its shelf count was wrong). Already-unavailable lines
 * were zeroed when they were marked, so they're skipped.
 */
async function releaseAtStore(order, vendorId, { zeroMedicineIds = [], actor = { kind: 'SYSTEM' }, reason } = {}) {
  const zero = new Set(zeroMedicineIds.map(String));
  const rows = await Promise.all(availableItems(order).map(async (item) => {
    try {
      if (zero.has(String(item.medicine))) {
        const before = await VendorInventory.findOneAndUpdate(
          { vendor: vendorId, medicine: item.medicine },
          { $set: { stockQty: 0, stockUpdatedAt: new Date() } }
        );
        if (!before || !before.stockQty) return null;
        return { vendor: vendorId, medicine: item.medicine, type: 'MARKED_UNAVAILABLE', delta: -before.stockQty, balanceAfter: 0, order: order._id, actor, reason: reason || 'Store did not have it' };
      }
      const updated = await VendorInventory.findOneAndUpdate(
        { vendor: vendorId, medicine: item.medicine },
        { $inc: { stockQty: item.quantity } },
        { new: true }
      );
      return { vendor: vendorId, medicine: item.medicine, type: 'ORDER_RELEASED', delta: item.quantity, balanceAfter: updated ? updated.stockQty : undefined, order: order._id, actor, reason };
    } catch (err) {
      logger.error('Stock release failed', { orderId: String(order._id), vendorId: String(vendorId), error: err.message });
      return null;
    }
  }));
  await recordMovements(rows);
}

/** Reliability counters after a store's turn with an order ends. */
async function recordStoreOutcome(vendorId, outcome, { reasonCode, now = new Date() } = {}) {
  const ops = getPharmacyOps();
  try {
    if (outcome === 'ACCEPTED') {
      await PharmacyVendor.updateOne({ _id: vendorId }, { $inc: { 'reliability.accepted': 1 }, $set: { 'reliability.consecutiveMisses': 0 } });
      return;
    }
    const inc = outcome === 'TIMED_OUT'
      ? { 'reliability.timedOut': 1, 'reliability.consecutiveMisses': 1 }
      : { 'reliability.rejected': 1 };
    const vendor = await PharmacyVendor.findOneAndUpdate(
      { _id: vendorId },
      { $inc: inc, $set: { 'reliability.lastMissAt': now } },
      { new: true }
    );
    if (!vendor) return;
    // Silence N times in a row, or "we're closed": stop sending orders for a while.
    const misses = (vendor.reliability && vendor.reliability.consecutiveMisses) || 0;
    const pauseFor = outcome === 'TIMED_OUT' && misses >= ops.autoPauseAfterMisses
      ? `Missed ${misses} orders in a row`
      : reasonCode === 'STORE_CLOSED' ? 'Store said it was closed' : null;
    if (pauseFor) {
      await PharmacyVendor.updateOne({ _id: vendorId }, {
        $set: {
          pausedUntil: new Date(now.getTime() + ops.autoPauseMinutes * 60 * 1000),
          pauseReason: pauseFor,
          'reliability.consecutiveMisses': 0
        }
      });
      logger.warn('Pharmacy auto-paused', { vendorId: String(vendorId), reason: pauseFor, minutes: ops.autoPauseMinutes });
    }
  } catch (err) {
    logger.error('Store reliability update failed', { vendorId: String(vendorId), error: err.message });
  }
}

/** Home-care supplies: keep the nurse booking pointing at the right store. */
async function syncCareVisit(order, { cancelled = false } = {}) {
  if (!order.careVisit || !order.careVisit.booking) return;
  try {
    await mongoose.model('NurseBooking').updateOne(
      { _id: order.careVisit.booking },
      cancelled
        ? { $set: { 'supplies.status': 'CANCELLED' } }
        : { $set: { 'supplies.pharmacyVendor': order.vendor, 'supplies.amount': order.amounts.total } }
    );
  } catch (err) {
    logger.error('Could not update care visit supplies', { orderId: String(order._id), error: err.message });
  }
}

/**
 * CAS guard on the attempts log: matches only if nobody appended to it since
 * we read the order. Orders placed before the log existed have no field at all.
 */
function attemptsGuard(order) {
  const n = (order.assignmentAttempts || []).length;
  return n === 0
    ? { $or: [{ assignmentAttempts: { $exists: false } }, { assignmentAttempts: { $size: 0 } }] }
    : { assignmentAttempts: { $size: n } };
}

/** Attempts array with the current store's PENDING turn closed out. */
function closeCurrentAttempt(order, outcome, { reasonCode, note, now }) {
  const attempts = (order.assignmentAttempts || []).map((a) => (a.toObject ? a.toObject() : { ...a }));
  const current = [...attempts].reverse().find((a) => String(a.vendor) === String(order.vendor) && a.outcome === 'PENDING');
  if (current) {
    Object.assign(current, { outcome, reasonCode, note, resolvedAt: now });
  } else {
    attempts.push({ vendor: order.vendor, offeredAt: order.createdAt || now, outcome, reasonCode, note, resolvedAt: now });
  }
  return attempts;
}

// ── Moving an order to another store (or giving up) ───────────────────────

/**
 * Find the next store that has every remaining item at no more than the
 * price the customer already agreed to, and reserve it there.
 */
async function reserveNextStore(order, now) {
  const ops = getPharmacyOps();
  const tried = (order.assignmentAttempts || []).map((a) => String(a.vendor));
  if (!tried.includes(String(order.vendor))) tried.push(String(order.vendor));
  if (tried.length >= ops.maxAssignmentAttempts) return null;
  if (!order.deliveryLocation || !Array.isArray(order.deliveryLocation.coordinates)) return null;

  const lines = availableItems(order);
  if (lines.length === 0) return null;
  const [lng, lat] = order.deliveryLocation.coordinates;
  const plan = await availability.planCart({
    lat,
    lng,
    now,
    items: lines.map((i) => ({ medicineId: String(i.medicine), quantity: i.quantity })),
    excludeVendorIds: tried,
    maxUnitPrice: new Map(lines.map((i) => [String(i.medicine), i.unitPrice]))
  });

  const { reserveStock } = lazyPharmacyService();
  for (const option of plan._fullOptions || []) {
    const vendor = option.vendor;
    if (order.requiresPrescription && vendor.acceptsPrescriptionOrders === false) continue;
    try {
      const reserved = await reserveStock(vendor._id, lines.map((i) => ({ medicineId: String(i.medicine), quantity: i.quantity })), { now });
      return { vendor, option, reserved };
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err;
      // Sold out between planning and reserving: try the next store.
    }
  }
  return null;
}

async function undoReservation(vendorId, reserved) {
  await Promise.all((reserved || []).map((r) => VendorInventory.updateOne(
    { _id: r.inventory._id },
    { $inc: { stockQty: r.quantity } }
  ).catch((err) => logger.error('Reservation rollback failed', { vendorId: String(vendorId), error: err.message }))));
}

/**
 * Take the order away from its current store.
 *   outcome: 'REJECTED' (store declined) | 'TIMED_OUT' (store silent)
 * Returns { moved, cancelled, order } — or { changed: true } when someone
 * else moved the order first (nothing was done).
 */
async function moveOrCancel(order, {
  fromStatuses, outcome, reasonCode, note, zeroMedicineIds = [], actor = { kind: 'SYSTEM' },
  reassign = true, requireExpired = false, now = new Date()
}) {
  const ops = getPharmacyOps();
  const oldVendor = order.vendor;
  const casFilter = {
    _id: order._id,
    vendor: oldVendor,
    status: { $in: fromStatuses },
    ...attemptsGuard(order),
    ...(requireExpired ? { acceptBy: { $lte: now } } : {})
  };
  const attempts = closeCurrentAttempt(order, outcome, { reasonCode, note, now });

  const next = reassign ? await reserveNextStore(order, now) : null;
  if (next) {
    const byMed = new Map(next.option.covered.map((c) => [c.medicineId, c]));
    const items = order.items.map((item) => {
      const plain = item.toObject ? item.toObject() : { ...item };
      const offer = (plain.status || 'AVAILABLE') === 'AVAILABLE' ? byMed.get(String(plain.medicine)) : null;
      if (!offer) return plain;
      return { ...plain, unitPrice: offer.unitPrice, mrp: offer.mrp, lineTotal: round2(offer.unitPrice * plain.quantity) };
    });
    const itemsSubtotal = round2(items.filter((i) => (i.status || 'AVAILABLE') === 'AVAILABLE').reduce((s, i) => s + i.lineTotal, 0));
    const total = round2(itemsSubtotal + (order.amounts.deliveryFee || 0) + (order.amounts.tax || 0) - (order.amounts.discount || 0));
    const priceDrop = round2(order.amounts.total - total);
    const storeName = next.vendor.name || 'another pharmacy';
    const moveNote = outcome === 'TIMED_OUT'
      ? `Previous store didn't respond, moved to ${storeName}`
      : `Previous store couldn't fill it, moved to ${storeName}`;

    const moved = await PharmacyOrder.findOneAndUpdate(casFilter, {
      $set: {
        vendor: next.vendor._id,
        status: 'PLACED',
        items,
        'amounts.itemsSubtotal': itemsSubtotal,
        'amounts.total': total,
        distanceKm: next.vendor.distanceKm,
        eta: next.vendor.eta,
        acceptBy: new Date(now.getTime() + ops.acceptSlaSeconds * 1000),
        assignmentAttempts: [...attempts, { vendor: next.vendor._id, offeredAt: now, outcome: 'PENDING' }]
      },
      $push: { timeline: { status: 'PLACED', at: now, note: moveNote } }
    }, { new: true });

    if (!moved) {
      await undoReservation(next.vendor._id, next.reserved);
      return { changed: true };
    }

    await releaseAtStore(order, oldVendor, { zeroMedicineIds, actor, reason: note || moveNote });
    await recordMovements(next.reserved.map(({ inventory, quantity }) => ({
      vendor: next.vendor._id, medicine: inventory.medicine._id, type: 'ORDER_RESERVED', delta: -quantity,
      balanceAfter: inventory.stockQty, order: moved._id, actor: { kind: 'SYSTEM' }, reason: 'Order reassigned'
    })));
    await recordStoreOutcome(oldVendor, outcome, { reasonCode, now });
    await PharmacyVendor.updateOne({ _id: next.vendor._id }, { $inc: { 'reliability.offered': 1 } }).catch(() => {});
    await syncCareVisit(moved);
    if (priceDrop > 0) await pharmacyPaymentService.requestPartialRefund(moved._id, priceDrop, 'Cheaper at the new pharmacy');
    pharmacyNotificationService.notifyVendorNewOrder(moved);
    notifyPatient(moved, 'Your order moved to another pharmacy', `${storeName} is now preparing order ${moved.orderNumber}. Nothing changes for you${priceDrop > 0 ? `, and ₹${priceDrop} comes back to you` : ''}.`);
    logger.info('Pharmacy order reassigned', {
      orderId: String(moved._id), from: String(oldVendor), to: String(next.vendor._id), outcome, reasonCode
    });
    return { moved: true, order: moved };
  }

  // Nobody else can take it: cancel and refund in full.
  const cancelNote = outcome === 'TIMED_OUT'
    ? 'No nearby pharmacy accepted your order'
    : reasonCode === 'PRESCRIPTION_INVALID' || reasonCode === 'PRESCRIPTION_MISSING'
      ? 'The pharmacist could not accept the prescription'
      : 'No nearby pharmacy has these items right now';
  const endStatus = outcome === 'REJECTED' && fromStatuses.includes('PLACED') ? 'REJECTED' : 'CANCELLED';
  const cancelled = await PharmacyOrder.findOneAndUpdate(casFilter, {
    $set: {
      status: endStatus,
      cancelledBy: actor.kind === 'VENDOR' ? 'VENDOR' : 'SYSTEM',
      cancellationReason: cancelNote,
      ...(outcome === 'REJECTED' ? { rejectionReason: note || cancelNote, rejectionReasonCode: reasonCode } : {}),
      'milestones.cancelledAt': now,
      assignmentAttempts: attempts
    },
    $unset: { acceptBy: 1 },
    $push: { timeline: { status: endStatus, at: now, note: note ? `${cancelNote}: ${note}` : cancelNote } }
  }, { new: true });
  if (!cancelled) return { changed: true };

  await releaseAtStore(order, oldVendor, { zeroMedicineIds, actor, reason: note || cancelNote });
  await recordStoreOutcome(oldVendor, outcome, { reasonCode, now });
  await syncCareVisit(cancelled, { cancelled: true });
  const refunded = await pharmacyPaymentService.refundOrderPayment(cancelled, cancelNote);
  notifyPatient(cancelled, 'Order cancelled', `${cancelNote}. ${cancelled.paymentMode === 'PREPAID' ? 'Your money is on its way back.' : 'You have not been charged.'}`);
  logger.info('Pharmacy order cancelled after store turn', { orderId: String(cancelled._id), outcome, reasonCode });
  return { cancelled: true, order: refunded || cancelled };
}

// ── Store actions ──────────────────────────────────────────────────────────

async function loadStoreOrder(orderId, vendorId) {
  if (!mongoose.isValidObjectId(orderId)) throw new ValidationError('Invalid order id');
  const order = await PharmacyOrder.findById(orderId);
  if (!order) throw new NotFoundError('Order', orderId);
  if (String(order.vendor) !== String(vendorId)) throw new AuthorizationError('You can only update your own store orders');
  if (pharmacyPaymentService.isAwaitingPayment(order)) throw new ConflictError('This order is awaiting online payment');
  return order;
}

/** PLACED → ACCEPTED, closing the store's turn. Returns the updated order. */
async function acceptOrder(orderId, { vendorId, actorUserId, note, now = new Date() }) {
  const order = await loadStoreOrder(orderId, vendorId);
  if (order.status !== 'PLACED') throw new ConflictError(`Cannot accept an order that is ${order.status}`);
  const updated = await PharmacyOrder.findOneAndUpdate(
    { _id: order._id, vendor: vendorId, status: 'PLACED', ...attemptsGuard(order) },
    {
      $set: {
        status: 'ACCEPTED',
        assignmentAttempts: closeCurrentAttempt(order, 'ACCEPTED', { now }),
        ...(order.milestones && order.milestones.acceptedAt ? {} : { 'milestones.acceptedAt': now })
      },
      $unset: { acceptBy: 1 },
      $push: { timeline: { status: 'ACCEPTED', at: now, note, by: actorUserId } }
    },
    { new: true }
  );
  if (!updated) throw new ConflictError('This order was just moved or cancelled. Refresh your orders.');
  await recordStoreOutcome(vendorId, 'ACCEPTED', { now });
  return updated;
}

/**
 * Store turns the order down (before accepting) or cancels it (after).
 * Stock/capacity reasons → next store; prescription/other → cancel + refund.
 */
async function declineOrder(orderId, {
  vendorId, actorUserId, reasonCode = 'OTHER', note, unavailableMedicineIds = [], now = new Date()
}) {
  if (!PHARMACY_REJECTION_REASONS.includes(reasonCode)) throw new ValidationError('Invalid rejection reason');
  const order = await loadStoreOrder(orderId, vendorId);
  const fromStatuses = order.status === 'PLACED' ? ['PLACED'] : ['ACCEPTED', 'PREPARING'];
  if (!fromStatuses.includes(order.status)) throw new ConflictError(`Cannot decline an order that is ${order.status}`);

  const orderMeds = new Set(availableItems(order).map((i) => String(i.medicine)));
  const zero = reasonCode === 'OUT_OF_STOCK' ? unavailableMedicineIds.map(String).filter((id) => orderMeds.has(id)) : [];
  const result = await moveOrCancel(order, {
    fromStatuses,
    outcome: 'REJECTED',
    reasonCode,
    note,
    zeroMedicineIds: zero,
    actor: { kind: 'VENDOR', id: actorUserId },
    reassign: PHARMACY_REASSIGNABLE_REJECTIONS.includes(reasonCode),
    now
  });
  if (result.changed) throw new ConflictError('This order was just moved or cancelled. Refresh your orders.');
  return result.order;
}

/**
 * Store has the order but not every item. Drop those lines, refund them,
 * zero the store's count. If nothing is left, it's a full out-of-stock decline.
 */
async function markItemsUnavailable(orderId, { vendorId, actorUserId, medicineIds = [], reason, now = new Date() }) {
  const order = await loadStoreOrder(orderId, vendorId);
  if (!['PLACED', 'ACCEPTED'].includes(order.status)) {
    throw new ConflictError('Items can only be changed before the order is packed');
  }
  const ids = new Set(medicineIds.map(String));
  const hits = availableItems(order).filter((i) => ids.has(String(i.medicine)));
  if (hits.length === 0) throw new ValidationError('None of those items are in this order');

  if (hits.length === availableItems(order).length) {
    return declineOrder(orderId, {
      vendorId, actorUserId, reasonCode: 'OUT_OF_STOCK', note: reason || 'No items in stock', unavailableMedicineIds: [...ids], now
    });
  }

  const items = order.items.map((item) => {
    const plain = item.toObject ? item.toObject() : { ...item };
    if (ids.has(String(plain.medicine)) && (plain.status || 'AVAILABLE') === 'AVAILABLE') {
      return { ...plain, status: 'UNAVAILABLE', unavailableReason: String(reason || 'Not in stock at the store').slice(0, 200) };
    }
    return plain;
  });
  const itemsSubtotal = round2(items.filter((i) => (i.status || 'AVAILABLE') === 'AVAILABLE').reduce((s, i) => s + i.lineTotal, 0));
  const total = round2(itemsSubtotal + (order.amounts.deliveryFee || 0) + (order.amounts.tax || 0) - (order.amounts.discount || 0));
  const removed = round2(order.amounts.total - total);
  const names = hits.map((i) => i.name).join(', ');

  const updated = await PharmacyOrder.findOneAndUpdate(
    { _id: order._id, vendor: vendorId, status: order.status, 'amounts.total': order.amounts.total },
    {
      $set: { items, 'amounts.itemsSubtotal': itemsSubtotal, 'amounts.total': total },
      $push: { timeline: { status: order.status, at: now, note: `Not available: ${names}`, by: actorUserId } }
    },
    { new: true }
  );
  if (!updated) throw new ConflictError('This order just changed. Refresh and try again.');

  // The shelf doesn't have them: zero the count (the reserved units never existed).
  const rows = await Promise.all(hits.map(async (item) => {
    const before = await VendorInventory.findOneAndUpdate(
      { vendor: vendorId, medicine: item.medicine },
      { $set: { stockQty: 0, stockUpdatedAt: now } }
    ).catch(() => null);
    return before && before.stockQty
      ? { vendor: vendorId, medicine: item.medicine, type: 'MARKED_UNAVAILABLE', delta: -before.stockQty, balanceAfter: 0, order: order._id, actor: { kind: 'VENDOR', id: actorUserId }, reason: 'Marked unavailable on an order' }
      : null;
  }));
  await recordMovements(rows);
  await PharmacyVendor.updateOne({ _id: vendorId }, { $inc: { 'reliability.itemsMarkedUnavailable': hits.length } }).catch(() => {});
  await syncCareVisit(updated);

  const final = removed > 0 ? await pharmacyPaymentService.requestPartialRefund(updated._id, removed, `Not available: ${names}`.slice(0, 200)) : updated;
  notifyPatient(updated, 'An item in your order is unavailable', `${names} ${hits.length > 1 ? "aren't" : "isn't"} available at the pharmacy, so ${hits.length > 1 ? "they've" : "it's"} been removed${updated.paymentMode === 'PREPAID' ? ` and ₹${removed} refunded` : ` and ₹${removed} taken off your bill`}. The rest of your order is on its way.`);
  return final || updated;
}

// ── Worker ─────────────────────────────────────────────────────────────────

/** Orders whose store didn't accept in time → next store (or cancel). */
async function sweepAcceptanceTimeouts({ now = new Date(), limit = 25 } = {}) {
  const due = await PharmacyOrder.find({ status: 'PLACED', acceptBy: { $lte: now } })
    .sort({ acceptBy: 1 })
    .limit(limit);
  let moved = 0;
  let cancelled = 0;
  for (const order of due) {
    if (pharmacyPaymentService.isAwaitingPayment(order)) continue; // store can't see it yet
    try {
      const result = await moveOrCancel(order, {
        fromStatuses: ['PLACED'], outcome: 'TIMED_OUT', note: 'Store did not respond in time', requireExpired: true, now
      });
      if (result.moved) moved += 1;
      if (result.cancelled) cancelled += 1;
    } catch (err) {
      logger.error('Acceptance timeout handling failed', { orderId: String(order._id), error: err.message });
    }
  }
  if (moved || cancelled) logger.info('Pharmacy acceptance sweep', { moved, cancelled });
  return { moved, cancelled };
}

let workerHandle = null;

function startWorker(options = {}) {
  if (process.env.PHARMACY_ASSIGNMENT_WORKER_ENABLED === 'false') return null;
  if (workerHandle) return workerHandle;
  const intervalMs = Number(options.intervalMs || getPharmacyOps().sweepIntervalMs);
  let running = false;
  // Timer callback: must never throw (an unhandled rejection kills the process).
  const run = async () => {
    if (running) return; // a slow sweep must not overlap the next one
    running = true;
    try {
      await sweepAcceptanceTimeouts();
      await pharmacyPaymentService.retryPartialRefunds();
    } catch (err) {
      try {
        logger.error('Pharmacy assignment sweep failed', { error: err.message });
        monitoring.trackError('pharmacy_assignment_worker', err);
      } catch {
        /* never let error reporting crash the worker */
      }
    } finally {
      running = false;
    }
  };
  workerHandle = setInterval(run, intervalMs);
  if (typeof workerHandle.unref === 'function') workerHandle.unref();
  logger.info('Pharmacy assignment worker started', { intervalMs });
  return workerHandle;
}

function stopWorker() {
  if (!workerHandle) return;
  clearInterval(workerHandle);
  workerHandle = null;
}

module.exports = {
  acceptOrder,
  declineOrder,
  markItemsUnavailable,
  sweepAcceptanceTimeouts,
  moveOrCancel,
  releaseAtStore,
  attemptsGuard,
  closeCurrentAttempt,
  recordStoreOutcome,
  startWorker,
  stopWorker
};
