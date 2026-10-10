/**
 * Pharmacy store management: what a store owner needs to run the shop day to day.
 *
 * - today():     the day at a glance (orders, sales, stock and expiry alerts, open state)
 * - inventory(): stock list with search and filters (low, out, expiring, hidden)
 * - profile():   the shop settings the owner can change (PATCH /vendor/profile writes them)
 * - earnings():  sales statement from the settlement ledger (withdrawals live in payoutService)
 *
 * Days are counted in India time, the same day the owner sees on the shop clock.
 */

const mongoose = require('mongoose');
const PharmacyVendor = require('../models/pharmacyVendor');
const PharmacyOrder = require('../models/pharmacyOrder');
const VendorInventory = require('../models/vendorInventory');
const InventoryBatch = require('../models/inventoryBatch');
const SettlementEntry = require('../models/settlementEntry');
const { getPharmacyOps } = require('../config/pharmacyOps');
const { safeCaseInsensitiveRegex } = require('../utils/safeMongo');
const { NotFoundError, ValidationError } = require('../utils/errors');

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;
// Warn this many days before a batch is pulled from online sale (min shelf life).
const EXPIRY_WARNING_DAYS = 30;
const ACTIVE_STATUSES = ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];
const INVENTORY_FILTERS = ['all', 'low', 'out', 'expiring', 'hidden'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const oid = (id) => new mongoose.Types.ObjectId(String(id));

/** Midnight (India time) of the day `now` falls in, as a UTC Date. */
function istDayStart(now = new Date()) {
  const shifted = now.getTime() + IST_OFFSET_MS;
  return new Date(shifted - (shifted % DAY_MS) - IST_OFFSET_MS);
}

const istDateKey = (date) => new Date(new Date(date).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/** Whether the shop's posted hours cover `now` (no hours set = always open). */
function withinHours(hours, now = new Date()) {
  if (!Array.isArray(hours) || hours.length === 0) return true;
  const local = new Date(now.getTime() + IST_OFFSET_MS);
  const today = hours.find((h) => h.day === DAYS[local.getUTCDay()]);
  if (!today) return true;
  if (today.isClosed) return false;
  if (!today.open || !today.close) return true;
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  const open = toMin(today.open);
  const close = toMin(today.close);
  // Past midnight (e.g. 20:00 to 02:00).
  return close > open ? minutes >= open && minutes < close : minutes >= open || minutes < close;
}

function expiryWarnDate(now = new Date()) {
  return new Date(now.getTime() + (getPharmacyOps().minShelfLifeDays + EXPIRY_WARNING_DAYS) * DAY_MS);
}

async function loadVendor(vendorId) {
  const vendor = await PharmacyVendor.findById(vendorId).lean();
  if (!vendor) throw new NotFoundError('Pharmacy vendor', vendorId);
  return vendor;
}

/** The settings form: only what the owner may change, plus read-only status. */
async function profile(vendorId, now = new Date()) {
  const v = await loadVendor(vendorId);
  const paused = v.pausedUntil && new Date(v.pausedUntil) > now;
  return {
    name: v.name,
    address: v.address,
    status: v.status,
    isOpen: v.isOpen !== false,
    openNow: v.isOpen !== false && !paused && withinHours(v.operatingHours, now),
    pausedUntil: paused ? v.pausedUntil : null,
    pauseReason: paused ? v.pauseReason : null,
    operatingHours: v.operatingHours || [],
    serviceRadiusKm: v.serviceRadiusKm,
    deliveryFee: v.deliveryFee || 0,
    minOrderValue: v.minOrderValue || 0,
    avgPreparationMinutes: v.avgPreparationMinutes || 15,
    acceptsPrescriptionOrders: v.acceptsPrescriptionOrders !== false,
    contactPhone: v.contactPhone || '',
    contactEmail: v.contactEmail || '',
    rating: v.rating || { average: 0, count: 0 },
    commissionPercentage: v.payout && v.payout.commissionPercentage
  };
}

async function stockCounts(vendor, now) {
  const [row] = await VendorInventory.aggregate([
    { $match: { vendor } },
    {
      $group: {
        _id: null,
        listed: { $sum: 1 },
        hidden: { $sum: { $cond: [{ $eq: ['$isAvailable', false] }, 1, 0] } },
        out: { $sum: { $cond: [{ $and: [{ $ne: ['$isAvailable', false] }, { $lte: ['$stockQty', 0] }] }, 1, 0] } },
        low: {
          $sum: {
            $cond: [{ $and: [{ $ne: ['$isAvailable', false] }, { $gt: ['$stockQty', 0] }, { $lte: ['$stockQty', { $ifNull: ['$lowStockThreshold', 5] }] }] }, 1, 0]
          }
        }
      }
    }
  ]);
  const [expiring, quarantined] = await Promise.all([
    InventoryBatch.countDocuments({ vendor, status: 'ACTIVE', qty: { $gt: 0 }, expiryDate: { $lte: expiryWarnDate(now) } }),
    InventoryBatch.countDocuments({ vendor, status: 'QUARANTINED', qty: { $gt: 0 } })
  ]);
  return {
    listed: row ? row.listed : 0,
    hidden: row ? row.hidden : 0,
    out: row ? row.out : 0,
    low: row ? row.low : 0,
    expiringBatches: expiring,
    // Too close to expiry for online sale: take these off the shelf / return them.
    pulledBatches: quarantined
  };
}

/** The day at a glance for the owner's home screen. */
async function today(vendorId, now = new Date()) {
  const vendor = oid(vendorId);
  const start = istDayStart(now);
  const yesterday = new Date(start.getTime() - DAY_MS);
  const [shop, stock, newOrders, active, deliveredToday, deliveredYesterday, lostToday, recentStatus] = await Promise.all([
    profile(vendorId, now),
    stockCounts(vendor, now),
    PharmacyOrder.countDocuments({ vendor, status: 'PLACED' }),
    PharmacyOrder.countDocuments({ vendor, status: { $in: ACTIVE_STATUSES } }),
    PharmacyOrder.aggregate([
      { $match: { vendor, status: 'DELIVERED', deliveredAt: { $gte: start } } },
      { $group: { _id: null, count: { $sum: 1 }, sales: { $sum: '$amounts.itemsSubtotal' } } }
    ]),
    PharmacyOrder.aggregate([
      { $match: { vendor, status: 'DELIVERED', deliveredAt: { $gte: yesterday, $lt: start } } },
      { $group: { _id: null, sales: { $sum: '$amounts.itemsSubtotal' } } }
    ]),
    PharmacyOrder.countDocuments({ vendor, status: { $in: ['REJECTED', 'CANCELLED'] }, updatedAt: { $gte: start } }),
    PharmacyVendor.findById(vendor).select('reliability').lean()
  ]);
  const r = (recentStatus && recentStatus.reliability) || {};
  return {
    shop,
    orders: {
      new: newOrders,
      inProgress: active,
      deliveredToday: deliveredToday[0] ? deliveredToday[0].count : 0,
      cancelledToday: lostToday
    },
    sales: {
      today: round2(deliveredToday[0] && deliveredToday[0].sales),
      yesterday: round2(deliveredYesterday[0] && deliveredYesterday[0].sales)
    },
    stock,
    acceptanceRate: r.offered ? Math.round((100 * (r.accepted || 0)) / r.offered) : null
  };
}

/**
 * Stock list with search and filters, sorted by product name. Each row carries a
 * batch summary so the owner sees what expires next without opening it.
 */
async function inventory(vendorId, { q, filter = 'all', page = 1, limit = 30 } = {}, now = new Date()) {
  if (!INVENTORY_FILTERS.includes(filter)) throw new ValidationError(`filter must be one of ${INVENTORY_FILTERS.join(', ')}`);
  const vendor = oid(vendorId);
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);

  const match = { vendor };
  if (filter === 'hidden') match.isAvailable = false;
  if (filter === 'out') Object.assign(match, { isAvailable: { $ne: false }, stockQty: { $lte: 0 } });
  if (filter === 'low') {
    Object.assign(match, { isAvailable: { $ne: false }, stockQty: { $gt: 0 } });
    match.$expr = { $lte: ['$stockQty', { $ifNull: ['$lowStockThreshold', 5] }] };
  }
  if (filter === 'expiring') {
    const warn = expiryWarnDate(now);
    const batchMeds = await InventoryBatch.distinct('medicine', { vendor, status: 'ACTIVE', qty: { $gt: 0 }, expiryDate: { $lte: warn } });
    match.$or = [{ medicine: { $in: batchMeds } }, { stockQty: { $gt: 0 }, expiryDate: { $lte: warn } }];
  }

  const nameRe = safeCaseInsensitiveRegex(q, 60);
  const pipeline = [
    { $match: match },
    { $lookup: { from: 'medicines', localField: 'medicine', foreignField: '_id', as: 'medicine' } },
    { $unwind: '$medicine' },
    ...(nameRe ? [{ $match: { $or: [{ 'medicine.name': nameRe }, { 'medicine.genericName': nameRe }, { 'medicine.manufacturer': nameRe }] } }] : []),
    { $sort: { 'medicine.name': 1, _id: 1 } },
    {
      $facet: {
        items: [
          { $skip: (pageNum - 1) * limitNum },
          { $limit: limitNum },
          {
            $project: {
              mrp: 1, sellingPrice: 1, discountPercentage: 1, stockQty: 1, lowStockThreshold: 1, isAvailable: 1,
              expiryDate: 1, batchNumber: 1, stockUpdatedAt: 1, updatedAt: 1,
              medicine: { _id: 1, name: 1, genericName: 1, manufacturer: 1, packSize: 1, form: 1, strength: 1, scheduleType: 1, requiresPrescription: 1 }
            }
          }
        ],
        total: [{ $count: 'n' }]
      }
    }
  ];
  const [result] = await VendorInventory.aggregate(pipeline);
  const items = result.items;
  const total = result.total[0] ? result.total[0].n : 0;

  // Batch summary for the rows on this page.
  const batches = items.length
    ? await InventoryBatch.find({ vendor, medicine: { $in: items.map((i) => i.medicine._id) }, qty: { $gt: 0 } })
      .select('medicine batchNumber expiryDate qty status').sort({ expiryDate: 1 }).lean()
    : [];
  const warn = expiryWarnDate(now);
  for (const item of items) {
    const mine = batches.filter((b) => String(b.medicine) === String(item.medicine._id));
    const active = mine.filter((b) => b.status === 'ACTIVE');
    item.batchSummary = mine.length ? {
      count: active.length,
      nextExpiry: active[0] ? active[0].expiryDate : null,
      expiringQty: active.filter((b) => b.expiryDate <= warn).reduce((s, b) => s + b.qty, 0),
      pulledQty: mine.filter((b) => b.status !== 'ACTIVE').reduce((s, b) => s + b.qty, 0)
    } : null;
    item.low = item.isAvailable !== false && item.stockQty > 0 && item.stockQty <= (item.lowStockThreshold ?? 5);
  }
  return { items, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } };
}

/**
 * Sales statement for the last `days` days, built from the settlement ledger
 * (one VENDOR_PAYOUT row per delivered order, plus CASH_COLLECTED on cash orders
 * the store collected itself).
 */
async function earnings(vendorId, { days = 30 } = {}, now = new Date()) {
  const span = Math.min(Math.max(parseInt(days, 10) || 30, 1), 90);
  const since = new Date(istDayStart(now).getTime() - (span - 1) * DAY_MS);
  const rows = await SettlementEntry.find({
    'party.kind': 'VENDOR',
    'party.id': oid(vendorId),
    type: { $in: ['VENDOR_PAYOUT', 'CASH_COLLECTED'] },
    status: { $ne: 'VOID' },
    occurredAt: { $gte: since }
  }).sort({ occurredAt: -1 }).lean();

  const byOrder = new Map();
  for (const e of rows) {
    const key = String(e.source.id);
    const o = byOrder.get(key) || { orderId: key, ref: e.source.ref, date: e.occurredAt, sales: 0, commission: 0, payout: 0, cash: 0, rate: null, status: 'PENDING' };
    if (e.type === 'VENDOR_PAYOUT') {
      o.sales = round2(e.basis);
      o.payout = round2(e.amount);
      o.commission = round2((e.basis || 0) - e.amount);
      o.rate = e.rate;
      o.status = e.status;
    } else {
      o.cash = round2(e.amount);
    }
    byOrder.set(key, o);
  }
  const orders = [...byOrder.values()];

  const daily = new Map();
  for (let i = 0; i < span; i += 1) daily.set(istDateKey(new Date(since.getTime() + i * DAY_MS)), { date: '', sales: 0, payout: 0, orders: 0 });
  for (const o of orders) {
    const d = daily.get(istDateKey(o.date));
    if (d) { d.sales = round2(d.sales + o.sales); d.payout = round2(d.payout + o.payout); d.orders += 1; }
  }
  const sum = (k) => round2(orders.reduce((s, o) => s + o[k], 0));
  return {
    days: span,
    from: since,
    totals: {
      orders: orders.length,
      sales: sum('sales'),
      commission: sum('commission'),
      payout: sum('payout'),
      cashCollected: sum('cash'),
      paidOut: round2(orders.filter((o) => o.status === 'PAID').reduce((s, o) => s + o.payout, 0))
    },
    daily: [...daily.entries()].map(([date, d]) => ({ ...d, date })),
    orders: orders.slice(0, 100)
  };
}

module.exports = { today, inventory, profile, earnings, withinHours, istDayStart, INVENTORY_FILTERS };
