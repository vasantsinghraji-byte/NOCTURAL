/**
 * Pharmacy Admin Service
 *
 * Platform-admin operations for the marketplace: onboarding/approving
 * pharmacy vendors (admin-seeded model) and curating the master medicine
 * catalog. Vendor login accounts are Users with role 'pharmacy_vendor'
 * linked back to the PharmacyVendor via `user.pharmacyVendor`.
 */

const mongoose = require('mongoose');
const PharmacyVendor = require('../models/pharmacyVendor');
const Medicine = require('../models/medicine');
const User = require('../models/user');
const ServiceZone = require('../models/serviceZone');
const serviceability = require('./serviceabilityService');
const {
  ValidationError,
  NotFoundError,
  ConflictError
} = require('../utils/errors');
const { PHARMACY_VENDOR_STATUSES, ZONE_STRESS_LEVELS } = require('../constants/enums');

// Default radius multipliers when ops raise stress without a custom value.
const STRESS_DEFAULT_MULTIPLIER = { NORMAL: 1, HIGH: 0.7, SEVERE: 0.4 };

const slugify = (value) => String(value || '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '');

/**
 * Create a vendor store and (optionally) its owner login account.
 * payload: { name, address, location:{coordinates:[lng,lat]}, owner:{name,email,password,phone}, ... }
 */
async function createVendor(payload = {}, createdByUserId) {
  if (!payload.name) throw new ValidationError('Vendor name is required');

  const slug = slugify(payload.name) || `vendor-${Date.now().toString(36)}`;
  const existing = await PharmacyVendor.findOne({ slug });
  if (existing) throw new ConflictError('A vendor with a similar name already exists', 'slug');

  const vendor = await PharmacyVendor.create({
    name: payload.name,
    slug,
    contactPhone: payload.contactPhone,
    contactEmail: payload.contactEmail,
    drugLicenseNumber: payload.drugLicenseNumber,
    drugLicenseExpiry: payload.drugLicenseExpiry,
    pharmacist: payload.pharmacist,
    hasColdStorage: !!payload.hasColdStorage,
    gstin: payload.gstin,
    address: payload.address,
    location: payload.location && Array.isArray(payload.location.coordinates)
      ? { type: 'Point', coordinates: payload.location.coordinates }
      : undefined,
    serviceRadiusKm: payload.serviceRadiusKm,
    operatingHours: payload.operatingHours,
    deliveryFee: payload.deliveryFee,
    minOrderValue: payload.minOrderValue,
    status: 'PENDING',
    verifiedBy: createdByUserId
  });

  if (vendor.location && vendor.location.coordinates) {
    const zone = await serviceability.resolveZone(vendor.location);
    if (zone) {
      vendor.zone = zone._id;
      await vendor.save();
    }
  }

  // Optionally provision the owner login account.
  let owner = null;
  if (payload.owner && payload.owner.email && payload.owner.password) {
    const dupe = await User.findOne({ email: String(payload.owner.email).toLowerCase() });
    if (dupe) {
      await PharmacyVendor.deleteOne({ _id: vendor._id });
      throw new ConflictError('A user with this email already exists', 'email');
    }
    owner = await User.create({
      name: payload.owner.name || payload.name,
      email: payload.owner.email,
      password: payload.owner.password, // hashed by User pre-save hook
      phone: payload.owner.phone,
      role: 'pharmacy_vendor',
      pharmacyVendor: vendor._id,
      isVerified: true
    });
    vendor.owner = owner._id;
    await vendor.save();
  }

  return { vendor, owner: owner ? { id: owner._id, email: owner.email, role: owner.role } : null };
}

async function setVendorStatus(vendorId, status, adminUserId) {
  if (!PHARMACY_VENDOR_STATUSES.includes(status)) throw new ValidationError('Invalid vendor status');
  const patch = { status };
  if (status === 'APPROVED') {
    patch.verifiedAt = new Date();
    patch.verifiedBy = adminUserId;
  }
  const vendor = await PharmacyVendor.findByIdAndUpdate(vendorId, { $set: patch }, { new: true });
  if (!vendor) throw new NotFoundError('Pharmacy vendor', vendorId);
  return vendor;
}

async function listVendors({ status, page = 1, limit = 20 } = {}) {
  const pageNum = Math.max(Number(page) || 1, 1);
  const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const filter = {};
  if (status && PHARMACY_VENDOR_STATUSES.includes(status)) filter.status = status;

  const [vendors, total] = await Promise.all([
    PharmacyVendor.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    PharmacyVendor.countDocuments(filter)
  ]);
  return { vendors, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } };
}

async function createMedicine(payload = {}) {
  if (!payload.name) throw new ValidationError('Medicine name is required');
  const slug = slugify(`${payload.name}-${payload.strength || ''}-${payload.packSize || ''}`) || slugify(payload.name);
  const dupe = await Medicine.findOne({ slug });
  if (dupe) throw new ConflictError('This medicine (name/strength/pack) already exists', 'slug');

  return Medicine.create({ ...payload, slug });
}

// Fields an admin may change on a master medicine (slug/saltKey are derived).
const MEDICINE_EDITABLE = [
  'name', 'genericName', 'composition', 'brand', 'manufacturer', 'form', 'strength', 'packSize',
  'packUnits', 'barcodes', 'scheduleType', 'category', 'hsn', 'gstPercentage', 'images', 'description',
  'usage', 'sideEffects', 'warnings', 'referenceMrp', 'isActive', 'coldChain', 'isBanned',
  'isDiscontinued', 'maxQtyPerOrder'
];

async function updateMedicine(medicineId, updates = {}) {
  if (!mongoose.isValidObjectId(medicineId)) throw new ValidationError('Invalid medicine id');
  const medicine = await Medicine.findById(medicineId);
  if (!medicine) throw new NotFoundError('Medicine', medicineId);
  for (const key of MEDICINE_EDITABLE) {
    if (updates[key] !== undefined) medicine.set(key, updates[key]);
  }
  // save() (not findByIdAndUpdate) so the validate hook re-derives saltKey and
  // the prescription flag. Banning/discontinuing takes effect everywhere at
  // once: search, cart planning and stock reservation all check these flags.
  await medicine.save();
  return medicine;
}

async function listMedicines({ q, category, page = 1, limit = 50 } = {}) {
  const pageNum = Math.max(Number(page) || 1, 1);
  const limitNum = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const filter = {};
  if (category) filter.category = category;
  if (q) filter.$text = { $search: q };

  const [medicines, total] = await Promise.all([
    Medicine.find(filter).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
    Medicine.countDocuments(filter)
  ]);
  return { medicines, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } };
}

// ── Service zones (serviceability polygons + stress lever) ──────────────

/** (Re)link every store located inside a zone's boundary to that zone. */
async function assignVendorsToZone(zone) {
  await PharmacyVendor.updateMany({ zone: zone._id }, { $unset: { zone: 1 } });
  const result = await PharmacyVendor.updateMany(
    { location: { $geoWithin: { $geometry: zone.boundary } } },
    { $set: { zone: zone._id } }
  );
  return result.modifiedCount || 0;
}

async function createZone(payload = {}, adminUserId) {
  const { code, name, city, boundary, maxLastMileKm } = payload;
  if (!code || !name || !city || !boundary) {
    throw new ValidationError('code, name, city and boundary (GeoJSON Polygon) are required');
  }
  const dupe = await ServiceZone.findOne({ code: String(code).toUpperCase() });
  if (dupe) throw new ConflictError('A zone with this code already exists', 'code');

  // MongoDB's 2dsphere index rejects self-intersecting / unclosed rings here.
  const zone = await ServiceZone.create({
    code, name, city, boundary, maxLastMileKm,
    stress: { level: 'NORMAL', radiusMultiplier: 1, updatedBy: adminUserId, updatedAt: new Date() }
  });
  const vendorsAssigned = await assignVendorsToZone(zone);
  return { zone, vendorsAssigned };
}

async function listZones({ city } = {}) {
  const filter = city ? { city } : {};
  const zones = await ServiceZone.find(filter).sort({ city: 1, code: 1 }).lean();
  return { zones };
}

/**
 * Update a zone. `stress` is the ops lever: { level, radiusMultiplier?, reason?, until? }.
 * `isActive:false` pauses deliveries into the zone entirely.
 */
async function updateZone(zoneId, updates = {}, adminUserId) {
  if (!mongoose.isValidObjectId(zoneId)) throw new ValidationError('Invalid zone id');
  const zone = await ServiceZone.findById(zoneId);
  if (!zone) throw new NotFoundError('Service zone', zoneId);

  for (const key of ['name', 'isActive', 'maxLastMileKm']) {
    if (updates[key] !== undefined) zone[key] = updates[key];
  }
  if (updates.stress) {
    const { level, radiusMultiplier, reason, until } = updates.stress;
    if (!ZONE_STRESS_LEVELS.includes(level)) throw new ValidationError('Invalid stress level');
    zone.stress = {
      level,
      radiusMultiplier: level === 'NORMAL' ? 1 : (radiusMultiplier ?? STRESS_DEFAULT_MULTIPLIER[level]),
      reason: level === 'NORMAL' ? undefined : reason,
      until: level === 'NORMAL' ? undefined : until,
      updatedBy: adminUserId,
      updatedAt: new Date()
    };
  }
  const boundaryChanged = updates.boundary !== undefined;
  if (boundaryChanged) zone.boundary = updates.boundary;

  await zone.save();
  const vendorsAssigned = boundaryChanged ? await assignVendorsToZone(zone) : undefined;
  return { zone, vendorsAssigned };
}

module.exports = {
  createZone,
  listZones,
  updateZone,
  createVendor,
  setVendorStatus,
  listVendors,
  createMedicine,
  updateMedicine,
  listMedicines
};
