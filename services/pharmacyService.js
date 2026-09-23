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
      inStock: row.stockQty > 0,
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
        inStock: row.stockQty > 0
      }))
  };
}

/**
 * Reserve stock atomically for each item; roll back on partial failure.
 * Returns the list of successfully reserved { inventory, quantity } pairs.
 */
async function reserveStock(vendorId, requestedItems) {
  const reserved = [];
  try {
    for (const item of requestedItems) {
      const updated = await VendorInventory.findOneAndUpdate(
        {
          vendor: vendorId,
          medicine: item.medicineId,
          isAvailable: true,
          stockQty: { $gte: item.quantity }
        },
        { $inc: { stockQty: -item.quantity } },
        { new: true }
      ).populate('medicine');

      if (!updated) {
        throw new ConflictError('One or more items are out of stock at this pharmacy');
      }
      if (!updated.medicine) {
        // The master medicine was removed after the listing was read — undo this
        // decrement and fail cleanly (the catch rolls back everything else).
        await VendorInventory.updateOne({ _id: updated._id }, { $inc: { stockQty: item.quantity } }).catch(() => {});
        throw new ConflictError('An item in your cart is no longer available');
      }
      reserved.push({ inventory: updated, quantity: item.quantity });
    }
    return reserved;
  } catch (err) {
    // Roll back everything reserved so far.
    await Promise.all(reserved.map((r) => VendorInventory.updateOne(
      { _id: r.inventory._id },
      { $inc: { stockQty: r.quantity } }
    ).catch((rollbackErr) => {
      logger.error('Stock rollback failed', { inventoryId: r.inventory._id, error: rollbackErr.message });
    })));
    throw err;
  }
}

/**
 * Place a pharmacy order for a patient.
 * payload: { vendorId, items:[{medicineId, quantity}], deliveryAddress, deliveryLocation, prescriptionKey, paymentMode }
 */
async function createOrder(patientId, payload = {}, { fulfilment = 'DELIVERY', careVisit } = {}) {
  // `fulfilment`/`careVisit` are set only by internal callers (home-care
  // supplies), never from the request body.
  const { vendorId, items, deliveryAddress, deliveryLocation, prescriptionKey, paymentMode } = payload;

  if (!mongoose.isValidObjectId(vendorId)) {
    throw new ValidationError('A valid vendorId is required');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new ValidationError('At least one order item is required');
  }
  for (const item of items) {
    if (!mongoose.isValidObjectId(item.medicineId) || !Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new ValidationError('Each item needs a valid medicineId and quantity >= 1');
    }
  }
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
  if (!vendor.isOpen) throw new ConflictError('This pharmacy is currently closed');

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
  const reserved = await reserveStock(vendorId, items);

  try {
    const orderItems = reserved.map(({ inventory, quantity }) => {
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
        requiresPrescription: !!med.requiresPrescription
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
      amounts: { itemsSubtotal, deliveryFee, tax, discount: 0, total },
      feeBreakdown: fee.breakdown,
      paymentMode: mode,
      fulfilment: isStaffPickup ? 'STAFF_PICKUP' : 'DELIVERY',
      careVisit: isStaffPickup ? careVisit : undefined,
      // Reserved stock is released by the sweeper if payment never lands.
      paymentExpiresAt: mode === 'PREPAID'
        ? new Date(Date.now() + pharmacyPaymentService.getPaymentTtlMs())
        : undefined,
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
    if (mode === 'COD') {
      pharmacyNotificationService.notifyVendorNewOrder(order);
    }
    return order;
  } catch (err) {
    // Order build failed after reservation — return stock.
    await Promise.all(reserved.map((r) => VendorInventory.updateOne(
      { _id: r.inventory._id },
      { $inc: { stockQty: r.quantity } }
    ).catch(() => {})));
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
  const order = await PharmacyOrder.findById(orderId)
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

  await restockOrder(order, { kind: 'PATIENT', id: patientId, reason: 'Cancelled by patient' });
  order.status = 'CANCELLED';
  stampMilestone(order, 'CANCELLED');
  order.cancelledBy = 'PATIENT';
  order.cancellationReason = reason || 'Cancelled by patient';
  order.timeline.push({ status: 'CANCELLED', at: new Date(), note: order.cancellationReason });
  await order.save();
  return pharmacyPaymentService.refundOrderPayment(order, order.cancellationReason);
}

/**
 * Return an order's units to stock and log ORDER_RELEASED movements.
 * Never touches `isAvailable`: a vendor-delisted item stays delisted.
 */
async function restockOrder(order, { kind = 'SYSTEM', id, reason } = {}) {
  const movements = await Promise.all(order.items.map(async (item) => {
    try {
      const updated = await VendorInventory.findOneAndUpdate(
        { vendor: order.vendor, medicine: item.medicine },
        { $inc: { stockQty: item.quantity } },
        { new: true }
      );
      return {
        vendor: order.vendor,
        medicine: item.medicine,
        type: 'ORDER_RELEASED',
        delta: item.quantity,
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

async function updateOrderStatus(orderId, { vendorId, actorUserId, status, note }) {
  if (!PHARMACY_ORDER_STATUSES.includes(status)) throw new ValidationError('Invalid order status');
  const order = await PharmacyOrder.findById(orderId);
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

  if (status === 'REJECTED' || status === 'CANCELLED') {
    await restockOrder(order, { kind: 'VENDOR', id: actorUserId, reason: `Order ${status.toLowerCase()} by pharmacy` });
    order.cancelledBy = 'VENDOR';
    if (status === 'REJECTED') order.rejectionReason = note || 'Rejected by pharmacy';
    else order.cancellationReason = note || 'Cancelled by pharmacy';
  }
  if (status === 'DELIVERED') order.deliveredAt = new Date();

  order.status = status;
  stampMilestone(order, status);
  order.timeline.push({ status, at: new Date(), note, by: actorUserId });
  await order.save();
  if (status === 'REJECTED' || status === 'CANCELLED') {
    return pharmacyPaymentService.refundOrderPayment(order, note || `Order ${status.toLowerCase()} by pharmacy`);
  }
  // Delivered: book the store's payout, our commission and the delivery fee.
  if (status === 'DELIVERED') await settlementService.recordPharmacyOrder(order);
  return order;
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

  const before = await VendorInventory.findOne({ vendor: vendorId, medicine: medicineId }).select('stockQty').lean();

  const item = await VendorInventory.findOneAndUpdate(
    { vendor: vendorId, medicine: medicineId },
    {
      $set: {
        mrp: Number(mrp),
        sellingPrice: Number(sellingPrice),
        ...(stockQty !== undefined ? { stockQty: Math.max(Number(stockQty), 0) } : {}),
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
  restockOrder,
  isOwnPrescriptionKey,
  stampMilestone,
  // exported for tests
  VENDOR_STATUS_TRANSITIONS
};
