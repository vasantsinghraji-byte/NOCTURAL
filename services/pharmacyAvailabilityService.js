/**
 * Pharmacy Availability Service — "which store near me has this, and which
 * store should get my cart?"
 *
 * One engine for search, cart planning, checkout and reassignment so they
 * never disagree about what is sellable:
 *
 *   sellable = store can trade now (approved, open, not paused, licence valid,
 *              inside its hours, delivers here)
 *            ∧ product may be sold online (not banned / discontinued / Schedule X)
 *            ∧ listed ∧ enough units ∧ not expiring inside the minimum shelf life
 *            ∧ cold-chain products only from stores with a fridge
 *            ∧ prescription products only from stores taking Rx orders
 *
 * Ranking (lower score wins): full cart coverage first, then a blend of ETA,
 * price, the store's acceptance record and how fresh its stock count is —
 * the same inputs quick-commerce players use to pick a fulfilment node.
 */

const mongoose = require('mongoose');
const Medicine = require('../models/medicine');
const VendorInventory = require('../models/vendorInventory');
const PharmacyDemandSignal = require('../models/pharmacyDemandSignal');
const serviceability = require('./serviceabilityService');
const { getPharmacyOps, minExpiryDate } = require('../config/pharmacyOps');
const { geohashForPoint } = require('../utils/geohash');
const { ValidationError, NotFoundError } = require('../utils/errors');
const logger = require('../utils/logger');

const round2 = (n) => Math.round(n * 100) / 100;

/** Mongo filter for a listing that can be sold now (quantity checked separately). */
function sellableListingFilter(now = new Date()) {
  return {
    isAvailable: true,
    stockQty: { $gt: 0 },
    $or: [{ expiryDate: null }, { expiryDate: { $gte: minExpiryDate(now) } }]
  };
}

/**
 * Smoothed acceptance rate: new stores start near 90% and move with evidence,
 * so one missed order doesn't bury a store with 2 orders of history.
 */
function acceptanceRate(vendor) {
  const r = (vendor && vendor.reliability) || {};
  const offered = Number(r.offered) || 0;
  const accepted = Number(r.accepted) || 0;
  return (accepted + 9) / (offered + 10);
}

/**
 * Lower is better. ~₹20 of price ≈ 1 minute of ETA; a store that accepts
 * half its orders pays a 15-minute penalty; each stale count costs 5.
 * Pure — unit-tested.
 */
function rankScore({ etaMinutes = 30, subtotal = 0, acceptRate = 0.9, staleItems = 0 }) {
  return round2(etaMinutes + subtotal * 0.05 + (1 - acceptRate) * 30 + staleItems * 5);
}

const etaMinutesOf = (vendor, now) => {
  const promised = vendor.eta && vendor.eta.promisedAt ? new Date(vendor.eta.promisedAt) : null;
  return promised ? Math.max(1, Math.round((promised.getTime() - now.getTime()) / 60000)) : 30;
};

/** Can this store sell this product at all (independent of stock)? */
function storeCanSell(vendor, medicine) {
  if (medicine.coldChain && !vendor.hasColdStorage) return false;
  if (medicine.requiresPrescription && vendor.acceptsPrescriptionOrders === false) return false;
  return true;
}

function isStale(row, now, ops) {
  if (!row.stockUpdatedAt) return true;
  return now.getTime() - new Date(row.stockUpdatedAt).getTime() > ops.staleStockHours * 60 * 60 * 1000;
}

function vendorSummary(vendor, now) {
  return {
    id: vendor._id,
    name: vendor.name,
    address: vendor.address,
    distanceKm: vendor.distanceKm,
    etaMinutes: etaMinutesOf(vendor, now),
    acceptsPrescriptionOrders: vendor.acceptsPrescriptionOrders !== false,
    hasColdStorage: !!vendor.hasColdStorage
  };
}

function saleBlockMessage(medicine, reason) {
  const name = medicine ? medicine.name : 'This item';
  switch (reason) {
    case 'BANNED': return `${name} is banned and can't be sold`;
    case 'DISCONTINUED': return `${name} has been discontinued`;
    case 'SCHEDULE_X': return `${name} is a Schedule X drug and can't be ordered online`;
    case 'INACTIVE': return `${name} is no longer sold`;
    default: return `${name} is not available`;
  }
}

/** Record "nobody near here had it" (fire-and-forget; never throws). */
async function recordUnmetDemand(medicineId, point, now = new Date()) {
  try {
    const hash = geohashForPoint(point, 5);
    if (!hash || !medicineId) return;
    await PharmacyDemandSignal.updateOne(
      { medicine: medicineId, geohash: hash, day: now.toISOString().slice(0, 10) },
      { $inc: { unmet: 1 } },
      { upsert: true }
    );
  } catch (err) {
    logger.warn('Demand signal not recorded', { error: err.message });
  }
}

/** Serviceable, trading stores for a point, with ETA and distance. */
async function tradingStoresNear(point, ops, { excludeVendorIds = [] } = {}) {
  const [lng, lat] = point.coordinates;
  const { vendors, serviceability: area } = await serviceability.findServiceableVendors({
    lat, lng, limit: ops.planCandidateStores
  });
  const excluded = new Set(excludeVendorIds.map(String));
  return { vendors: vendors.filter((v) => !excluded.has(String(v._id))), area };
}

/**
 * Same-salt alternatives sellable near the customer, cheapest per unit first.
 * Offered to the customer — never swapped in silently (prescription brand
 * choice stays the patient's and doctor's decision).
 */
async function findSubstitutes(medicine, vendors, { quantity = 1, now = new Date(), limit = 5 } = {}) {
  if (!medicine || !medicine.saltKey || vendors.length === 0) return [];
  const alternatives = await Medicine.find({
    saltKey: medicine.saltKey,
    _id: { $ne: medicine._id },
    isActive: true,
    isBanned: { $ne: true },
    isDiscontinued: { $ne: true },
    scheduleType: { $ne: 'SCHEDULE_X' }
  }).limit(20).lean();
  if (alternatives.length === 0) return [];

  const byId = new Map(vendors.map((v) => [String(v._id), v]));
  const rows = await VendorInventory.find({
    vendor: { $in: vendors.map((v) => v._id) },
    medicine: { $in: alternatives.map((m) => m._id) },
    ...sellableListingFilter(now),
    stockQty: { $gte: quantity }
  }).select('vendor medicine sellingPrice mrp').lean();

  const result = [];
  for (const alt of alternatives) {
    const offers = rows.filter((r) => String(r.medicine) === String(alt._id))
      .filter((r) => storeCanSell(byId.get(String(r.vendor)), alt));
    if (offers.length === 0) continue;
    const cheapest = offers.reduce((a, b) => (b.sellingPrice < a.sellingPrice ? b : a));
    const fastest = Math.min(...offers.map((o) => etaMinutesOf(byId.get(String(o.vendor)), now)));
    result.push({
      medicine: {
        id: alt._id, name: alt.name, brand: alt.brand, manufacturer: alt.manufacturer,
        packSize: alt.packSize, packUnits: alt.packUnits, requiresPrescription: !!alt.requiresPrescription
      },
      fromPrice: cheapest.sellingPrice,
      unitPrice: alt.packUnits ? round2(cheapest.sellingPrice / alt.packUnits) : undefined,
      storeCount: offers.length,
      fastestEtaMinutes: fastest
    });
  }
  return result
    .sort((a, b) => (a.unitPrice ?? a.fromPrice) - (b.unitPrice ?? b.fromPrice))
    .slice(0, limit);
}

/**
 * Stores near (lat, lng) that can sell `quantity` of one medicine now, best
 * first — plus same-salt substitutes when nobody (or few) has it.
 */
async function getMedicineAvailability({ medicineId, lat, lng, quantity = 1, now = new Date() }) {
  if (!mongoose.isValidObjectId(medicineId)) throw new ValidationError('Invalid medicine id');
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const point = serviceability.toPoint(lat, lng);
  const ops = getPharmacyOps();

  const medicine = await Medicine.findById(medicineId).lean();
  if (!medicine) throw new NotFoundError('Medicine', medicineId);
  const blocked = Medicine.onlineSaleBlockReason(medicine);
  if (blocked) {
    return { medicine, blocked, message: saleBlockMessage(medicine, blocked), stores: [], substitutes: [] };
  }

  const { vendors, area } = await tradingStoresNear(point, ops);
  const eligible = vendors.filter((v) => storeCanSell(v, medicine));
  const rows = eligible.length ? await VendorInventory.find({
    vendor: { $in: eligible.map((v) => v._id) },
    medicine: medicine._id,
    ...sellableListingFilter(now),
    stockQty: { $gte: qty }
  }).lean() : [];

  const byId = new Map(eligible.map((v) => [String(v._id), v]));
  const stores = rows.map((row) => {
    const vendor = byId.get(String(row.vendor));
    const stale = isStale(row, now, ops);
    return {
      store: vendorSummary(vendor, now),
      sellingPrice: row.sellingPrice,
      mrp: row.mrp,
      discountPercentage: row.discountPercentage,
      // Exact counts are the store's business; "LOW" nudges the customer.
      stockLevel: row.stockQty <= (row.lowStockThreshold || 5) ? 'LOW' : 'IN_STOCK',
      confidence: stale ? 'LIKELY' : 'CONFIRMED',
      score: rankScore({
        etaMinutes: etaMinutesOf(vendor, now),
        subtotal: row.sellingPrice * qty,
        acceptRate: acceptanceRate(vendor),
        staleItems: stale ? 1 : 0
      })
    };
  }).sort((a, b) => a.score - b.score);

  if (stores.length === 0) recordUnmetDemand(medicine._id, point, now);
  const substitutes = stores.length < 2 ? await findSubstitutes(medicine, eligible, { quantity: qty, now }) : [];

  return {
    medicine,
    serviceable: area.serviceable,
    reason: area.reason,
    storeCount: stores.length,
    fromPrice: stores.length ? Math.min(...stores.map((s) => s.sellingPrice)) : undefined,
    stores,
    substitutes
  };
}

/** Merge duplicate lines ({A,1},{A,2} → {A,3}); validate shape. */
function normalizeCartItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw new ValidationError('At least one item is required');
  const merged = new Map();
  for (const item of items) {
    const id = item && String(item.medicineId || '');
    const qty = Number(item && item.quantity);
    if (!mongoose.isValidObjectId(id) || !Number.isInteger(qty) || qty < 1) {
      throw new ValidationError('Each item needs a valid medicineId and quantity >= 1');
    }
    merged.set(id, (merged.get(id) || 0) + qty);
  }
  if (merged.size > 50) throw new ValidationError('A cart can hold at most 50 different items');
  return [...merged.entries()].map(([medicineId, quantity]) => ({ medicineId, quantity }));
}

/**
 * Per-store view of a cart: which lines each store can fill, at what price.
 * `maxUnitPrice` (reassignment) drops offers dearer than what the customer
 * already agreed to pay.
 */
function coverageByStore(vendors, lines, rows, now, ops, { maxUnitPrice } = {}) {
  const rowsByVendor = new Map();
  for (const row of rows) {
    const key = String(row.vendor);
    if (!rowsByVendor.has(key)) rowsByVendor.set(key, new Map());
    rowsByVendor.get(key).set(String(row.medicine), row);
  }
  return vendors.map((vendor) => {
    const stock = rowsByVendor.get(String(vendor._id)) || new Map();
    const covered = [];
    const missing = [];
    let subtotal = 0;
    let staleItems = 0;
    for (const line of lines) {
      const row = stock.get(String(line.medicine._id));
      const priceCap = maxUnitPrice && maxUnitPrice.get(String(line.medicine._id));
      const ok = row && row.stockQty >= line.quantity && storeCanSell(vendor, line.medicine)
        && (priceCap === undefined || row.sellingPrice <= priceCap);
      if (!ok) {
        missing.push(String(line.medicine._id));
        continue;
      }
      const stale = isStale(row, now, ops);
      if (stale) staleItems += 1;
      subtotal += row.sellingPrice * line.quantity;
      covered.push({
        medicineId: String(line.medicine._id),
        name: line.medicine.name,
        quantity: line.quantity,
        unitPrice: row.sellingPrice,
        mrp: row.mrp,
        lineTotal: round2(row.sellingPrice * line.quantity),
        confidence: stale ? 'LIKELY' : 'CONFIRMED'
      });
    }
    const etaMinutes = etaMinutesOf(vendor, now);
    return {
      store: vendorSummary(vendor, now),
      vendor,
      covered,
      missing,
      subtotal: round2(subtotal),
      score: rankScore({ etaMinutes, subtotal, acceptRate: acceptanceRate(vendor), staleItems })
    };
  }).filter((opt) => opt.covered.length > 0)
    .sort((a, b) => (b.covered.length - a.covered.length) || (a.score - b.score));
}

const publicOption = ({ vendor, ...rest }) => rest; // eslint-disable-line no-unused-vars

/**
 * Plan a cart for a delivery point.
 *   best   — one store that has everything (preferred: one bag, one rider).
 *   split  — else up to `maxSplitStores` stores that together have everything.
 *   partial — else the store covering most, with what's missing.
 * Missing lines come back with same-salt substitutes the customer can pick.
 */
async function planCart({ lat, lng, items, now = new Date(), excludeVendorIds = [], maxUnitPrice }) {
  const ops = getPharmacyOps();
  const point = serviceability.toPoint(lat, lng);
  const wanted = normalizeCartItems(items);

  const medicines = await Medicine.find({ _id: { $in: wanted.map((w) => w.medicineId) } }).lean();
  const medById = new Map(medicines.map((m) => [String(m._id), m]));
  const blocked = [];
  const lines = [];
  for (const w of wanted) {
    const medicine = medById.get(w.medicineId);
    const reason = Medicine.onlineSaleBlockReason(medicine);
    if (reason) {
      blocked.push({ medicineId: w.medicineId, reason, message: saleBlockMessage(medicine, reason) });
      continue;
    }
    if (medicine.maxQtyPerOrder && w.quantity > medicine.maxQtyPerOrder) {
      blocked.push({
        medicineId: w.medicineId,
        reason: 'QUANTITY_LIMIT',
        message: `${medicine.name}: at most ${medicine.maxQtyPerOrder} per order`
      });
      continue;
    }
    lines.push({ medicine, quantity: w.quantity });
  }

  const { vendors, area } = await tradingStoresNear(point, ops, { excludeVendorIds });
  const rows = lines.length && vendors.length ? await VendorInventory.find({
    vendor: { $in: vendors.map((v) => v._id) },
    medicine: { $in: lines.map((l) => l.medicine._id) },
    ...sellableListingFilter(now)
  }).lean() : [];

  const options = coverageByStore(vendors, lines, rows, now, ops, { maxUnitPrice });
  const full = options.filter((o) => o.missing.length === 0);
  const best = full[0] || null;

  let split = null;
  if (!best && options.length > 1 && ops.maxSplitStores >= 2) {
    // Greedy two-store cover: the store with most lines, then the best store
    // for everything it lacks. (Exact set cover is overkill at 2 stores.)
    for (const first of options) {
      const rest = options.filter((o) => o !== first
        && first.missing.every((id) => o.covered.some((c) => c.medicineId === id)));
      if (rest.length === 0) continue;
      const second = rest.sort((a, b) => a.score - b.score)[0];
      const secondLines = second.covered.filter((c) => first.missing.includes(c.medicineId));
      split = [
        { ...publicOption(first), covered: first.covered, missing: [] },
        { ...publicOption(second), covered: secondLines, missing: [], subtotal: round2(secondLines.reduce((s, c) => s + c.lineTotal, 0)) }
      ];
      break;
    }
  }

  const coveredSomewhere = new Set(options.flatMap((o) => o.covered.map((c) => c.medicineId)));
  const unavailable = [];
  for (const line of lines) {
    const id = String(line.medicine._id);
    if (coveredSomewhere.has(id)) continue;
    recordUnmetDemand(line.medicine._id, point, now);
    unavailable.push({
      medicineId: id,
      name: line.medicine.name,
      substitutes: await findSubstitutes(line.medicine, vendors, { quantity: line.quantity, now })
    });
  }

  return {
    serviceable: area.serviceable,
    reason: area.reason,
    blocked,
    best: best ? publicOption(best) : null,
    split,
    partial: !best && !split && options[0] ? publicOption(options[0]) : null,
    options: options.slice(0, 5).map(publicOption),
    unavailable,
    // Internal callers (reassignment) need the full store docs, best first.
    // Controllers must never send this to clients (see stripInternal).
    _fullOptions: full
  };
}

/** Drop internal fields before a plan leaves the server. */
function stripInternal(plan) {
  const { _fullOptions, ...rest } = plan; // eslint-disable-line no-unused-vars
  return rest;
}

module.exports = {
  stripInternal,
  sellableListingFilter,
  acceptanceRate,
  rankScore,
  storeCanSell,
  normalizeCartItems,
  getMedicineAvailability,
  planCart,
  findSubstitutes,
  recordUnmetDemand
};
