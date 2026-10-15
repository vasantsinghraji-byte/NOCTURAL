/**
 * MedRush data model — integration against a real MongoDB.
 *
 * Geo semantics ($geoNear, $geoIntersects), atomic stock and the ledger can't
 * be proven with mocks. Like the other integration suites this skips when
 * MONGODB_URI is unreachable. Locally:
 *   npx mongodb-memory-server  (or any mongod) → MONGODB_URI=... npx jest tests/integration/medrush-data-model.test.js
 */

const mongoose = require('mongoose');
const PharmacyVendor = require('../../models/pharmacyVendor');
const Medicine = require('../../models/medicine');
const VendorInventory = require('../../models/vendorInventory');
const PharmacyOrder = require('../../models/pharmacyOrder');
const ServiceZone = require('../../models/serviceZone');
const InventoryMovement = require('../../models/inventoryMovement');
const pharmacyService = require('../../services/pharmacyService');
const pharmacyAdminService = require('../../services/pharmacyAdminService');

// Customer in Koramangala, Bengaluru. 1° latitude ≈ 111.2 km.
const HOME = { lat: 12.9352, lng: 77.6245 };
const northOf = (km) => [HOME.lng, HOME.lat + km / 111.2];

// Square polygon (~±5 km) around HOME.
const d = 5 / 111.2;
const ZONE_BOUNDARY = {
  type: 'Polygon',
  coordinates: [[
    [HOME.lng - d, HOME.lat - d], [HOME.lng + d, HOME.lat - d],
    [HOME.lng + d, HOME.lat + d], [HOME.lng - d, HOME.lat + d],
    [HOME.lng - d, HOME.lat - d]
  ]]
};

const RUN = `dm-${Date.now().toString(36)}`;
const patientId = new mongoose.Types.ObjectId();

describe('MedRush data model (real MongoDB)', () => {
  let databaseAvailable = false;
  let nearStore;
  let farStore;
  let smallRadiusStore;
  let medicine;

  const vendorFixture = (name, km, serviceRadiusKm) => ({
    name: `${name} ${RUN}`,
    slug: `${name.toLowerCase().replace(/\s+/g, '-')}-${RUN}`,
    location: { type: 'Point', coordinates: northOf(km) },
    serviceRadiusKm,
    status: 'APPROVED',
    isActive: true,
    isOpen: true,
    avgPreparationMinutes: 10,
    deliveryFee: 20
  });

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      try {
        // Indexes are built explicitly below; Mongoose's automatic build for
        // every loaded model (User included) can stall concurrent createIndexes.
        await mongoose.connect(process.env.MONGODB_URI, {
          serverSelectionTimeoutMS: Number(process.env.TEST_MONGO_SERVER_SELECTION_TIMEOUT_MS) || 3000,
          autoIndex: false
        });
        databaseAvailable = true;
      } catch (error) {
        console.warn(`Skipping MedRush data-model integration: MongoDB unavailable (${error.message})`);
        return;
      }
    } else {
      databaseAvailable = true;
    }

    for (const Model of [PharmacyVendor, ServiceZone, Medicine, VendorInventory, PharmacyOrder, InventoryMovement]) {
      await Model.createIndexes();
    }

    [nearStore, farStore, smallRadiusStore] = await PharmacyVendor.create([
      vendorFixture('Near Store', 1, 5),
      vendorFixture('Far Store', 3, 5),
      vendorFixture('Small Radius Store', 4, 3) // 4 km away but only delivers 3 km
    ]);
    medicine = await Medicine.create({ name: `Paracetamol ${RUN}`, slug: `paracetamol-${RUN}` });
    await VendorInventory.create({ vendor: nearStore._id, medicine: medicine._id, mrp: 30, sellingPrice: 25, stockQty: 10 });
  });

  afterAll(async () => {
    if (!databaseAvailable) return;
    const vendorIds = [nearStore, farStore, smallRadiusStore].filter(Boolean).map((v) => v._id);
    await Promise.all([
      PharmacyVendor.deleteMany({ _id: { $in: vendorIds } }),
      VendorInventory.deleteMany({ vendor: { $in: vendorIds } }),
      PharmacyOrder.deleteMany({ vendor: { $in: vendorIds } }),
      InventoryMovement.deleteMany({ vendor: { $in: vendorIds } }),
      ServiceZone.deleteMany({ code: new RegExp(`^${RUN.toUpperCase()}`) }),
      medicine && Medicine.deleteOne({ _id: medicine._id })
    ]);
    await mongoose.connection.close();
  });

  const nearbyIds = async () => {
    const { vendors, serviceability } = await pharmacyService.getNearbyVendors({ ...HOME, radiusKm: 10 });
    return { ids: vendors.map((v) => String(v._id)), vendors, serviceability };
  };

  const placeCodOrder = (overrides = {}) => pharmacyService.createOrder(patientId, {
    vendorId: String(nearStore._id),
    items: [{ medicineId: String(medicine._id), quantity: 2 }],
    deliveryAddress: { line1: '1 Test Road', pincode: '560034' },
    deliveryLocation: { coordinates: [HOME.lng, HOME.lat] },
    paymentMode: 'COD',
    ...overrides
  });

  it('derives geohash on vendors, including insertMany-style writes', () => {
    if (!databaseAvailable) return;
    expect(nearStore.geohash).toMatch(/^tdr1/);
  });

  it('radial fallback enforces each store\'s own delivery radius', async () => {
    if (!databaseAvailable) return;
    const { ids, vendors, serviceability } = await nearbyIds();

    expect(serviceability).toMatchObject({ zone: null, serviceable: true });
    expect(ids).toEqual(expect.arrayContaining([String(nearStore._id), String(farStore._id)]));
    expect(ids).not.toContain(String(smallRadiusStore._id)); // was returned before this fix
    const near = vendors.find((v) => String(v._id) === String(nearStore._id));
    expect(near.distanceKm).toBeCloseTo(1, 1);
    expect(near.eta.promisedAt).toBeInstanceOf(Date);
  });

  it('zone stress shrinks serviceability; pausing the zone stops it', async () => {
    if (!databaseAvailable) return;
    const { zone, vendorsAssigned } = await pharmacyAdminService.createZone({
      code: `${RUN.toUpperCase()}-KORA`, name: 'Koramangala', city: 'Bengaluru', boundary: ZONE_BOUNDARY, maxLastMileKm: 7
    });
    expect(vendorsAssigned).toBeGreaterThanOrEqual(3);

    let result = await nearbyIds();
    expect(result.serviceability.zone.code).toBe(`${RUN.toUpperCase()}-KORA`);
    expect(result.ids).toContain(String(farStore._id));

    // Heavy rain: SEVERE → 0.4 × 5 km = 2 km. The 3 km store drops out.
    await pharmacyAdminService.updateZone(zone._id, { stress: { level: 'SEVERE', reason: 'Heavy rain' } });
    result = await nearbyIds();
    expect(result.serviceability.stressLevel).toBe('SEVERE');
    expect(result.ids).toContain(String(nearStore._id));
    expect(result.ids).not.toContain(String(farStore._id));

    await pharmacyAdminService.updateZone(zone._id, { isActive: false });
    result = await nearbyIds();
    expect(result.serviceability).toMatchObject({ serviceable: false, reason: 'ZONE_PAUSED' });
    expect(result.ids).toEqual([]);

    await pharmacyAdminService.updateZone(zone._id, { isActive: true, stress: { level: 'NORMAL' } });
  });

  it('rejects checkout outside the store\'s range without touching stock', async () => {
    if (!databaseAvailable) return;
    await expect(placeCodOrder({ deliveryLocation: { coordinates: northOf(-6) } }))
      .rejects.toMatchObject({ statusCode: 409 });
    const inv = await VendorInventory.findOne({ vendor: nearStore._id, medicine: medicine._id });
    expect(inv.stockQty).toBe(10);
  });

  it('snapshots zone/distance/ETA/milestones and ledgers the reservation', async () => {
    if (!databaseAvailable) return;
    const order = await placeCodOrder();

    expect(order.deliveryGeohash).toMatch(/^tdr1/);
    expect(order.distanceKm).toBeCloseTo(1, 1);
    expect(order.zone).toBeDefined();
    expect(order.eta.promisedAt).toBeInstanceOf(Date);
    expect(order.milestones.placedAt).toBeInstanceOf(Date);

    const inv = await VendorInventory.findOne({ vendor: nearStore._id, medicine: medicine._id });
    expect(inv.stockQty).toBe(8);
    const reserved = await InventoryMovement.findOne({ order: order._id, type: 'ORDER_RESERVED' });
    expect(reserved).toMatchObject({ delta: -2, balanceAfter: 8 });
  });

  it('cancelling restocks and ledgers it, but never re-lists a delisted item', async () => {
    if (!databaseAvailable) return;
    const order = await placeCodOrder();
    // Vendor switches the item off while the order is open.
    await VendorInventory.updateOne({ vendor: nearStore._id, medicine: medicine._id }, { $set: { isAvailable: false } });

    const cancelled = await pharmacyService.cancelOrderByPatient(order._id, patientId, 'Changed my mind');
    expect(cancelled.milestones.cancelledAt).toBeInstanceOf(Date);

    const inv = await VendorInventory.findOne({ vendor: nearStore._id, medicine: medicine._id });
    expect(inv.stockQty).toBe(8); // 8 before this order → 6 → back to 8
    expect(inv.isAvailable).toBe(false); // stays delisted (bug before: forced back to true)
    const released = await InventoryMovement.findOne({ order: order._id, type: 'ORDER_RELEASED' });
    expect(released).toMatchObject({ delta: 2, balanceAfter: 8, actor: { kind: 'PATIENT' } });
  });

  it('records vendor stock counts as ADJUSTMENT and running out does not delist', async () => {
    if (!databaseAvailable) return;
    await VendorInventory.updateOne({ vendor: nearStore._id, medicine: medicine._id }, { $set: { isAvailable: true } });
    const item = await pharmacyService.upsertInventoryItem(nearStore._id, {
      medicineId: String(medicine._id), mrp: 30, sellingPrice: 25, stockQty: 0
    });
    expect(item.stockQty).toBe(0);
    expect(item.isAvailable).toBe(true); // listed, just out of stock

    const adj = await InventoryMovement.findOne({ vendor: nearStore._id, type: 'ADJUSTMENT' }).sort({ createdAt: -1 });
    expect(adj).toMatchObject({ delta: -8, balanceAfter: 0 });

    // Out of stock ⇒ not orderable, even though listed.
    await expect(placeCodOrder()).rejects.toMatchObject({ statusCode: 409 });
  });
});
