/**
 * Pricing & revenue split: pure functions over config/revenue.js.
 *
 * Customer side:  delivery fee ((base + distance charge) × zone surge + night
 *                 surcharge, waived for Nabz Plus or baskets at or above the
 *                 free-delivery threshold) and the care platform fee.
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
 * Delivery fee for a pharmacy order. `distanceKm` is the straight-line
 * distance from the store to the delivery point.
 * @returns {{ deliveryFee, breakdown: { base, distanceKm, chargedKm, distanceCharge, surgeMultiplier,
 *   surgeAmount, nightSurcharge, freeDeliveryAbove, amountToFreeDelivery, waiver } }}
 */
function quoteDeliveryFee({ vendor, zone, itemsSubtotal = 0, distanceKm, isMember = false, fulfilment = 'DELIVERY', now = new Date() }) {
  const revenue = getRevenuePolicy();
  const policy = revenue.pharmacy;
  const freeAbove = policy.freeDeliveryAbove;
  const empty = { base: 0, distanceKm: null, chargedKm: 0, distanceCharge: 0, surgeMultiplier: 1, surgeAmount: 0, nightSurcharge: 0, freeDeliveryAbove: freeAbove, amountToFreeDelivery: 0 };

  if (fulfilment === 'STAFF_PICKUP') {
    return { deliveryFee: 0, breakdown: { ...empty, waiver: 'STAFF_PICKUP' } };
  }

  // A store fee of 0 is the schema default, not a promise of free delivery.
  const storeFee = vendor ? Number(vendor.deliveryFee) : NaN;
  const base = Number.isFinite(storeFee) && storeFee > 0 ? storeFee : policy.defaultDeliveryFee;

  // Distance part: road km (straight line × road factor, as for care travel),
  // rounded up; the base covers the first deliveryIncludedKm. Unknown distance
  // (no delivery point sent) charges the base only.
  const straightKm = Number(distanceKm);
  const known = distanceKm !== undefined && distanceKm !== null && Number.isFinite(straightKm) && straightKm >= 0;
  const chargedKm = known ? Math.ceil(Math.round(straightKm * revenue.care.travel.roadFactor * 10) / 10 - 1e-9) : 0;
  const extraKm = Math.max(0, chargedKm - policy.deliveryIncludedKm);
  const distanceCharge = round2(Math.min(extraKm * policy.deliveryPerKm, Math.max(0, policy.deliveryMaxFee - base)));
  const fee = round2(base + distanceCharge);

  const stressLevel = zone && zone.stress && typeof zone.currentRadiusMultiplier === 'function' && zone.currentRadiusMultiplier(now) < 1
    ? zone.stress.level
    : 'NORMAL';
  const surgeMultiplier = policy.surgeMultiplier[stressLevel] || 1;
  const surgeAmount = round2(fee * (surgeMultiplier - 1));
  const nightSurcharge = isNight(now, policy) ? policy.nightSurcharge : 0;
  const breakdown = {
    base: round2(base),
    distanceKm: known ? round2(straightKm) : null,
    chargedKm,
    distanceCharge,
    surgeMultiplier,
    surgeAmount,
    nightSurcharge,
    freeDeliveryAbove: freeAbove,
    amountToFreeDelivery: 0
  };

  if (isMember && policy.memberFreeDelivery) return { deliveryFee: 0, breakdown: { ...breakdown, waiver: 'MEMBER' } };
  if (freeAbove > 0 && itemsSubtotal >= freeAbove) {
    // Baskets at or above the threshold ride free at normal times; surge and night still apply (riders cost more then).
    return { deliveryFee: round2(surgeAmount + nightSurcharge), breakdown: { ...breakdown, waiver: 'FREE_ABOVE' } };
  }
  const amountToFreeDelivery = freeAbove > 0 ? round2(freeAbove - itemsSubtotal) : 0;
  return { deliveryFee: round2(fee + surgeAmount + nightSurcharge), breakdown: { ...breakdown, amountToFreeDelivery, waiver: null } };
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

// ── Care marketplace (docs/product/PROVIDER_MARKETPLACE_PLAN.md) ───────────
// Worked in paise (whole numbers) per session, then × sessions, so a plan's
// total always equals the sum of its sessions.
const toPaise = (rupees) => Math.round((Number(rupees) || 0) * 100);
const toRupees = (paise) => paise / 100;

/**
 * Home-visit travel fee: road km (straight line × road factor until a maps
 * service is connected), rounded up to the next km, × the shop's ₹/km, with
 * the Nabz minimum. One-way, charged per home session.
 */
function quoteTravel({ straightKm, ratePerKm }) {
  const t = getRevenuePolicy().care.travel;
  const roadKm = Math.round(Math.max(0, Number(straightKm) || 0) * t.roadFactor * 10) / 10;
  const chargedKm = Math.max(1, Math.ceil(roadKm - 1e-9));
  const rate = Number(ratePerKm) || 0;
  const fee = Math.max(t.minFee, chargedKm * rate);
  return { straightKm: round2(straightKm), roadKm, chargedKm, ratePerKm: rate, fee: round2(fee) };
}

/** The best multi-session discount the shop gives for this many sessions. */
function sessionDiscountPercent(tiers, sessions) {
  return (tiers || []).reduce((best, t) => (sessions >= t.minSessions && t.percent > best ? t.percent : best), 0);
}

/**
 * The bill for a marketplace plan of `sessions` sessions.
 *   PREPAID     → the shop's multi-session discount applies
 *   PER_SESSION → no discount; each visit costs `perSessionPayable`
 * Nabz fee on the service only (not travel). GST: on the Nabz fee only when
 * health care is exempt (config gstHealthcareExempt), else on the whole bill.
 */
function quoteCarePlan({ listPrice, sessions, mode, travelPerSession = 0, discountTiers = [], paymentMode, isMember = false, discountPercent: fixedDiscount }) {
  const policy = getRevenuePolicy();
  const n = Math.max(1, Math.floor(Number(sessions) || 1));
  // fixedDiscount: re-pricing one session of a booked plan at its locked discount.
  const discountPercent = Number.isFinite(fixedDiscount) ? fixedDiscount
    : paymentMode === 'PREPAID' && n > 1 ? sessionDiscountPercent(discountTiers, n) : 0;
  const waived = isMember && policy.care.memberFeeWaived;

  const listP = toPaise(listPrice);
  const serviceP = Math.round((listP * (100 - discountPercent)) / 100);
  const travelP = mode === 'HOME' ? toPaise(travelPerSession) : 0;
  const feeP = waived ? 0 : Math.round(serviceP * policy.care.customerFeeRate);
  const taxableP = policy.gstHealthcareExempt ? feeP : serviceP + travelP + feeP;
  const gstP = Math.round(taxableP * policy.gstRate);
  const perSessionP = serviceP + travelP + feeP + gstP;

  const amounts = {
    sessions: n,
    listPricePerSession: toRupees(listP),
    discountPercent,
    servicePerSession: toRupees(serviceP),
    serviceSubtotal: toRupees(listP * n),
    discount: toRupees((listP - serviceP) * n),
    travelPerSession: toRupees(travelP),
    travelTotal: toRupees(travelP * n),
    platformFeePerSession: toRupees(feeP),
    platformFee: toRupees(feeP * n),
    gstPerSession: toRupees(gstP),
    gst: toRupees(gstP * n),
    perSessionPayable: toRupees(perSessionP),
    total: toRupees(perSessionP * n),
    memberFeeWaived: waived
  };
  const rs = (v) => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const lines = [
    { code: 'SERVICE', label: `${n} session${n > 1 ? 's' : ''} × ${rs(amounts.listPricePerSession)}`, amount: amounts.serviceSubtotal },
    ...(amounts.discount > 0 ? [{ code: 'DISCOUNT', label: `${discountPercent}% off for ${n} sessions`, amount: -amounts.discount }] : []),
    ...(travelP > 0 ? [{ code: 'TRAVEL', label: `Travel ${rs(amounts.travelPerSession)} × ${n}`, amount: amounts.travelTotal }] : []),
    { code: 'PLATFORM_FEE', label: waived ? 'Nabz fee (waived for Plus)' : 'Nabz fee', amount: amounts.platformFee },
    { code: 'GST', label: 'GST', amount: amounts.gst }
  ];
  return { ...amounts, lines };
}

/** Who earns what on a delivered pharmacy order. */
// A referral credit can lower the rate for one job (commissionOverride).
const rateFor = (doc, normal) => (doc && doc.commissionOverride && Number.isFinite(doc.commissionOverride.rate) ? doc.commissionOverride.rate : normal);

function splitPharmacyOrder(order) {
  const rate = rateFor(order, getRevenuePolicy().pharmacy.commissionRate);
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
  const rate = rateFor(booking, getRevenuePolicy().care.providerCommissionRate);
  const base = round2(booking.pricing && booking.pricing.basePrice);
  const commission = round2(base * rate);
  // Marketplace home visits: the travel fee covers the provider's trip, no commission.
  const travelFee = round2(booking.pricing && booking.pricing.travelFee);
  return {
    commissionRate: rate,
    basePrice: base,
    commission,
    travelFee,
    providerPayout: round2(base - commission + travelFee),
    platformFee: round2(booking.pricing && booking.pricing.platformFee)
  };
}

module.exports = {
  quoteDeliveryFee,
  quoteCareVisit,
  quoteTravel,
  quoteCarePlan,
  sessionDiscountPercent,
  splitPharmacyOrder,
  splitCareBooking,
  isNight,
  round2
};
