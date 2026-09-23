/**
 * Settlement: turns business events into SettlementEntry rows and reports on them.
 *
 *  delivered pharmacy order → VENDOR_PAYOUT (items − commission), COMMISSION, DELIVERY_FEE
 *  completed care visit     → PROVIDER_PAYOUT (base − commission), COMMISSION, PLATFORM_FEE
 *  paid membership          → MEMBERSHIP_FEE
 *
 * Recording is idempotent (unique index) and never throws, so a ledger hiccup
 * can't fail a delivery or a visit completion; failures are logged for replay.
 */

const SettlementEntry = require('../models/settlementEntry');
const pricing = require('./pricingService');
const logger = require('../utils/logger');

async function insertIdempotent(rows, context) {
  const payable = rows.filter((r) => r.amount > 0);
  if (payable.length === 0) return 0;
  try {
    const inserted = await SettlementEntry.insertMany(payable, { ordered: false });
    return inserted.length;
  } catch (err) {
    // Duplicate keys = already recorded (replay); anything else is a real failure.
    const writeErrors = err && err.writeErrors ? err.writeErrors : [];
    const nonDuplicate = writeErrors.filter((e) => (e.code || (e.err && e.err.code)) !== 11000);
    if (err && err.code !== 11000 && (writeErrors.length === 0 || nonDuplicate.length > 0)) {
      logger.error('Settlement recording failed', { ...context, error: err.message });
    }
    return err && err.insertedDocs ? err.insertedDocs.length : 0;
  }
}

async function recordPharmacyOrder(order) {
  try {
    const split = pricing.splitPharmacyOrder(order);
    const occurredAt = order.deliveredAt || new Date();
    const source = { kind: 'PHARMACY_ORDER', id: order._id, ref: order.orderNumber };
    return await insertIdempotent([
      { source, party: { kind: 'VENDOR', id: order.vendor }, type: 'VENDOR_PAYOUT', amount: split.vendorPayout, basis: split.itemsSubtotal, rate: split.commissionRate, occurredAt },
      { source, party: { kind: 'PLATFORM' }, type: 'COMMISSION', amount: split.commission, basis: split.itemsSubtotal, rate: split.commissionRate, occurredAt, status: 'PAID' },
      { source, party: { kind: 'PLATFORM' }, type: 'DELIVERY_FEE', amount: split.deliveryFee, occurredAt, status: 'PAID' }
    ], { orderId: String(order._id) });
  } catch (err) {
    logger.error('Settlement recording failed', { orderId: String(order && order._id), error: err.message });
    return 0;
  }
}

async function recordCareBooking(booking) {
  try {
    const split = pricing.splitCareBooking(booking);
    const occurredAt = (booking.statusTimestamps && booking.statusTimestamps.completedAt) || new Date();
    const source = { kind: 'CARE_BOOKING', id: booking._id, ref: booking.serviceType };
    return await insertIdempotent([
      { source, party: { kind: 'PROVIDER', id: booking.serviceProvider }, type: 'PROVIDER_PAYOUT', amount: split.providerPayout, basis: split.basePrice, rate: split.commissionRate, occurredAt },
      { source, party: { kind: 'PLATFORM' }, type: 'COMMISSION', amount: split.commission, basis: split.basePrice, rate: split.commissionRate, occurredAt, status: 'PAID' },
      { source, party: { kind: 'PLATFORM' }, type: 'PLATFORM_FEE', amount: split.platformFee, occurredAt, status: 'PAID' }
    ], { bookingId: String(booking._id) });
  } catch (err) {
    logger.error('Settlement recording failed', { bookingId: String(booking && booking._id), error: err.message });
    return 0;
  }
}

async function recordMembership(membership) {
  try {
    return await insertIdempotent([{
      source: { kind: 'MEMBERSHIP', id: membership._id, ref: membership.plan },
      party: { kind: 'PLATFORM' },
      type: 'MEMBERSHIP_FEE',
      amount: pricing.round2(membership.amount),
      occurredAt: new Date(),
      status: 'PAID'
    }], { membershipId: String(membership._id) });
  } catch (err) {
    logger.error('Settlement recording failed', { membershipId: String(membership && membership._id), error: err.message });
    return 0;
  }
}

const PLATFORM_REVENUE_TYPES = ['COMMISSION', 'DELIVERY_FEE', 'PLATFORM_FEE', 'MEMBERSHIP_FEE'];

/** Revenue summary for [from, to): totals per entry type and per business line. */
async function getSummary({ from, to } = {}) {
  const match = {};
  if (from || to) {
    match.occurredAt = {};
    if (from) match.occurredAt.$gte = new Date(from);
    if (to) match.occurredAt.$lt = new Date(to);
  }
  const rows = await SettlementEntry.aggregate([
    { $match: match },
    { $group: { _id: { type: '$type', source: '$source.kind', status: '$status' }, amount: { $sum: '$amount' }, count: { $sum: 1 } } }
  ]);

  const byType = {};
  const byLine = { PHARMACY_ORDER: 0, CARE_BOOKING: 0, MEMBERSHIP: 0 };
  let platformRevenue = 0;
  let pendingPayouts = 0;
  for (const r of rows) {
    const { type, source, status } = r._id;
    byType[type] = pricing.round2((byType[type] || 0) + r.amount);
    if (PLATFORM_REVENUE_TYPES.includes(type)) {
      platformRevenue += r.amount;
      byLine[source] = pricing.round2(byLine[source] + r.amount);
    } else if (status === 'PENDING') {
      pendingPayouts += r.amount;
    }
  }
  const partnerEarnings = (byType.VENDOR_PAYOUT || 0) + (byType.PROVIDER_PAYOUT || 0);
  return {
    from: from || null,
    to: to || null,
    platformRevenue: pricing.round2(platformRevenue),
    partnerEarnings: pricing.round2(partnerEarnings),
    // Gross value that flowed through the platform (excludes GST).
    grossValue: pricing.round2(platformRevenue + partnerEarnings),
    pendingPayouts: pricing.round2(pendingPayouts),
    byType,
    revenueByLine: byLine
  };
}

/** Pending payouts grouped per partner (input to the weekly payout run). */
async function getPendingPayouts() {
  return SettlementEntry.aggregate([
    { $match: { status: 'PENDING', type: { $in: ['VENDOR_PAYOUT', 'PROVIDER_PAYOUT'] } } },
    { $group: { _id: { kind: '$party.kind', id: '$party.id' }, amount: { $sum: '$amount' }, entries: { $sum: 1 }, oldest: { $min: '$occurredAt' } } },
    { $sort: { amount: -1 } }
  ]).then((rows) => rows.map((r) => ({
    partyKind: r._id.kind, partyId: r._id.id, amount: pricing.round2(r.amount), entries: r.entries, oldest: r.oldest
  })));
}

module.exports = {
  recordPharmacyOrder,
  recordCareBooking,
  recordMembership,
  getSummary,
  getPendingPayouts
};
