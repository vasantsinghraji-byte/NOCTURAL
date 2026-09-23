/**
 * Pricing & revenue split: pure functions over config/revenue.js.
 *
 * Customer side:  delivery fee (base × zone surge + night surcharge, waived for
 *                 Nabz Plus or big baskets) and the care platform fee.
 * Partner side:   commission taken from the store's item value / the provider's
 *                 visit price → payout.
 * Everything is rounded to paise.
 */

const { getRevenuePolicy } = require('../config/revenue');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Hour of day (0-23) in the policy's timezone. */
function localHour(now, timezone) {
  const hour = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: timezone }).format(now);
  return Number(hour);
}

function isNight(now, { nightStartHour, nightEndHour, timezone }) {
  const h = localHour(now, timezone);
  return nightStartHour > nightEndHour
    ? h >= nightStartHour || h < nightEndHour // wraps midnight (22 → 6)
    : h >= nightStartHour && h < nightEndHour;
}

/**
 * Delivery fee for a pharmacy order.
 * @returns {{ deliveryFee, breakdown: { base, surgeMultiplier, surgeAmount, nightSurcharge, waiver } }}
 */
function quoteDeliveryFee({ vendor, zone, itemsSubtotal = 0, isMember = false, fulfilment = 'DELIVERY', now = new Date() }) {
  const policy = getRevenuePolicy().pharmacy;
  const empty = { base: 0, surgeMultiplier: 1, surgeAmount: 0, nightSurcharge: 0 };

  if (fulfilment === 'STAFF_PICKUP') {
    return { deliveryFee: 0, breakdown: { ...empty, waiver: 'STAFF_PICKUP' } };
  }

  const base = vendor && Number.isFinite(Number(vendor.deliveryFee)) ? Number(vendor.deliveryFee) : policy.defaultDeliveryFee;
  const stressLevel = zone && zone.stress && typeof zone.currentRadiusMultiplier === 'function' && zone.currentRadiusMultiplier(now) < 1
    ? zone.stress.level
    : 'NORMAL';
  const surgeMultiplier = policy.surgeMultiplier[stressLevel] || 1;
  const surgeAmount = round2(base * (surgeMultiplier - 1));
  const nightSurcharge = isNight(now, policy) ? policy.nightSurcharge : 0;
  const breakdown = { base: round2(base), surgeMultiplier, surgeAmount, nightSurcharge };

  if (isMember && policy.memberFreeDelivery) return { deliveryFee: 0, breakdown: { ...breakdown, waiver: 'MEMBER' } };
  if (policy.freeDeliveryAbove > 0 && itemsSubtotal >= policy.freeDeliveryAbove) {
    // Big baskets ride free at normal times; surge and night still apply (riders cost more then).
    return { deliveryFee: round2(surgeAmount + nightSurcharge), breakdown: { ...breakdown, waiver: 'FREE_ABOVE' } };
  }
  return { deliveryFee: round2(base + surgeAmount + nightSurcharge), breakdown: { ...breakdown, waiver: null } };
}

/**
 * Customer price for a home-care visit. Keeps the existing formula
 * (fee = base × rate, GST on base + fee) and waives the fee for members.
 */
function quoteCareVisit({ basePrice, isMember = false }) {
  const policy = getRevenuePolicy();
  const waived = isMember && policy.care.memberFeeWaived;
  const platformFee = waived ? 0 : round2(basePrice * policy.care.customerFeeRate);
  const gst = round2((basePrice + platformFee) * policy.gstRate);
  const totalAmount = round2(basePrice + platformFee + gst);
  return { basePrice: round2(basePrice), platformFee, gst, discount: 0, totalAmount, payableAmount: totalAmount, memberFeeWaived: waived };
}

/** Who earns what on a delivered pharmacy order. */
function splitPharmacyOrder(order) {
  const rate = getRevenuePolicy().pharmacy.commissionRate;
  const items = round2(order.amounts && order.amounts.itemsSubtotal);
  const commission = round2(items * rate);
  return {
    commissionRate: rate,
    itemsSubtotal: items,
    commission,
    vendorPayout: round2(items - commission),
    deliveryFee: round2(order.amounts && order.amounts.deliveryFee)
  };
}

/** Who earns what on a completed home-care visit. */
function splitCareBooking(booking) {
  const rate = getRevenuePolicy().care.providerCommissionRate;
  const base = round2(booking.pricing && booking.pricing.basePrice);
  const commission = round2(base * rate);
  return {
    commissionRate: rate,
    basePrice: base,
    commission,
    providerPayout: round2(base - commission),
    platformFee: round2(booking.pricing && booking.pricing.platformFee)
  };
}

module.exports = {
  quoteDeliveryFee,
  quoteCareVisit,
  splitPharmacyOrder,
  splitCareBooking,
  isNight,
  round2
};
