/**
 * Nabz credit on medicine orders.
 *
 * At checkout the wallet pays first (amounts.credit); amounts.total stays what the
 * customer still owes, so cash collection, the online charge and refunds need no
 * change. Credit only ever goes down on an order (items removed, a cheaper store,
 * cancelled), and whatever the order no longer uses goes back to the wallet:
 *
 *   creditSpent     taken from the wallet when the order was placed
 *   credit          still applied to the bill (0 once cancelled or rejected)
 *   creditReturned  given back so far
 *
 * Each give-back is keyed by the credit the order keeps afterwards, so running
 * settle() twice, or the sweep and a cancel at once, returns it once.
 */

const PharmacyOrder = require('../models/pharmacyOrder');
const walletService = require('./walletService');
const { round2 } = require('./pricingService');
const logger = require('../utils/logger');

const CLOSED = ['CANCELLED', 'REJECTED'];
const spendRef = (orderId) => `pharmacy:${orderId}`;

/** Credit the order keeps: none once it is closed. */
const keptBy = (order) => (CLOSED.includes(order.status) ? 0 : round2((order.amounts && order.amounts.credit) || 0));

/**
 * Take up to `max` from the wallet for a just-created order and lower its bill.
 * Never throws: if anything fails the credit is given back and the order stays
 * at its full price.
 */
async function applyToNewOrder(order, max) {
  const want = round2(max);
  if (!(want > 0)) return order;
  let used = 0;
  try {
    used = await walletService.spend(order.patient, want, spendRef(order._id));
    if (!(used > 0)) return order;
    const updated = await PharmacyOrder.findOneAndUpdate(
      { _id: order._id, 'amounts.total': order.amounts.total },
      { $set: { 'amounts.credit': used, 'amounts.creditSpent': used, 'amounts.total': round2(order.amounts.total - used), 'amounts.originalTotal': round2(order.amounts.total - used) } },
      { returnDocument: 'after' }
    );
    if (!updated) throw new Error('Order changed while applying credit');
    logger.info('Nabz credit used on a medicine order', { orderId: String(order._id), amount: used });
    return updated;
  } catch (err) {
    logger.error('Could not apply Nabz credit; order kept at full price', { orderId: String(order._id), error: err.message });
    if (used > 0) await walletService.reverse(order.patient, spendRef(order._id)).catch(() => undefined);
    return order;
  }
}

/** Give back credit the order no longer uses. Returns what was given back. */
async function settle(order) {
  const a = (order && order.amounts) || {};
  const spent = round2(a.creditSpent || 0);
  if (!(spent > 0)) return 0;
  const kept = keptBy(order);
  const owed = round2(spent - kept - (a.creditReturned || 0));
  if (owed <= 0) return 0;
  await walletService.credit(order.patient, owed, {
    reason: kept ? `Credit your order ${order.orderNumber || ''} no longer needed`.replace('  ', ' ') : `Order ${order.orderNumber || ''} cancelled: credit returned`.replace('  ', ' '),
    ref: `pharmacy-back:${order._id}:${kept}`
  });
  await PharmacyOrder.updateOne({ _id: order._id }, { $max: { 'amounts.creditReturned': round2(spent - kept) } });
  logger.info('Nabz credit returned', { orderId: String(order._id), amount: owed, kept });
  return owed;
}

/** Minute tick: orders holding more credit than they now use. */
async function sweep({ limit = 50 } = {}) {
  const due = await PharmacyOrder.find({
    'amounts.creditSpent': { $gt: 0 },
    $expr: {
      $gt: [{
        $subtract: [
          { $subtract: ['$amounts.creditSpent', { $ifNull: ['$amounts.creditReturned', 0] }] },
          { $cond: [{ $in: ['$status', CLOSED] }, 0, { $ifNull: ['$amounts.credit', 0] }] }
        ]
      }, 0.004]
    }
  }).select('patient status amounts orderNumber').limit(limit).lean();
  let returned = 0;
  for (const order of due) {
    try {
      if (await settle(order)) returned += 1;
    } catch (err) {
      logger.error('Returning Nabz credit failed, will retry', { orderId: String(order._id), error: err.message });
    }
  }
  return { returned };
}

module.exports = { applyToNewOrder, settle, sweep, keptBy };
