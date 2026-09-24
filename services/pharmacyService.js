/**
 * Pharmacy Service
 *
 * Business logic for the local-pharmacy-vendor marketplace: vendor
 * discovery, medicine search, order placement (with atomic stock
 * reservation and price snapshotting), and order lifecycle transitions.
 *
 * Thin HTTP controllers delegate here; this layer throws typed
 * ServiceErrors that responseHelper.handleServiceError maps to responses.
 */

const mongoose = require('mongoose');
const PharmacyVendor = require('../models/pharmacyVendor');
const Medicine = require('../models/medicine');
const VendorInventory = require('../models/vendorInventory');
const PharmacyOrder = require('../models/pharmacyOrder');
const InventoryMovement = require('../models/inventoryMovement');
const serviceability = require('./serviceabilityService');
const {
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthorizationError
} = require('../utils/errors');
const { PHARMACY_ORDER_STATUSES } = require('../constants/enums');
const logger = require('../utils/logger');
const razorpayGateway = require('../utils/razorpayGateway');
const pharmacyPaymentService = require('./pharmacyPaymentService');
const pharmacyNotificationService = require('./pharmacyNotificationService');
const pricingService = require('./pricingService');
const membershipService = require('./membershipService');
const settlementService = require('./settlementService');
const availability = require('./pharmacyAvailabilityService');
const batchService = require('./pharmacyBatchService');
const compliance = require('./pharmacyComplianceService');
const stockAlerts = require('./pharmacyStockAlertService');
const { getPharmacyOps, minExpiryDate } = require('../config/pharmacyOps');

// pharmacyAssignmentService requires this module (reserveStock), so load lazily.
const assignment = () => require('./pharmacyAssignmentService');

const STORE_BLOCK_MESSAGES = {
  CLOSED: 'This pharmacy is currently closed',
  OUTSIDE_HOURS: 'This pharmacy is closed at this hour',
  PAUSED: 'This pharmacy is not taking orders for a short while. Please pick another store',
  LICENCE_EXPIRED: 'This pharmacy cannot take orders right now',
  NOT_APPROVED: 'This pharmacy cannot take orders right now',
  INACTIVE: 'This pharmacy cannot take orders right now'
};

// Vendor-driven status transitions. Delivery/admin own the later legs.
const VENDOR_STATUS_TRANSITIONS = {
  PLACED: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY_FOR_PICKUP', 'CANCELLED'],
  READY_FOR_PICKUP: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED']
};

const toNumber = (value, fallback = undefined) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

// Milestone written the first time an order reaches each status.
const STATUS_MILESTONES = {
  ACCEPTED: 'acceptedAt',
  READY_FOR_PICKUP: 'readyAt',
  OUT_FOR_DELIVERY: 'pickedUpAt',
  DELIVERED: 'deliveredAt',
  REJECTED: 'cancelledAt',
  CANCELLED: 'cancelledAt'
};

/**
 * Put units back on a store listing. If the product was merged into another
 * after the order was placed, its listing moved there, so follow it.
 */
async function incListing(vendorId, medicineId, qty) {
  const updated = await VendorInventory.findOneAndUpdate({ vendor: vendorId, medicine: medicineId }, { $inc: { stockQty: qty } }, { new: true });
  if (updated) return updated;
  const med = await Medicine.findById(medicineId).select('mergedInto').lean();
  if (med && med.mergedInto) {
    return VendorInventory.findOneAndUpdate({ vendor: vendorId, medicine: med.mergedInto }, { $inc: { stockQty: qty } }, { new: true });
  }
  return null;
}

/** Undo reserveStock results (listing units + batch allocations). */
async function rollbackReservation(vendorId, reserved) {
  await Promise.all(reserved.map(async (r) => {
    try {
      const back = await batchService.returnUnits(vendorId, r.inventory.medicine._id || r.inventory.medicine, r.quantity, r.batches);
      if (back > 0) await VendorInventory.updateOne({ _id: r.inventory._id }, { $inc: { stockQty: back } });
    } catch (err) {
      logger.error('Stock rollback failed', { inventoryId: r.inventory._id, error: err.message });
    }
  }));
}

/** Listing can be bought now: in stock, not near expiry, product sellable online. */
function isSellableRow(row, now = new Date()) {
  if (!row || !(row.stockQty > 0) || row.isAvailable === false) return false;
  if (row.expiryDate && new Date(row.expiryDate) < minExpiryDate(now)) return false;
  return !Medicine.onlineSaleBlockReason(row.medicine);
}

function stampMilestone(order, status, at = new Date()) {
  const field = STATUS_MILESTONES[status];
  if (field && !(order.milestones && order.milestones[field])) {
    order.set(`milestones.${field}`, at);
  }
}

/**
 * Append stock-ledger rows. The atomic $inc on VendorInventory already
 * happened and is the source of truth, so a ledger write failure is logged
 * for reconciliation rather than failing the customer's request.
 */
async function recordMovements(rows) {
  if (!rows.length) return;
  try {
    await InventoryMovement.insertMany(rows, { ordered: false });
  } catch (err) {
    logger.error('Inventory ledger write failed — reconcile from stock', {
      count: rows.length, error: err.message
    });
  }
}

/**
 * Orderable stores that can deliver to (lat, lng) now — zone-aware, each
 * store's own radius enforced, stress-adjusted (services/serviceabilityService.js).
 */
async function getNearbyVendors({ lat, lng, radiusKm, limit = 30 }) {
  return serviceability.findServiceableVendors({ lat, lng, radiusKm, limit });
}

/**
 * Search the medicine catalog. When vendorId is given, results are scoped to
 * that vendor's live inventory (price + stock); otherwise the master catalog.
 */
async function searchMedicines({ q, vendorId, category, page = 1, limit = 20 }) {
  const pageNum = Math.max(toNumber(page, 1), 1);
  const limitNum = Math.min(Math.max(toNumber(limit, 20), 1), 100);
  const skip = (pageNum - 1) * limitNum;

  if (vendorId) {
    if (!mongoose.isValidObjectId(vendorId)) {
      throw new ValidationError('Invalid vendor id');
    }
    const inventoryQuery = { vendor: vendorId, isAvailable: true };
    const populateMatch = {};
    if (category) populateMatch.category = category;

    let inventory = await VendorInventory.find(inventoryQuery)
      .populate({
        path: 'medicine',
        match: {
          isActive: true,
          ...(category ? { category } : {}),
          ...(q ? { $text: { $search: q } } : {})
        }
      })
      .lean();

    // Drop rows whose populated medicine was filtered out by the match.
    inventory = inventory.filter((row) => row.medicine).slice(skip, skip + limitNum);

    return inventory.map((row) => ({
      inventoryId: row._id,
      medicine: row.medicine,
      mrp: row.mrp,
      sellingPrice: row.sellingPrice,
      discountPercentage: row.discountPercentage,
      inStock: isSellableRow(row),
      stockQty: row.stockQty
    }));
  }

  // Master catalog search
  const filter = { isActive: true };
  if (category) filter.category = category;
  if (q) filter.$text = { $search: q };

  const medicines = await Medicine.find(filter)
    .skip(skip)
    .limit(limitNum)
    .lean();

  return medicines;
}

/**
 * A single vendor's full storefront (profile + available inventory).
 */
async function getVendorStorefront(vendorId) {
  if (!mongoose.isValidObjectId(vendorId)) {
    throw new ValidationError('Invalid vendor id');
  }
  const vendor = await PharmacyVendor.findOne({
    _id: vendorId,
    status: 'APPROVED',
    isActive: true
  }).lean();

  if (!vendor) throw new NotFoundError('Pharmacy vendor', vendorId);

  const inventory = await VendorInventory.find({ vendor: vendorId, isAvailable: true })
    .populate({ path: 'medicine', match: { isActive: true } })
    .lean();

  return {
    vendor,
    items: inventory
      .filter((row) => row.medicine)
      .map((row) => ({
        inventoryId: row._id,
        medicine: row.medicine,
        mrp: row.mrp,
        sellingPrice: row.sellingPrice,
        discountPercentage: row.discountPercentage,
        inStock: isSellableRow(row)
      }))
  };
}

/**
 * Reserve stock atomically for each item; roll back on partial failure.
 * Returns the list of successfully reserved { inventory, quantity } pairs.
 */
async function reserveStock(vendorId, requestedItems, { now = new Date() } = {}) {
  const reserved = [];
  try {
    for (const item of requestedItems) {
      const updated = await VendorInventory.findOneAndUpdate(
        {
          vendor: vendorId,
          medicine: item.medicineId,
          isAvailable: true,
          stockQty: { $gte: item.quantity },
          // Never sell stock that expires inside the minimum shelf life.
          $or: [{ expiryDate: null }, { expiryDate: { $gte: minExpiryDate(now) } }]
        },
        { $inc: { stockQty: -item.quantity } },
        { new: true }
      ).populate('medicine');

      if (!updated) {
        throw new ConflictError('One or more items are out of stock at this pharmacy');
      }
      if (!updated.medicine || Medicine.onlineSaleBlockReason(updated.medicine)) {
        // Master medicine removed, banned or discontinued after the listing was
        // read: undo this decrement and fail cleanly (the catch rolls back the rest).
        await VendorInventory.updateOne({ _id: updated._id }, { $inc: { stockQty: item.quantity } }).catch(() => {});
        throw new ConflictError('An item in your cart is no longer available');
      }
      // Earliest-expiry-first batches for this line (none for untracked products).
      const batches = await batchService.allocateFefo(vendorId, item.medicineId, item.quantity, now);
      reserved.push({ inventory: updated, quantity: item.quantity, batches });
    }
    return reserved;
  } catch (err) {
    // Roll back everything reserved so far.
    await rollbackReservation(vendorId, reserved);
    throw err;
  }
}

/**
 * Place a pharmacy order for a patient.
 * payload: { vendorId, items:[{medicineId, quantity}], deliveryAddress, deliveryLocation, prescriptionKey, paymentMode }
 */
async function createOrder(patientId, payload = {}, { fulfilment = 'DELIVERY', careVisit, checkout } = {}) {
  // `fulfilment`/`careVisit` are set only by internal callers (home-care
  // supplies), never from the request body.
  const { vendorId, deliveryAddress, deliveryLocation, prescriptionKey, paymentMode, quotedSubtotal } = payload;

  if (!mongoose.isValidObjectId(vendorId)) {
    throw new ValidationError('A valid vendorId is required');
  }
  // Same medicine twice in one cart → one line (else two reservations, two lines).
  const items = availability.normalizeCartItems(payload.items);
  if (!deliveryAddress || !deliveryAddress.line1 || !deliveryAddress.pincode) {
    throw new ValidationError('A delivery address with line1 and pincode is required');
  }

  // A patient may only attach a prescription they uploaded themselves.
  if (prescriptionKey !== undefined && !isOwnPrescriptionKey(prescriptionKey, patientId)) {
    throw new AuthorizationError('That prescription file does not belong to you');
  }

  const mode = paymentMode === 'COD' ? 'COD' : 'PREPAID';
  if (mode === 'PREPAID' && !razorpayGateway.isEnabled()) {
    throw new ValidationError('Online payment is not available right now. Please choose Cash on Delivery.');
  }

  const vendor = await PharmacyVendor.findOne({ _id: vendorId, status: 'APPROVED', isActive: true });
  if (!vendor) throw new NotFoundError('Pharmacy vendor', vendorId);
  const now = new Date();
  const blocked = serviceability.storeBlockReason(vendor, now);
  if (blocked) throw new ConflictError(STORE_BLOCK_MESSAGES[blocked] || 'This pharmacy cannot take orders right now');

  // Product rules before touching stock: banned/Schedule X, per-order caps,
  // cold chain, and prescription drugs only from stores that dispense them.
  const medicines = await Medicine.find({ _id: { $in: items.map((i) => i.medicineId) } }).lean();
  const medById = new Map(medicines.map((m) => [String(m._id), m]));
  for (const item of items) {
    const med = medById.get(String(item.medicineId));
    const reason = Medicine.onlineSaleBlockReason(med);
    if (reason === 'SCHEDULE_X') throw new ValidationError(`${med.name} is a Schedule X drug and can't be ordered online`);
    if (reason === 'BANNED') throw new ValidationError(`${med.name} is banned and can't be sold`);
    if (reason) throw new ConflictError(`${med ? med.name : 'An item'} is no longer available`);
    if (med.maxQtyPerOrder && item.quantity > med.maxQtyPerOrder) {
      throw new ValidationError(`${med.name}: at most ${med.maxQtyPerOrder} per order`);
    }
    if (med.coldChain && !vendor.hasColdStorage) {
      throw new ConflictError(`${med.name} needs refrigeration and this pharmacy can't store it. Pick another store`);
    }
    if (med.requiresPrescription && vendor.acceptsPrescriptionOrders === false) {
      throw new ConflictError('This pharmacy does not take prescription orders. Pick another store');
    }
  }
  // Monthly caps across every store, plus risk flags for the ops review queue.
  const riskFlags = await compliance.checkPatientLimits(
    patientId, items.map((i) => ({ medicine: medById.get(String(i.medicineId)), quantity: i.quantity })), vendorId, now
  );

  // Serviceability + delivery promise (before touching stock).
  let deliveryPoint;
  let delivery = { eta: serviceability.estimateEta(vendor) };
  if (deliveryLocation && Array.isArray(deliveryLocation.coordinates)) {
    const [lng, lat] = deliveryLocation.coordinates;
    deliveryPoint = serviceability.toPoint(lat, lng);
    delivery = await serviceability.assessDelivery(vendor, deliveryPoint);
    if (!delivery.serviceable) {
      throw new ConflictError('This pharmacy does not deliver to your location right now');
    }
  }

  // Reserve stock atomically before building the order.
  const reserved = await reserveStock(vendorId, items, { now });

  try {
    const orderItems = reserved.map(({ inventory, quantity, batches }) => {
      const med = inventory.medicine;
      const lineTotal = Math.round(inventory.sellingPrice * quantity * 100) / 100;
      return {
        medicine: med._id,
        name: med.name,
        form: med.form,
        packSize: med.packSize,
        quantity,
        unitPrice: inventory.sellingPrice,
        mrp: inventory.mrp,
        lineTotal,
        requiresPrescription: !!med.requiresPrescription,
        scheduleType: med.scheduleType,
        batches: batches || []
      };
    });

    const requiresPrescription = orderItems.some((i) => i.requiresPrescription);
    if (requiresPrescription && !prescriptionKey) {
      throw new ValidationError('This order contains prescription medicines — a prescription upload is required');
    }

    const itemsSubtotal = Math.round(orderItems.reduce((sum, i) => sum + i.lineTotal, 0) * 100) / 100;
    const isStaffPickup = fulfilment === 'STAFF_PICKUP';
    // Delivery fee = store base × zone surge + night surcharge; free for Nabz Plus,
    // big baskets and nurse pickups (config/revenue.js). No basket minimum for pickups.
    const fee = pricingService.quoteDeliveryFee({
      vendor,
      zone: delivery.zone,
      itemsSubtotal,
      isMember: await membershipService.isMember(patientId),
      fulfilment: isStaffPickup ? 'STAFF_PICKUP' : 'DELIVERY'
    });
    const deliveryFee = fee.deliveryFee;
    if (!isStaffPickup && vendor.minOrderValue && itemsSubtotal < vendor.minOrderValue) {
      throw new ValidationError(`Minimum order value for this pharmacy is ₹${vendor.minOrderValue}`);
    }
    const tax = 0; // GST computed at settlement for MVP
    const total = Math.round((itemsSubtotal + deliveryFee + tax) * 100) / 100;
    // The customer confirmed an items total on screen; if the store changed a
    // price since, show the new one instead of silently charging more or less.
    if (quotedSubtotal !== undefined && quotedSubtotal !== null && Math.abs(Number(quotedSubtotal) - itemsSubtotal) > 0.5) {
      throw new ConflictError(`Prices changed since you opened your cart. Items now cost ₹${itemsSubtotal}. Please review and place the order again`, 'quotedSubtotal');
    }
    const isCod = mode === 'COD';

    const order = await PharmacyOrder.create({
      patient: patientId,
      vendor: vendorId,
      items: orderItems,
      requiresPrescription,
      prescription: prescriptionKey ? { key: prescriptionKey, uploadedAt: new Date() } : undefined,
      deliveryAddress,
      deliveryLocation: deliveryPoint,
      zone: delivery.zone ? delivery.zone._id : undefined,
      distanceKm: delivery.distanceKm,
      eta: delivery.eta,
      amounts: { itemsSubtotal, deliveryFee, tax, discount: 0, total, originalTotal: total },
      feeBreakdown: fee.breakdown,
      paymentMode: mode,
      fulfilment: isStaffPickup ? 'STAFF_PICKUP' : 'DELIVERY',
      careVisit: isStaffPickup ? careVisit : undefined,
      // Reserved stock is released by the sweeper if payment never lands.
      paymentExpiresAt: mode === 'PREPAID'
        ? new Date(Date.now() + pharmacyPaymentService.getPaymentTtlMs())
        : undefined,
      // COD orders are live for the store now; PREPAID ones start the clock when paid.
      acceptBy: isCod ? new Date(now.getTime() + getPharmacyOps().acceptSlaSeconds * 1000) : undefined,
      assignmentAttempts: [{ vendor: vendorId, offeredAt: now, outcome: 'PENDING' }],
      // Home deliveries get a 4-digit handover code; nurse pickups don't.
      deliveryOtp: isStaffPickup ? undefined : { code: String(require('crypto').randomInt(0, 10000)).padStart(4, '0') },
      riskFlags,
      checkout,
      status: 'PLACED'
    });

    await recordMovements(reserved.map(({ inventory, quantity }) => ({
      vendor: vendorId,
      medicine: inventory.medicine._id,
      type: 'ORDER_RESERVED',
      delta: -quantity,
      balanceAfter: inventory.stockQty,
      order: order._id,
      actor: { kind: 'PATIENT', id: patientId }
    })));

    // COD orders are actionable now; PREPAID ones alert the store once paid.
    if (isCod) {
      await PharmacyVendor.updateOne({ _id: vendorId }, { $inc: { 'reliability.offered': 1 } }).catch(() => {});
      pharmacyNotificationService.notifyVendorNewOrder(order);
    }
    return order;
  } catch (err) {
    // Order build failed after reservation: return stock (and batches).
    await rollbackReservation(vendorId, reserved);
    throw err;
  }
}

/** Keys are `prescriptions/<patientId>/...` (config/storage.js); no traversal. */
function isOwnPrescriptionKey(key, patientId) {
  if (typeof key !== 'string') return false;
  const normalized = key.replace(/\\/g, '/');
  if (normalized.split('/').includes('..')) return false;
  return normalized.startsWith(`prescriptions/${patientId}/`);
}

async function getOrderById(orderId, requester) {
  if (!mongoose.isValidObjectId(orderId)) throw new ValidationError('Invalid order id');
  const isPatient = requester && requester.type === 'patient';
  const order = await PharmacyOrder.findById(orderId)
    .select(isPatient ? '+deliveryOtp.code' : '')
    .populate('vendor', 'name address location contactPhone')
    .lean();
  if (!order) throw new NotFoundError('Order', orderId);

  // Scope: patient sees own; vendor sees own store's; admins see all.
  if (requester.type === 'patient' && String(order.patient) !== String(requester.id)) {
    throw new AuthorizationError('You can only view your own orders');
  }
  if (requester.role === 'pharmacy_vendor') {
    if (String(order.vendor?._id || order.vendor) !== String(requester.vendorId)) {
      throw new AuthorizationError('You can only view your own store orders');
    }
    // Unpaid prepaid orders don't exist yet as far as the store is concerned.
    if (pharmacyPaymentService.isAwaitingPayment(order)) throw new NotFoundError('Order', orderId);
  }
  return order;
}

async function getPatientOrders(patientId, { status, page = 1, limit = 20 } = {}) {
  const pageNum = Math.max(toNumber(page, 1), 1);
  const limitNum = Math.min(Math.max(toNumber(limit, 20), 1), 100);
  const filter = { patient: patientId };
  if (status && PHARMACY_ORDER_STATUSES.includes(status)) filter.status = status;

  const [orders, total] = await Promise.all([
    PharmacyOrder.find(filter)
      .select('+deliveryOtp.code') // the customer's own orders: they share this code at the door
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate('vendor', 'name address')
      .lean(),
    PharmacyOrder.countDocuments(filter)
  ]);

  return { orders, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } };
}

async function cancelOrderByPatient(orderId, patientId, reason) {
  const order = await PharmacyOrder.findById(orderId);
  if (!order) throw new NotFoundError('Order', orderId);
  if (String(order.patient) !== String(patientId)) {
    throw new AuthorizationError('You can only cancel your own orders');
  }
  // Only cancellable before the store starts preparing.
  if (!['PLACED', 'ACCEPTED'].includes(order.status)) {
    throw new ConflictError(`Order cannot be cancelled once it is ${order.status}`);
  }

  // Claim the transition atomically BEFORE restocking. Read-check-save let a
  // store reject and a customer cancel at the same moment both restock (and
  // both refund); now only the winner of this update does.
  const now = new Date();
  const note = reason || 'Cancelled by patient';
  const { attemptsGuard, closeCurrentAttempt } = assignment();
  const cancelled = await PharmacyOrder.findOneAndUpdate(
    { _id: order._id, patient: patientId, vendor: order.vendor, status: { $in: ['PLACED', 'ACCEPTED'] }, ...attemptsGuard(order) },
    {
      $set: {
        status: 'CANCELLED',
        cancelledBy: 'PATIENT',
        cancellationReason: note,
        'milestones.cancelledAt': now,
        assignmentAttempts: closeCurrentAttempt(order, 'CANCELLED', { now })
      },
      $unset: { acceptBy: 1 },
      $push: { timeline: { status: 'CANCELLED', at: now, note } }
    },
    { new: true }
  );
  if (!cancelled) throw new ConflictError('This order just changed. Refresh to see its latest status');

  await restockOrder(cancelled, { kind: 'PATIENT', id: patientId, reason: 'Cancelled by patient' });
  return pharmacyPaymentService.refundOrderPayment(cancelled, note);
}

/**
 * Return an order's units to stock and log ORDER_RELEASED movements.
 * Never touches `isAvailable`: a vendor-delisted item stays delisted.
 */
async function restockOrder(order, { kind = 'SYSTEM', id, reason } = {}) {
  const lines = order.items.filter((item) => (item.status || 'AVAILABLE') === 'AVAILABLE');
  const movements = await Promise.all(lines.map(async (item) => {
    try {
      // Units from a batch that was quarantined/recalled meanwhile stay off sale.
      const back = await batchService.returnUnits(order.vendor, item.medicine, item.quantity, item.batches);
      const updated = back > 0 ? await incListing(order.vendor, item.medicine, back) : null;
      return {
        vendor: order.vendor,
        medicine: item.medicine,
        type: 'ORDER_RELEASED',
        delta: back,
        balanceAfter: updated ? updated.stockQty : undefined,
        order: order._id,
        actor: { kind, id },
        reason
      };
    } catch (err) {
      logger.error('Restock failed', { orderId: order._id, error: err.message });
      return null;
    }
  }));
  await recordMovements(movements.filter(Boolean));
}

// ── Vendor-facing operations ─────────────────────────────────────────────

async function listVendorOrders(vendorId, { status, page = 1, limit = 20 } = {}) {
  const pageNum = Math.max(toNumber(page, 1), 1);
  const limitNum = Math.min(Math.max(toNumber(limit, 20), 1), 100);
  const filter = { vendor: vendorId, ...pharmacyPaymentService.EXCLUDE_AWAITING_PAYMENT };
  if (status && PHARMACY_ORDER_STATUSES.includes(status)) filter.status = status;

  const [orders, total] = await Promise.all([
    PharmacyOrder.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate('patient', 'name phone')
      .lean(),
    PharmacyOrder.countDocuments(filter)
  ]);
  return { orders, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } };
}

async function updateOrderStatus(orderId, { vendorId, actorUserId, status, note, reasonCode, unavailableMedicineIds, deliveryCode, deliveredWithoutCodeReason }) {
  if (!PHARMACY_ORDER_STATUSES.includes(status)) throw new ValidationError('Invalid order status');
  const order = await PharmacyOrder.findById(orderId).select('+deliveryOtp.code');
  if (!order) throw new NotFoundError('Order', orderId);
  if (String(order.vendor) !== String(vendorId)) {
    throw new AuthorizationError('You can only update your own store orders');
  }
  if (pharmacyPaymentService.isAwaitingPayment(order)) {
    throw new ConflictError('This order is awaiting online payment');
  }

  const allowed = VENDOR_STATUS_TRANSITIONS[order.status] || [];
  if (!allowed.includes(status)) {
    throw new ConflictError(`Cannot move order from ${order.status} to ${status}`);
  }

  // Accept / decline end the store's turn: reliability, SLA and reassignment.
  if (status === 'ACCEPTED') return assignment().acceptOrder(orderId, { vendorId, actorUserId, note });
  if (status === 'REJECTED' || status === 'CANCELLED') {
    return assignment().declineOrder(orderId, {
      vendorId, actorUserId, note, reasonCode: reasonCode || 'OTHER', unavailableMedicineIds: unavailableMedicineIds || []
    });
  }

  // A pharmacist must check the prescription before prescription drugs are packed.
  if (status === 'PREPARING' && order.requiresPrescription && !(order.prescription && order.prescription.verified)) {
    throw new ConflictError('Verify the prescription before packing this order');
  }

  // Delivered needs the customer's handover code (or a reason, flagged for review).
  const deliveryFlags = [];
  if (status === 'DELIVERED' && order.deliveryOtp && order.deliveryOtp.code && !order.deliveryOtp.verifiedAt) {
    const given = String(deliveryCode || '').replace(/[^0-9]/g, '');
    if (given) {
      if ((order.deliveryOtp.failedAttempts || 0) >= 5) {
        throw new ConflictError('Too many wrong codes. Mark delivered without the code and give a reason');
      }
      const ok = given.length === 4 && require('crypto').timingSafeEqual(Buffer.from(given), Buffer.from(order.deliveryOtp.code));
      if (!ok) {
        await PharmacyOrder.updateOne({ _id: order._id }, { $inc: { 'deliveryOtp.failedAttempts': 1 } });
        throw new ValidationError('That delivery code is not right. Ask the customer for the 4-digit code in their app');
      }
    } else {
      const why = String(deliveredWithoutCodeReason || '').trim();
      if (why.length < 5) throw new ValidationError('Enter the customer\'s 4-digit delivery code');
      deliveryFlags.push({ code: 'DELIVERED_WITHOUT_CODE', detail: why.slice(0, 200) });
    }
  }

  // Forward progress: one compare-and-set so a concurrent cancel can't be overwritten.
  const now = new Date();
  const milestone = STATUS_MILESTONES[status];
  const updated = await PharmacyOrder.findOneAndUpdate(
    { _id: order._id, vendor: vendorId, status: order.status },
    {
      $set: {
        status,
        ...(milestone && !(order.milestones && order.milestones[milestone]) ? { [`milestones.${milestone}`]: now } : {}),
        ...(status === 'DELIVERED' ? { deliveredAt: now } : {}),
        ...(status === 'DELIVERED' && order.deliveryOtp && order.deliveryOtp.code
          ? (deliveryFlags.length
            ? { 'deliveryOtp.overrideReason': deliveryFlags[0].detail }
            : { 'deliveryOtp.verifiedAt': now })
          : {})
      },
      $push: {
        timeline: { status, at: now, note: note || (deliveryFlags.length ? `Delivered without code: ${deliveryFlags[0].detail}` : undefined), by: actorUserId },
        ...(deliveryFlags.length ? { riskFlags: { $each: deliveryFlags } } : {})
      }
    },
    { new: true }
  );
  if (!updated) throw new ConflictError('This order just changed. Refresh to see its latest status');
  // Delivered: book the store's payout, our commission and the delivery fee.
  if (status === 'DELIVERED') await settlementService.recordPharmacyOrder(updated);
  return updated;
}

async function upsertInventoryItem(vendorId, { medicineId, mrp, sellingPrice, stockQty, isAvailable, lowStockThreshold, expiryDate, batchNumber }) {
  if (!mongoose.isValidObjectId(medicineId)) throw new ValidationError('Invalid medicineId');
  const medicine = await Medicine.findById(medicineId);
  if (!medicine) throw new NotFoundError('Medicine', medicineId);
  if (toNumber(mrp) === undefined || toNumber(sellingPrice) === undefined) {
    throw new ValidationError('mrp and sellingPrice are required');
  }
  if (Number(sellingPrice) > Number(mrp)) {
    throw new ValidationError('sellingPrice cannot exceed mrp');
  }
  if (!(Number(mrp) > 0)) throw new ValidationError('mrp must be more than 0');
  const blockedReason = Medicine.onlineSaleBlockReason(medicine);
  if (blockedReason === 'BANNED' || blockedReason === 'SCHEDULE_X') {
    throw new ValidationError(`${medicine.name} can't be sold online, so it can't be listed`);
  }
  if (expiryDate !== undefined && expiryDate !== null && Number.isNaN(new Date(expiryDate).getTime())) {
    throw new ValidationError('expiryDate must be a valid date');
  }

  const before = await VendorInventory.findOne({ vendor: vendorId, medicine: medicineId }).select('stockQty').lean();
  if (stockQty !== undefined && before && Number(stockQty) !== before.stockQty && await batchService.hasBatches(vendorId, medicineId)) {
    throw new ConflictError(`${medicine.name} is tracked by batch. Update the batch counts instead`);
  }

  const item = await VendorInventory.findOneAndUpdate(
    { vendor: vendorId, medicine: medicineId },
    {
      $set: {
        mrp: Number(mrp),
        sellingPrice: Number(sellingPrice),
        ...(stockQty !== undefined ? { stockQty: Math.max(Number(stockQty), 0), stockUpdatedAt: new Date() } : {}),
        ...(isAvailable !== undefined ? { isAvailable: !!isAvailable } : {}),
        ...(lowStockThreshold !== undefined ? { lowStockThreshold: Number(lowStockThreshold) } : {}),
        ...(expiryDate ? { expiryDate } : {}),
        ...(batchNumber ? { batchNumber } : {})
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  ).populate('medicine');

  // Recompute the discount via the pre-save hook. Stock level never changes
  // the listing flag (see models/vendorInventory.js).
  await item.save();

  const delta = item.stockQty - ((before && before.stockQty) || 0);
  // 0 → in stock: tell customers who asked to be notified.
  if (item.stockQty > 0 && !((before && before.stockQty) > 0) && item.isAvailable) {
    stockAlerts.onStockAvailable(vendorId, medicineId);
  }
  if (delta !== 0) {
    await recordMovements([{
      vendor: vendorId,
      medicine: medicineId,
      type: 'ADJUSTMENT',
      delta,
      balanceAfter: item.stockQty,
      actor: { kind: 'VENDOR' },
      reason: before ? 'Stock count updated by pharmacy' : 'New listing'
    }]);
  }
  return item;
}

/**
 * "My counts are right": the store confirms its shelf matches the app for
 * some or all listings, refreshing stock freshness without retyping numbers.
 */
async function confirmInventory(vendorId, { medicineIds } = {}) {
  const filter = { vendor: vendorId };
  if (Array.isArray(medicineIds) && medicineIds.length > 0) {
    if (!medicineIds.every((id) => mongoose.isValidObjectId(id))) throw new ValidationError('Invalid medicine id');
    filter.medicine = { $in: medicineIds };
  }
  const result = await VendorInventory.updateMany(filter, { $set: { stockUpdatedAt: new Date() } });
  return { confirmed: result.modifiedCount || 0 };
}

async function listVendorInventory(vendorId, { page = 1, limit = 50 } = {}) {
  const pageNum = Math.max(toNumber(page, 1), 1);
  const limitNum = Math.min(Math.max(toNumber(limit, 50), 1), 200);
  const [items, total] = await Promise.all([
    VendorInventory.find({ vendor: vendorId })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate('medicine')
      .lean(),
    VendorInventory.countDocuments({ vendor: vendorId })
  ]);
  return { items, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } };
}

async function updateVendorProfile(vendorId, updates = {}) {
  const allowed = ['isOpen', 'operatingHours', 'serviceRadiusKm', 'deliveryFee', 'minOrderValue', 'avgPreparationMinutes', 'acceptsPrescriptionOrders', 'contactPhone', 'contactEmail'];
  const patch = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) patch[key] = updates[key];
  }
  const vendor = await PharmacyVendor.findByIdAndUpdate(vendorId, { $set: patch }, { new: true, runValidators: true });
  if (!vendor) throw new NotFoundError('Pharmacy vendor', vendorId);
  return vendor;
}

module.exports = {
  getNearbyVendors,
  searchMedicines,
  getVendorStorefront,
  createOrder,
  getOrderById,
  getPatientOrders,
  cancelOrderByPatient,
  listVendorOrders,
  updateOrderStatus,
  upsertInventoryItem,
  listVendorInventory,
  updateVendorProfile,
  confirmInventory,
  reserveStock,
  restockOrder,
  isOwnPrescriptionKey,
  stampMilestone,
  // exported for tests
  VENDOR_STATUS_TRANSITIONS
};
