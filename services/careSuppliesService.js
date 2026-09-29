/**
 * Home-care supplies — links a nurse/physio visit to a partner pharmacy.
 *
 * Each catalog service lists the supplies it needs (syringe, gauze, IV set,
 * the injection itself, …). At booking time the patient marks each one:
 *   PATIENT_HAS   — "I already have it"
 *   STAFF_BRINGS  — "bring it": bought from the nearest serviceable pharmacy
 *                   that stocks it, as a STAFF_PICKUP PharmacyOrder linked to
 *                   the booking. The store is notified, packs it, and the staff
 *                   collects it on the way; the patient pays at the visit (COD).
 *
 * Stock is reserved atomically by pharmacyService.createOrder (same path as a
 * normal order), so the ledger, Rx rules and vendor notification all apply.
 */

const mongoose = require('mongoose');
const ServiceCatalog = require('../models/serviceCatalog');
const Medicine = require('../models/medicine');
const VendorInventory = require('../models/vendorInventory');
const PharmacyOrder = require('../models/pharmacyOrder');
const serviceability = require('./serviceabilityService');
const pricing = require('./pricingService');
const pharmacyService = require('./pharmacyService');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError, ConflictError } = require('../utils/errors');
const { SERVICE_TYPE_TO_CATALOG_NAME, CATALOG_NAME_TO_SERVICE_TYPE } = require('../constants/careServices');
const { CARE_SUPPLY_SOURCES } = require('../constants/enums');

const SUPPLY_SEARCH_RADIUS_KM = 10;
const PUBLIC_SERVICE_FIELDS = [
  'name', 'displayName', 'category', 'subCategory', 'shortDescription', 'pricing.basePrice',
  'pricing.currency', 'serviceDetails.duration', 'requirements', 'included', 'notIncluded',
  'supplies', 'isFeatured', 'sortOrder'
].join(' ');

async function getCatalogService(serviceType) {
  if (!Object.prototype.hasOwnProperty.call(SERVICE_TYPE_TO_CATALOG_NAME, serviceType)) {
    throw new ValidationError('Unsupported service type');
  }
  const service = await ServiceCatalog.findOne({
    name: SERVICE_TYPE_TO_CATALOG_NAME[serviceType],
    'availability.isActive': true
  }).lean();
  if (!service) throw new NotFoundError('Service');
  return service;
}

/** Bookable services (with their supplies), for the booking screens. */
async function listServices() {
  const services = await ServiceCatalog.find({ 'availability.isActive': true })
    .select(PUBLIC_SERVICE_FIELDS)
    .sort({ category: 1, sortOrder: 1 })
    .lean();
  return services
    .filter((s) => CATALOG_NAME_TO_SERVICE_TYPE[s.name])
    .map((s) => ({
      ...s,
      serviceType: CATALOG_NAME_TO_SERVICE_TYPE[s.name],
      // What the customer pays, with and without Nabz Plus (server-side math).
      pricingPreview: {
        regular: pricing.quoteCareVisit({ basePrice: s.pricing.basePrice }),
        member: pricing.quoteCareVisit({ basePrice: s.pricing.basePrice, isMember: true })
      }
    }));
}

async function resolveMedicines(supplies) {
  const slugs = supplies.map((s) => s.medicineSlug).filter(Boolean);
  if (slugs.length === 0) return new Map();
  const medicines = await Medicine.find({ slug: { $in: slugs }, isActive: { $ne: false } })
    .select('name slug requiresPrescription scheduleType packSize')
    .lean();
  return new Map(medicines.map((m) => [m.slug, m]));
}

/**
 * Nearest serviceable store that can supply the most of `medicineIds`
 * (ties → nearest). Returns { vendor, stock: Map<medicineId, inventory> } or null.
 */
async function pickSupplier(point, medicineIds, preferredVendorId) {
  if (medicineIds.length === 0) return null;
  const [lng, lat] = point.coordinates;
  const { vendors } = await serviceability.findServiceableVendors({ lat, lng, radiusKm: SUPPLY_SEARCH_RADIUS_KM, limit: 10 });
  const candidates = preferredVendorId
    ? vendors.filter((v) => String(v._id) === String(preferredVendorId))
    : vendors;
  if (candidates.length === 0) return null;

  const inventory = await VendorInventory.find({
    vendor: { $in: candidates.map((v) => v._id) },
    medicine: { $in: medicineIds },
    isAvailable: true,
    stockQty: { $gt: 0 }
  }).select('vendor medicine sellingPrice mrp stockQty').lean();

  let best = null;
  for (const vendor of candidates) { // nearest first
    const stock = new Map(inventory
      .filter((row) => String(row.vendor) === String(vendor._id))
      .map((row) => [String(row.medicine), row]));
    if (!best || stock.size > best.stock.size) best = { vendor, stock };
    if (stock.size === medicineIds.length) break;
  }
  return best && best.stock.size > 0 ? best : null;
}

/**
 * What the visit needs, where "staff brings" items would come from, and their
 * prices. Public: shown before login on the booking screen.
 */
async function quoteSupplies({ serviceType, lat, lng, vendorId }) {
  const service = await getCatalogService(serviceType);
  const supplies = service.supplies || [];
  const point = serviceability.toPoint(lat, lng);
  const medicines = await resolveMedicines(supplies);
  const medicineIds = [...medicines.values()].map((m) => m._id);
  const supplier = await pickSupplier(point, medicineIds, vendorId);

  const items = supplies.map((supply) => {
    const medicine = supply.medicineSlug ? medicines.get(supply.medicineSlug) : undefined;
    const stock = medicine && supplier ? supplier.stock.get(String(medicine._id)) : undefined;
    const quantity = supply.quantity || 1;
    return {
      key: supply.key,
      name: supply.name,
      kind: supply.kind,
      quantity,
      note: supply.note,
      defaultSource: supply.defaultSource,
      medicineId: medicine ? String(medicine._id) : null,
      productName: medicine ? medicine.name : null,
      requiresPrescription: !!(medicine && medicine.requiresPrescription),
      available: !!(stock && stock.stockQty >= quantity),
      unitPrice: stock ? stock.sellingPrice : null
    };
  });

  return {
    serviceType,
    serviceName: service.displayName || service.name,
    basePrice: service.pricing && service.pricing.basePrice,
    vendor: supplier ? {
      _id: String(supplier.vendor._id),
      name: supplier.vendor.name,
      distanceKm: supplier.vendor.distanceKm
    } : null,
    items
  };
}

/** Validate the patient's per-item choices against the catalog. */
function normalizeSelections(supplies, selections) {
  if (!Array.isArray(selections)) return [];
  const byKey = new Map(supplies.map((s) => [s.key, s]));
  const seen = new Set();
  return selections.map((sel) => {
    const key = sel && typeof sel.key === 'string' ? sel.key : '';
    const supply = byKey.get(key);
    if (!supply) throw new ValidationError(`Unknown supply item: ${key || '(empty)'}`);
    if (seen.has(key)) throw new ValidationError(`Supply item listed twice: ${key}`);
    seen.add(key);
    if (!CARE_SUPPLY_SOURCES.includes(sel.source)) {
      throw new ValidationError(`Choose who provides ${supply.name}`);
    }
    // A medicine with no catalog product (e.g. "your prescribed injection")
    // can't be bought for the patient; consumables without one come from the staff kit.
    if (sel.source === 'STAFF_BRINGS' && !supply.medicineSlug && supply.kind === 'MEDICINE') {
      throw new ValidationError(`${supply.name} must be provided by you`);
    }
    return { supply, source: sel.source };
  });
}

/**
 * Place the STAFF_PICKUP pharmacy order for a just-created booking and return
 * the `supplies` sub-document. Throws (caller rolls the booking back) when the
 * staff can't source what the patient asked for.
 */
async function orderSuppliesForBooking(booking, selections, { patientId, prescriptionKey, vendorId } = {}) {
  const service = await getCatalogService(booking.serviceType);
  const chosen = normalizeSelections(service.supplies || [], selections);
  if (chosen.length === 0) return undefined;

  const medicines = await resolveMedicines(chosen.map((c) => c.supply));
  const toBring = chosen.filter((c) => c.source === 'STAFF_BRINGS' && c.supply.medicineSlug);
  const itemsDoc = chosen.map(({ supply, source }) => {
    const medicine = supply.medicineSlug ? medicines.get(supply.medicineSlug) : undefined;
    return {
      key: supply.key,
      name: supply.name,
      medicine: medicine ? medicine._id : undefined,
      quantity: supply.quantity || 1,
      source
    };
  });

  if (toBring.length === 0) {
    return { items: itemsDoc, status: 'NONE', amount: 0 };
  }

  const coords = booking.serviceLocation && booking.serviceLocation.address && booking.serviceLocation.address.coordinates;
  if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
    throw new ValidationError('Share your location so we can find a pharmacy for the supplies');
  }
  const point = serviceability.toPoint(coords.lat, coords.lng);

  const missing = toBring.filter((c) => !medicines.get(c.supply.medicineSlug));
  if (missing.length > 0) {
    throw new ConflictError(`${missing.map((c) => c.supply.name).join(', ')} is not sold by partner pharmacies yet — mark it "I have it"`);
  }
  const wanted = toBring.map((c) => medicines.get(c.supply.medicineSlug)._id);
  const supplier = await pickSupplier(point, wanted, vendorId);
  const unavailable = toBring.filter((c) => {
    const stock = supplier && supplier.stock.get(String(medicines.get(c.supply.medicineSlug)._id));
    return !stock || stock.stockQty < (c.supply.quantity || 1);
  });
  if (!supplier || unavailable.length > 0) {
    const names = (unavailable.length ? unavailable : toBring).map((c) => c.supply.name).join(', ');
    throw new ConflictError(`No nearby pharmacy has ${names} right now — mark it "I have it" or try later`);
  }

  const address = booking.serviceLocation.address;
  const order = await pharmacyService.createOrder(patientId, {
    vendorId: String(supplier.vendor._id),
    items: toBring.map((c) => ({
      medicineId: String(medicines.get(c.supply.medicineSlug)._id),
      quantity: c.supply.quantity || 1
    })),
    deliveryAddress: {
      label: 'Home-care visit',
      line1: address.street,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      contactPhone: booking.serviceLocation.contactPhone
    },
    deliveryLocation: { coordinates: point.coordinates },
    prescriptionKey,
    paymentMode: 'COD'
  }, {
    fulfilment: 'STAFF_PICKUP',
    careVisit: {
      booking: booking._id,
      serviceType: booking.serviceType,
      scheduledDate: booking.scheduledDate,
      scheduledTime: booking.scheduledTime
    }
  });

  const priced = new Map(order.items.map((i) => [String(i.medicine), i]));
  for (const item of itemsDoc) {
    const line = item.source === 'STAFF_BRINGS' && item.medicine ? priced.get(String(item.medicine)) : undefined;
    if (line) {
      item.unitPrice = line.unitPrice;
      item.lineTotal = line.lineTotal;
    }
  }

  logger.info('Home-care supplies ordered', {
    bookingId: String(booking._id), orderId: String(order._id), vendorId: String(supplier.vendor._id)
  });
  return {
    items: itemsDoc,
    pharmacyVendor: supplier.vendor._id,
    pharmacyOrder: order._id,
    amount: order.amounts.total,
    status: 'ORDERED'
  };
}

/** Cancel the linked supplies order (and restock) when the visit is cancelled. Never throws. */
async function cancelSuppliesForBooking(booking, reason) {
  const orderId = booking.supplies && booking.supplies.pharmacyOrder;
  if (!orderId) return null;
  try {
    const order = await PharmacyOrder.findById(orderId).select('status patient');
    if (order && ['PLACED', 'ACCEPTED'].includes(order.status)) {
      await pharmacyService.cancelOrderByPatient(order._id, order.patient, reason || 'Home-care visit cancelled');
    } else if (order && !['CANCELLED', 'REJECTED'].includes(order.status)) {
      // Already packed/collected: the store keeps it for a return, ops follow up.
      logger.warn('Supplies order not auto-cancelled (already in progress)', {
        bookingId: String(booking._id), orderId: String(orderId), status: order.status
      });
      return order.status;
    }
    await mongoose.model('NurseBooking').updateOne(
      { _id: booking._id },
      { $set: { 'supplies.status': 'CANCELLED' } }
    );
    return 'CANCELLED';
  } catch (err) {
    logger.error('Failed to cancel home-care supplies order', {
      bookingId: String(booking._id), orderId: String(orderId), error: err.message
    });
    return null;
  }
}

module.exports = {
  listServices,
  quoteSupplies,
  orderSuppliesForBooking,
  cancelSuppliesForBooking,
  normalizeSelections
};
