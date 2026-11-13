/**
 * Pharmacy Batch Service: stock by manufacturing batch.
 *
 *   receive     book units in against a batch (qty adds to sellable stock)
 *   count       correct one batch's count after a shelf count
 *   allocate    earliest-expiry-first (FEFO) when an order reserves stock;
 *               the batches go on the order line (recalls, H1 register)
 *   return      give an order's units back to the batches they came from;
 *               units whose batch was quarantined/recalled meanwhile are
 *               withheld from sellable stock
 *   quarantine  worker: batches inside the minimum shelf life leave sellable stock
 *   recall      admin: a batch is pulled at every store; we list who got it
 *
 * Invariant for batch-tracked products: VendorInventory.stockQty equals the
 * sum of ACTIVE batch qty. Every function here moves both together, and the
 * listing is always changed with a guarded $inc so it can't go negative.
 */

const mongoose = require('mongoose');
const InventoryBatch = require('../models/inventoryBatch');
const VendorInventory = require('../models/vendorInventory');
const InventoryMovement = require('../models/inventoryMovement');
const Medicine = require('../models/medicine');
const PharmacyOrder = require('../models/pharmacyOrder');
const Notification = require('../models/notification');
const { minExpiryDate } = require('../config/pharmacyOps');
const { ValidationError, NotFoundError, ConflictError } = require('../utils/errors');
const logger = require('../utils/logger');

const lazyStockAlerts = () => require('./pharmacyStockAlertService');

async function ledger(rows) {
  const clean = rows.filter(Boolean);
  if (clean.length === 0) return;
  try {
    await InventoryMovement.insertMany(clean, { ordered: false });
  } catch (err) {
    logger.error('Inventory ledger write failed', { error: err.message, count: clean.length });
  }
}

/** Earliest ACTIVE, non-empty batch expiry → listing.expiryDate (what search checks). */
async function recomputeListingExpiry(vendorId, medicineId) {
  const next = await InventoryBatch.findOne({ vendor: vendorId, medicine: medicineId, status: 'ACTIVE', qty: { $gt: 0 } })
    .sort({ expiryDate: 1 }).select('expiryDate batchNumber').lean();
  await VendorInventory.updateOne(
    { vendor: vendorId, medicine: medicineId },
    next ? { $set: { expiryDate: next.expiryDate, batchNumber: next.batchNumber } } : { $unset: { expiryDate: 1, batchNumber: 1 } }
  );
}

/** Take units off the listing without ever going below zero. Returns units actually removed. */
async function takeFromListing(vendorId, medicineId, qty) {
  if (!(qty > 0)) return 0;
  const exact = await VendorInventory.findOneAndUpdate(
    { vendor: vendorId, medicine: medicineId, stockQty: { $gte: qty } },
    { $inc: { stockQty: -qty } },
    { new: true }
  );
  if (exact) return qty;
  // Listing already lower than the batch said (drift): clamp to zero.
  const before = await VendorInventory.findOneAndUpdate({ vendor: vendorId, medicine: medicineId }, { $set: { stockQty: 0 } });
  return before ? before.stockQty : 0;
}

const hasBatches = (vendorId, medicineId) => InventoryBatch.exists({ vendor: vendorId, medicine: medicineId });

/**
 * Book units in against a batch. Creates the listing when prices are given.
 * Refuses stock that is already inside the minimum shelf life.
 */
async function receiveBatch(vendorId, { medicineId, batchNumber, expiryDate, qty, mrp, sellingPrice }, { actorId, now = new Date() } = {}) {
  if (!mongoose.isValidObjectId(medicineId)) throw new ValidationError('Invalid medicineId');
  const units = Number(qty);
  if (!Number.isInteger(units) || units < 1 || units > 100000) throw new ValidationError('qty must be a whole number from 1 to 100000');
  const batch = String(batchNumber || '').trim().toUpperCase();
  if (!batch || batch.length > 40) throw new ValidationError('batchNumber is required (max 40 characters)');
  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) throw new ValidationError('expiryDate must be a valid date');
  if (expiry < minExpiryDate(now)) throw new ValidationError('This batch expires too soon to be sold online');

  const medicine = await Medicine.findById(medicineId).lean();
  if (!medicine) throw new NotFoundError('Medicine', medicineId);
  const blocked = Medicine.onlineSaleBlockReason(medicine);
  if (blocked === 'BANNED' || blocked === 'SCHEDULE_X') throw new ValidationError(`${medicine.name} can't be sold online, so it can't be stocked here`);

  let listing = await VendorInventory.findOne({ vendor: vendorId, medicine: medicineId });
  if (!listing) {
    if (!(Number(mrp) > 0) || !(Number(sellingPrice) >= 0) || Number(sellingPrice) > Number(mrp)) {
      throw new ValidationError('New product: give mrp and a sellingPrice no higher than mrp');
    }
    await VendorInventory.create({ vendor: vendorId, medicine: medicineId, mrp: Number(mrp), sellingPrice: Number(sellingPrice), stockQty: 0 });
  } else if (!(await hasBatches(vendorId, medicineId)) && listing.stockQty > 0) {
    // Switching an item to batch tracking: its existing untracked count must be
    // recounted into batches first, or stock and batches would disagree.
    throw new ConflictError(`${medicine.name} has ${listing.stockQty} untracked units. Set its count to 0 (or recount them into batches) before adding batches`);
  }

  const existing = await InventoryBatch.findOne({ vendor: vendorId, medicine: medicineId, batchNumber: batch }).lean();
  if (existing) {
    if (existing.status !== 'ACTIVE') throw new ConflictError(`Batch ${batch} is ${existing.status.toLowerCase()} and can't take new stock`);
    if (Math.abs(new Date(existing.expiryDate).getTime() - expiry.getTime()) > 36 * 60 * 60 * 1000) {
      throw new ConflictError(`Batch ${batch} is already recorded with a different expiry date. Check the pack`);
    }
  }
  const saved = await InventoryBatch.findOneAndUpdate(
    { vendor: vendorId, medicine: medicineId, batchNumber: batch },
    { $inc: { qty: units }, $setOnInsert: { expiryDate: expiry, status: 'ACTIVE', receivedAt: now, ...(Number(mrp) > 0 ? { mrp: Number(mrp) } : {}) } },
    { new: true, upsert: true }
  );
  const updated = await VendorInventory.findOneAndUpdate(
    { vendor: vendorId, medicine: medicineId },
    { $inc: { stockQty: units }, $set: { stockUpdatedAt: now } },
    { new: true }
  );
  await recomputeListingExpiry(vendorId, medicineId);
  await ledger([{
    vendor: vendorId, medicine: medicineId, type: 'BATCH_RECEIVED', delta: units, balanceAfter: updated.stockQty,
    actor: { kind: 'VENDOR', id: actorId }, reason: `Batch ${batch} (exp ${expiry.toISOString().slice(0, 10)})`
  }]);
  if (updated.stockQty === units) lazyStockAlerts().onStockAvailable(vendorId, medicineId); // was 0
  return saved;
}

/** Shelf count for one batch: sets its qty and moves the listing by the difference. */
async function setBatchCount(vendorId, batchId, qty, { actorId, now = new Date() } = {}) {
  if (!mongoose.isValidObjectId(batchId)) throw new ValidationError('Invalid batch id');
  const units = Number(qty);
  if (!Number.isInteger(units) || units < 0 || units > 100000) throw new ValidationError('qty must be a whole number from 0 to 100000');
  const before = await InventoryBatch.findOneAndUpdate(
    { _id: batchId, vendor: vendorId, status: 'ACTIVE' },
    { $set: { qty: units } }
  );
  if (!before) throw new NotFoundError('Active batch', batchId);
  const delta = units - before.qty;
  let balance;
  if (delta > 0) {
    const after = await VendorInventory.findOneAndUpdate({ vendor: vendorId, medicine: before.medicine }, { $inc: { stockQty: delta }, $set: { stockUpdatedAt: now } }, { new: true });
    balance = after && after.stockQty;
    if (after && after.stockQty === delta) lazyStockAlerts().onStockAvailable(vendorId, before.medicine);
  } else if (delta < 0) {
    await takeFromListing(vendorId, before.medicine, -delta);
    const after = await VendorInventory.findOneAndUpdate({ vendor: vendorId, medicine: before.medicine }, { $set: { stockUpdatedAt: now } }, { new: true });
    balance = after && after.stockQty;
  }
  await recomputeListingExpiry(vendorId, before.medicine);
  if (delta !== 0) {
    await ledger([{ vendor: vendorId, medicine: before.medicine, type: 'ADJUSTMENT', delta, balanceAfter: balance, actor: { kind: 'VENDOR', id: actorId }, reason: `Batch ${before.batchNumber} recounted` }]);
  }
  return InventoryBatch.findById(batchId);
}

async function listBatches(vendorId, { medicineId } = {}) {
  const filter = { vendor: vendorId };
  if (medicineId) {
    if (!mongoose.isValidObjectId(medicineId)) throw new ValidationError('Invalid medicineId');
    filter.medicine = medicineId;
  }
  return InventoryBatch.find(filter).sort({ medicine: 1, expiryDate: 1 }).populate('medicine', 'name packSize').lean();
}

/**
 * FEFO: take `qty` units from the earliest-expiring ACTIVE batches (the listing
 * was already decremented by reserveStock). Products without batches return [].
 * Each batch decrement is conditional, so concurrent orders can't overdraw one.
 */
async function allocateFefo(vendorId, medicineId, qty, now = new Date()) {
  const allocations = [];
  let need = qty;
  for (let round = 0; need > 0 && round < 5; round += 1) {
    const batches = await InventoryBatch.find({
      vendor: vendorId, medicine: medicineId, status: 'ACTIVE', qty: { $gt: 0 }, expiryDate: { $gte: minExpiryDate(now) }
    }).sort({ expiryDate: 1, receivedAt: 1 }).limit(20).lean();
    if (batches.length === 0) break;
    for (const b of batches) {
      if (need === 0) break;
      const take = Math.min(need, b.qty);
      const hit = await InventoryBatch.findOneAndUpdate(
        { _id: b._id, status: 'ACTIVE', qty: { $gte: take } },
        { $inc: { qty: -take } }
      );
      if (!hit) continue; // raced; re-read next round
      const existing = allocations.find((a) => a.batchNumber === b.batchNumber);
      if (existing) existing.quantity += take;
      else allocations.push({ batchNumber: b.batchNumber, expiryDate: b.expiryDate, quantity: take });
      need -= take;
    }
  }
  if (allocations.length) await recomputeListingExpiry(vendorId, medicineId);
  return allocations;
}

/**
 * Put an order line's units back. Returns how many units may go back on the
 * listing: batch units whose batch is no longer ACTIVE are withheld (they must
 * not become sellable again); unbatched units always go back.
 */
async function returnUnits(vendorId, medicineId, quantity, allocations = []) {
  let withheld = 0;
  for (const a of allocations || []) {
    const back = await InventoryBatch.findOneAndUpdate(
      { vendor: vendorId, medicine: medicineId, batchNumber: a.batchNumber, status: 'ACTIVE' },
      { $inc: { qty: a.quantity } }
    );
    if (!back) {
      withheld += a.quantity;
      // Keep the physical count on the quarantined/recalled batch for write-off.
      await InventoryBatch.updateOne({ vendor: vendorId, medicine: medicineId, batchNumber: a.batchNumber }, { $inc: { qty: a.quantity } }).catch(() => {});
    }
  }
  if ((allocations || []).length) await recomputeListingExpiry(vendorId, medicineId);
  return Math.max(0, quantity - withheld);
}

/** Store says it has none of this product: zero every active batch too. */
async function zeroBatches(vendorId, medicineId) {
  await InventoryBatch.updateMany({ vendor: vendorId, medicine: medicineId, status: 'ACTIVE' }, { $set: { qty: 0 } });
  await recomputeListingExpiry(vendorId, medicineId);
}

/** Take a batch out of sellable stock (expiry or recall). Returns units removed. */
async function pullBatch(batch, status, reason, now = new Date()) {
  const pulled = await InventoryBatch.findOneAndUpdate(
    { _id: batch._id, status: 'ACTIVE' },
    { $set: { status, statusReason: String(reason).slice(0, 200) } },
    { new: true }
  );
  if (!pulled) return 0;
  const removed = await takeFromListing(batch.vendor, batch.medicine, pulled.qty);
  await recomputeListingExpiry(batch.vendor, batch.medicine);
  if (pulled.qty > 0) {
    const after = await VendorInventory.findOne({ vendor: batch.vendor, medicine: batch.medicine }).select('stockQty').lean();
    await ledger([{
      vendor: batch.vendor, medicine: batch.medicine,
      type: status === 'RECALLED' ? 'RECALL_QUARANTINE' : 'EXPIRY_QUARANTINE',
      delta: -removed, balanceAfter: after ? after.stockQty : undefined,
      actor: { kind: status === 'RECALLED' ? 'ADMIN' : 'SYSTEM' }, reason: `${reason} (batch ${pulled.batchNumber})`
    }]);
  }
  logger.info('Batch pulled from sale', { batchId: String(batch._id), status, units: pulled.qty, at: now.toISOString() });
  return removed;
}

/** Worker: batches now inside the minimum shelf life leave sellable stock. */
async function quarantineExpiring({ now = new Date(), limit = 200 } = {}) {
  const due = await InventoryBatch.find({ status: 'ACTIVE', expiryDate: { $lt: minExpiryDate(now) } }).limit(limit).lean();
  let pulled = 0;
  for (const batch of due) {
    try {
      await pullBatch(batch, 'QUARANTINED', 'Inside minimum shelf life', now);
      pulled += 1;
    } catch (err) {
      logger.error('Batch quarantine failed', { batchId: String(batch._id), error: err.message });
    }
  }
  return { quarantined: pulled };
}

/**
 * Recall one batch of one product everywhere. Returns what ops need to act on:
 * stores and units pulled, open orders holding recalled units (the store must
 * swap them), and delivered orders (patients who received it).
 */
async function recallBatch({ medicineId, batchNumber, reason, notifyPatients = false }, { now = new Date() } = {}) {
  if (!mongoose.isValidObjectId(medicineId)) throw new ValidationError('Invalid medicineId');
  const batch = String(batchNumber || '').trim().toUpperCase();
  if (!batch) throw new ValidationError('batchNumber is required');
  const why = String(reason || 'Recalled').slice(0, 200);
  const medicine = await Medicine.findById(medicineId).select('name').lean();
  if (!medicine) throw new NotFoundError('Medicine', medicineId);

  const batches = await InventoryBatch.find({ medicine: medicineId, batchNumber: batch }).lean();
  let unitsPulled = 0;
  for (const b of batches) {
    if (b.status === 'ACTIVE') unitsPulled += await pullBatch(b, 'RECALLED', `Recall: ${why}`, now);
    else await InventoryBatch.updateOne({ _id: b._id }, { $set: { status: 'RECALLED', statusReason: `Recall: ${why}` } });
  }

  const orders = await PharmacyOrder.find({
    items: { $elemMatch: { medicine: medicineId, 'batches.batchNumber': batch } }
  }).select('orderNumber patient vendor status deliveredAt').lean();
  const open = orders.filter((o) => ['PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP'].includes(o.status));
  const delivered = orders.filter((o) => ['OUT_FOR_DELIVERY', 'DELIVERED'].includes(o.status));

  // Open orders: the store must hand over units from another batch.
  await Promise.all(open.map((o) => PharmacyOrder.updateOne({ _id: o._id }, {
    $push: { timeline: { status: o.status, at: now, note: `RECALL: batch ${batch} of ${medicine.name} must not be dispensed. Use another batch.` } }
  })));
  if (notifyPatients) {
    await Promise.all(delivered.map((o) => Notification.create({
      user: o.patient,
      recipientModel: 'Patient',
      type: 'PHARMACY_ORDER_UPDATE',
      title: `Recall: ${medicine.name}`,
      message: `Batch ${batch} of ${medicine.name} from order ${o.orderNumber} has been recalled (${why}). Please stop using it and contact the pharmacy or your doctor.`,
      priority: 'URGENT',
      channels: { inApp: true, push: true },
      metadata: { orderId: String(o._id), recall: batch }
    }).catch((err) => logger.error('Recall notice failed', { orderId: String(o._id), error: err.message }))));
  }
  logger.warn('Batch recalled', { medicineId: String(medicineId), batch, stores: batches.length, unitsPulled, open: open.length, delivered: delivered.length });
  return {
    medicine: { id: medicineId, name: medicine.name },
    batchNumber: batch,
    stores: batches.length,
    unitsPulled,
    openOrders: open.map((o) => ({ id: o._id, orderNumber: o.orderNumber, vendor: o.vendor, status: o.status })),
    deliveredOrders: delivered.map((o) => ({ id: o._id, orderNumber: o.orderNumber, patient: o.patient, deliveredAt: o.deliveredAt })),
    patientsNotified: notifyPatients ? delivered.length : 0
  };
}

module.exports = {
  receiveBatch,
  setBatchCount,
  listBatches,
  allocateFefo,
  returnUnits,
  zeroBatches,
  hasBatches,
  quarantineExpiring,
  recallBatch,
  recomputeListingExpiry
};
