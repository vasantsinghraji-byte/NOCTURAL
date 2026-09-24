/**
 * Pharmacy Catalogue Service
 *
 *   merge   fold a duplicate master product into the real one: store listings,
 *           batches, alerts and demand move over; stock is added, never lost.
 *           Products with different compositions are refused unless forced.
 *   import  CSV stock upload from billing software. Exact matches (barcode,
 *           then exact name) apply; anything else waits for the store to
 *           confirm the product. We never guess which medicine a row is.
 *   demand  "what people near you couldn't find" for stores and ops.
 */

const mongoose = require('mongoose');
const Medicine = require('../models/medicine');
const VendorInventory = require('../models/vendorInventory');
const InventoryBatch = require('../models/inventoryBatch');
const InventoryMovement = require('../models/inventoryMovement');
const StockAlert = require('../models/stockAlert');
const PharmacyDemandSignal = require('../models/pharmacyDemandSignal');
const PharmacyVendor = require('../models/pharmacyVendor');
const PharmacyInventoryImport = require('../models/pharmacyInventoryImport');
const batchService = require('./pharmacyBatchService');
const { geohashForPoint } = require('../utils/geohash');
const { ValidationError, NotFoundError, ConflictError } = require('../utils/errors');
const logger = require('../utils/logger');

const lazyPharmacyService = () => require('./pharmacyService');

// ── Merge duplicates ─────────────────────────────────────────────────────

async function mergeMedicines(duplicateId, intoId, { force = false } = {}) {
  if (!mongoose.isValidObjectId(duplicateId) || !mongoose.isValidObjectId(intoId)) throw new ValidationError('Invalid medicine id');
  if (String(duplicateId) === String(intoId)) throw new ValidationError('Pick two different products');
  const [dup, target] = await Promise.all([Medicine.findById(duplicateId), Medicine.findById(intoId)]);
  if (!dup) throw new NotFoundError('Medicine', duplicateId);
  if (!target) throw new NotFoundError('Medicine', intoId);
  if (dup.mergedInto) throw new ConflictError('That product was already merged');
  if (target.mergedInto) throw new ConflictError('Merge into the product it was merged into instead');
  // Safety: merging different medicines would send patients the wrong drug.
  if (dup.saltKey && target.saltKey && dup.saltKey !== target.saltKey) {
    throw new ConflictError('These products have different compositions and cannot be merged');
  }
  if ((!dup.saltKey || !target.saltKey) && !force) {
    throw new ConflictError('One product has no composition recorded. Check both packs, then merge with force');
  }
  if ((dup.form || '') !== (target.form || '') && !force) throw new ConflictError('These products have different forms');

  let listingsMoved = 0;
  let unitsMoved = 0;
  const listings = await VendorInventory.find({ medicine: dup._id });
  for (const listing of listings) {
    const into = await VendorInventory.findOne({ vendor: listing.vendor, medicine: target._id });
    if (into) {
      await VendorInventory.updateOne({ _id: into._id }, { $inc: { stockQty: listing.stockQty }, $set: { stockUpdatedAt: new Date() } });
      await VendorInventory.deleteOne({ _id: listing._id });
    } else {
      await VendorInventory.updateOne({ _id: listing._id }, { $set: { medicine: target._id } });
    }
    listingsMoved += 1;
    unitsMoved += listing.stockQty;
    if (listing.stockQty > 0) {
      await InventoryMovement.insertMany([
        { vendor: listing.vendor, medicine: dup._id, type: 'PRODUCT_MERGED', delta: -listing.stockQty, balanceAfter: 0, actor: { kind: 'ADMIN' }, reason: `Merged into ${target.name}` },
        { vendor: listing.vendor, medicine: target._id, type: 'PRODUCT_MERGED', delta: listing.stockQty, actor: { kind: 'ADMIN' }, reason: `Merged from ${dup.name}` }
      ], { ordered: false }).catch((err) => logger.error('Merge ledger write failed', { error: err.message }));
    }
  }

  const batches = await InventoryBatch.find({ medicine: dup._id });
  for (const b of batches) {
    const clash = await InventoryBatch.findOne({ vendor: b.vendor, medicine: target._id, batchNumber: b.batchNumber });
    if (clash) {
      await InventoryBatch.updateOne({ _id: clash._id }, { $inc: { qty: b.qty } });
      await InventoryBatch.deleteOne({ _id: b._id });
    } else {
      await InventoryBatch.updateOne({ _id: b._id }, { $set: { medicine: target._id } });
    }
  }
  for (const vendorId of new Set(listings.map((l) => String(l.vendor)))) {
    await batchService.recomputeListingExpiry(vendorId, target._id);
  }

  await StockAlert.updateMany({ medicine: dup._id, status: 'ACTIVE' }, { $set: { medicine: target._id } });
  const signals = await PharmacyDemandSignal.find({ medicine: dup._id }).lean();
  for (const s of signals) {
    await PharmacyDemandSignal.updateOne({ medicine: target._id, geohash: s.geohash, day: s.day }, { $inc: { unmet: s.unmet } }, { upsert: true });
  }
  await PharmacyDemandSignal.deleteMany({ medicine: dup._id });

  // Barcodes follow the product so imports keep matching.
  const barcodes = [...new Set([...(target.barcodes || []), ...(dup.barcodes || [])])];
  await Medicine.updateOne({ _id: target._id }, { $set: { barcodes } });
  await Medicine.updateOne({ _id: dup._id }, { $set: { isActive: false, mergedInto: target._id } });
  logger.info('Medicines merged', { from: String(dup._id), into: String(target._id), listingsMoved, unitsMoved });
  return { mergedInto: target._id, listingsMoved, unitsMoved, batchesMoved: batches.length };
}

// ── CSV import ───────────────────────────────────────────────────────────

const MAX_ROWS = 2000;

/** Small RFC 4180 parser: quoted fields, escaped quotes, CRLF/LF, commas or semicolons. */
function parseCsv(text) {
  const src = String(text || '').replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') { quoted = false; } else { field += ch; }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      if (rows.length > MAX_ROWS + 1) break;
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const HEADER_ALIASES = {
  name: ['name', 'product', 'product name', 'item', 'item name', 'medicine', 'description'],
  barcode: ['barcode', 'ean', 'ean code', 'upc', 'gtin'],
  mrp: ['mrp', 'm.r.p', 'm.r.p.'],
  sellingPrice: ['selling price', 'sale price', 'sale rate', 'rate', 'price', 'selling rate'],
  stock: ['stock', 'qty', 'quantity', 'closing stock', 'closing qty', 'balance', 'units'],
  batchNumber: ['batch', 'batch no', 'batch no.', 'batch number', 'batchno'],
  expiryDate: ['expiry', 'exp', 'exp date', 'expiry date', 'exp. date', 'expiry dt']
};

function mapHeader(cells) {
  const map = {};
  cells.forEach((cell, index) => {
    const key = cell.trim().toLowerCase().replace(/\s+/g, ' ');
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[field] === undefined && aliases.includes(key)) map[field] = index;
    }
  });
  return map;
}

/**
 * Billing exports write expiry many ways. MM/YY and MM/YYYY mean the end of
 * that month (how packs are labelled). DD/MM/YYYY is Indian day-first order.
 */
function parseExpiry(value) {
  const v = String(value || '').trim();
  if (!v) return undefined;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(v);
  if (m) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return new Date(Date.UTC(year, +m[2] - 1, +m[1]));
  }
  m = /^(\d{1,2})[/.-](\d{2}|\d{4})$/.exec(v);
  if (m) {
    const year = m[2].length === 2 ? 2000 + +m[2] : +m[2];
    return new Date(Date.UTC(year, +m[1], 0)); // day 0 of next month = last day of this month
  }
  return null; // present but unreadable
}

const num = (v) => {
  const s = String(v === undefined ? '' : v).replace(/[₹,\s]/g, '');
  if (s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function matchRow(raw) {
  if (raw.barcode) {
    const byCode = await Medicine.findOne({ barcodes: raw.barcode, isActive: true, mergedInto: null }).select('_id').lean();
    if (byCode) return { medicine: byCode._id, matchedBy: 'BARCODE' };
  }
  const wanted = normName(raw.name);
  if (!wanted) return { candidates: [] };
  let found;
  try {
    found = await Medicine.find({ $text: { $search: raw.name }, isActive: true, mergedInto: null }, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } }).limit(5).select('name packSize manufacturer').lean();
  } catch {
    found = [];
  }
  const exact = found.filter((m) => normName(m.name) === wanted);
  if (exact.length === 1) return { medicine: exact[0]._id, matchedBy: 'NAME' };
  return {
    candidates: found.slice(0, 3).map((m) => ({ medicine: m._id, name: m.name, packSize: m.packSize, manufacturer: m.manufacturer }))
  };
}

/** Apply one matched row: set the count (absolute) and prices. */
async function applyRow(vendorId, medicineId, raw, actorId) {
  const pharmacyService = lazyPharmacyService();
  const listing = await VendorInventory.findOne({ vendor: vendorId, medicine: medicineId }).lean();
  const mrp = raw.mrp !== undefined ? raw.mrp : listing && listing.mrp;
  const sellingPrice = raw.sellingPrice !== undefined ? raw.sellingPrice : (listing ? listing.sellingPrice : raw.mrp);
  if (!(mrp > 0) || sellingPrice === undefined) throw new ValidationError('New product: MRP and price are needed');

  if (raw.batchNumber) {
    if (!raw.expiryDate) throw new ValidationError('Batch rows need an expiry date');
    if (!listing) await pharmacyService.upsertInventoryItem(vendorId, { medicineId, mrp, sellingPrice });
    else if (raw.mrp !== undefined || raw.sellingPrice !== undefined) await pharmacyService.upsertInventoryItem(vendorId, { medicineId, mrp, sellingPrice });
    const existing = await InventoryBatch.findOne({ vendor: vendorId, medicine: medicineId, batchNumber: raw.batchNumber.toUpperCase() });
    if (existing) return batchService.setBatchCount(vendorId, existing._id, raw.stock || 0, { actorId });
    if (!(raw.stock > 0)) return null;
    return batchService.receiveBatch(vendorId, { medicineId, batchNumber: raw.batchNumber, expiryDate: raw.expiryDate, qty: raw.stock }, { actorId });
  }
  if (await batchService.hasBatches(vendorId, medicineId)) {
    throw new ValidationError('This item is tracked by batch: include batch number and expiry');
  }
  return pharmacyService.upsertInventoryItem(vendorId, {
    medicineId, mrp, sellingPrice, ...(raw.stock !== undefined ? { stockQty: raw.stock } : {})
  });
}

function recount(doc) {
  const counts = { total: doc.rows.length, applied: 0, needsReview: 0, errors: 0, skipped: 0 };
  for (const r of doc.rows) {
    if (r.status === 'APPLIED') counts.applied += 1;
    else if (r.status === 'NEEDS_REVIEW') counts.needsReview += 1;
    else if (r.status === 'ERROR') counts.errors += 1;
    else counts.skipped += 1;
  }
  doc.counts = counts;
}

async function importInventoryCsv(vendorId, csvText, { actorId } = {}) {
  if (typeof csvText !== 'string' || csvText.trim() === '') throw new ValidationError('Upload a CSV file with a header row');
  const table = parseCsv(csvText);
  if (table.length < 2) throw new ValidationError('The file needs a header row and at least one product');
  if (table.length - 1 > MAX_ROWS) throw new ValidationError(`Upload at most ${MAX_ROWS} products per file`);
  const header = mapHeader(table[0]);
  if (header.name === undefined && header.barcode === undefined) throw new ValidationError('Add a "Name" or "Barcode" column');
  if (header.stock === undefined) throw new ValidationError('Add a "Stock" (quantity) column');

  const rows = [];
  for (let i = 1; i < table.length; i += 1) {
    const cells = table[i];
    const cell = (field) => (header[field] === undefined ? undefined : cells[header[field]]);
    const expiry = parseExpiry(cell('expiryDate'));
    const raw = {
      name: String(cell('name') || '').trim().slice(0, 200),
      barcode: String(cell('barcode') || '').trim().slice(0, 40) || undefined,
      mrp: num(cell('mrp')),
      sellingPrice: num(cell('sellingPrice')),
      stock: num(cell('stock')),
      batchNumber: String(cell('batchNumber') || '').trim().toUpperCase().slice(0, 40) || undefined,
      expiryDate: expiry || undefined
    };
    const bad = [];
    if (Number.isNaN(raw.mrp) || (raw.mrp !== undefined && raw.mrp < 0)) bad.push('MRP');
    if (Number.isNaN(raw.sellingPrice) || (raw.sellingPrice !== undefined && raw.sellingPrice < 0)) bad.push('price');
    if (raw.stock === undefined || Number.isNaN(raw.stock) || raw.stock < 0 || !Number.isInteger(raw.stock)) bad.push('stock');
    if (expiry === null) bad.push('expiry');
    if (raw.mrp !== undefined && raw.sellingPrice !== undefined && raw.sellingPrice > raw.mrp) bad.push('price above MRP');
    if (bad.length) {
      rows.push({ line: i + 1, raw: { ...raw, mrp: Number.isNaN(raw.mrp) ? undefined : raw.mrp, sellingPrice: Number.isNaN(raw.sellingPrice) ? undefined : raw.sellingPrice, stock: Number.isNaN(raw.stock) ? undefined : raw.stock }, status: 'ERROR', error: `Check ${bad.join(', ')}` });
      continue;
    }
    const match = await matchRow(raw);
    if (!match.medicine) {
      rows.push({ line: i + 1, raw, status: 'NEEDS_REVIEW', candidates: match.candidates });
      continue;
    }
    try {
      await applyRow(vendorId, match.medicine, raw, actorId);
      rows.push({ line: i + 1, raw, status: 'APPLIED', matchedBy: match.matchedBy, medicine: match.medicine });
    } catch (err) {
      rows.push({ line: i + 1, raw, status: 'ERROR', medicine: match.medicine, error: String(err.message).slice(0, 300) });
    }
  }
  const doc = new PharmacyInventoryImport({ vendor: vendorId, uploadedBy: actorId, rows });
  recount(doc);
  await doc.save();
  logger.info('Inventory import', { vendorId: String(vendorId), ...doc.counts });
  return doc;
}

async function getImport(vendorId, importId) {
  if (!mongoose.isValidObjectId(importId)) throw new ValidationError('Invalid import id');
  const doc = await PharmacyInventoryImport.findOne({ _id: importId, vendor: vendorId });
  if (!doc) throw new NotFoundError('Import', importId);
  return doc;
}

/** Store resolves one review row: this product, or skip it. */
async function resolveImportRow(vendorId, importId, line, { medicineId, skip }, { actorId } = {}) {
  const doc = await getImport(vendorId, importId);
  const row = doc.rows.find((r) => r.line === Number(line));
  if (!row) throw new NotFoundError('Import row', line);
  if (row.status !== 'NEEDS_REVIEW') throw new ConflictError('This row is already done');
  if (skip) {
    row.status = 'SKIPPED';
  } else {
    if (!mongoose.isValidObjectId(medicineId)) throw new ValidationError('Pick a product');
    const medicine = await Medicine.findOne({ _id: medicineId, isActive: true, mergedInto: null }).select('_id barcodes').lean();
    if (!medicine) throw new NotFoundError('Medicine', medicineId);
    try {
      await applyRow(vendorId, medicine._id, row.raw, actorId);
      row.status = 'APPLIED';
      row.matchedBy = 'REVIEW';
      row.medicine = medicine._id;
      // Learn the barcode so the next upload matches by itself.
      if (row.raw.barcode && !(medicine.barcodes || []).includes(row.raw.barcode)) {
        const taken = await Medicine.exists({ barcodes: row.raw.barcode });
        if (!taken) await Medicine.updateOne({ _id: medicine._id }, { $addToSet: { barcodes: row.raw.barcode } });
      }
    } catch (err) {
      row.status = 'ERROR';
      row.error = String(err.message).slice(0, 300);
    }
  }
  recount(doc);
  await doc.save();
  return doc;
}

// ── Demand ───────────────────────────────────────────────────────────────

async function topUnmet(match, { days = 14, limit = 20 } = {}) {
  const since = new Date(Date.now() - Math.min(Number(days) || 14, 90) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rows = await PharmacyDemandSignal.aggregate([
    { $match: { ...match, day: { $gte: since } } },
    { $group: { _id: '$medicine', unmet: { $sum: '$unmet' }, areas: { $addToSet: '$geohash' } } },
    { $sort: { unmet: -1 } },
    { $limit: Math.min(Number(limit) || 20, 100) },
    { $lookup: { from: 'medicines', localField: '_id', foreignField: '_id', as: 'medicine' } },
    { $unwind: '$medicine' },
    { $project: { _id: 0, medicineId: '$_id', name: '$medicine.name', packSize: '$medicine.packSize', manufacturer: '$medicine.manufacturer', unmet: 1, areas: { $size: '$areas' } } }
  ]);
  return rows;
}

/** What customers near this store searched for and nobody had. */
async function vendorDemand(vendorId, options = {}) {
  const vendor = await PharmacyVendor.findById(vendorId).select('location').lean();
  const hash = vendor && vendor.location ? geohashForPoint(vendor.location, 4) : null;
  if (!hash) return [];
  const rows = await topUnmet({ geohash: { $regex: `^${hash}` } }, options);
  const listed = new Set((await VendorInventory.find({ vendor: vendorId, medicine: { $in: rows.map((r) => r.medicineId) } }).select('medicine').lean())
    .map((l) => String(l.medicine)));
  return rows.map((r) => ({ ...r, youList: listed.has(String(r.medicineId)) }));
}

async function adminDemand({ geohashPrefix, ...options } = {}) {
  const prefix = String(geohashPrefix || '').toLowerCase();
  if (prefix && !/^[0-9b-hjkmnp-z]{1,6}$/.test(prefix)) throw new ValidationError('Invalid geohash prefix');
  return topUnmet(prefix ? { geohash: { $regex: `^${prefix}` } } : {}, { limit: 50, ...options });
}

module.exports = {
  mergeMedicines,
  parseCsv,
  parseExpiry,
  mapHeader,
  importInventoryCsv,
  getImport,
  resolveImportRow,
  vendorDemand,
  adminDemand
};
