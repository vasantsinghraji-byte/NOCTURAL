/**
 * Pharmacy store network: availability, cart planning, acceptance SLA,
 * reassignment, item-level unavailability and race safety, against a real
 * MongoDB ($geoNear, atomic $inc and compare-and-set can't be proven with mocks).
 *
 * Skips when MONGODB_URI is unreachable. Locally:
 *   MONGODB_URI=mongodb://127.0.0.1:27999/medrush_test npx jest --config jest.config.js tests/integration/pharmacy-store-network.test.js --forceExit
 */

const mongoose = require('mongoose');
const PharmacyVendor = require('../../models/pharmacyVendor');
const Medicine = require('../../models/medicine');
const VendorInventory = require('../../models/vendorInventory');
const PharmacyOrder = require('../../models/pharmacyOrder');
const InventoryMovement = require('../../models/inventoryMovement');
const PharmacyDemandSignal = require('../../models/pharmacyDemandSignal');
const ServiceZone = require('../../models/serviceZone');
const pharmacyService = require('../../services/pharmacyService');
const availability = require('../../services/pharmacyAvailabilityService');
const assignment = require('../../services/pharmacyAssignmentService');

const RUN = `net-${Date.now().toString(36)}`;
const patientId = new mongoose.Types.ObjectId();
const actorUserId = new mongoose.Types.ObjectId();
const DAY = 24 * 60 * 60 * 1000;

// Every test gets its own neighbourhood (~65 km apart) so fixtures never mix.
const BASE = { lat: 18.52, lng: 73.85 }; // Pune
let areaSeq = 0;
const newArea = () => {
  areaSeq += 1;
  return { lat: BASE.lat + areaSeq * 0.6, lng: BASE.lng };
};
const northOf = (home, km) => [home.lng, home.lat + km / 111.2];

let seq = 0;
const uid = (label) => {
  seq += 1;
  return `${label}-${RUN}-${seq}`;
};

describe('Pharmacy store network (real MongoDB)', () => {
  let databaseAvailable = false;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      try {
        await mongoose.connect(process.env.MONGODB_URI, {
          serverSelectionTimeoutMS: Number(process.env.TEST_MONGO_SERVER_SELECTION_TIMEOUT_MS) || 3000,
          autoIndex: false
        });
        databaseAvailable = true;
      } catch (error) {
        console.warn(`Skipping pharmacy store network integration: MongoDB unavailable (${error.message})`);
        return;
      }
    } else {
      databaseAvailable = true;
    }
    for (const Model of [PharmacyVendor, ServiceZone, Medicine, VendorInventory, PharmacyOrder, InventoryMovement, PharmacyDemandSignal]) {
      await Model.createIndexes();
    }
  });

  afterAll(async () => {
    if (!databaseAvailable) return;
    const vendors = await PharmacyVendor.find({ slug: new RegExp(RUN) }).select('_id');
    const ids = vendors.map((v) => v._id);
    const meds = await Medicine.find({ slug: new RegExp(RUN) }).select('_id');
    await Promise.all([
      PharmacyVendor.deleteMany({ _id: { $in: ids } }),
      VendorInventory.deleteMany({ vendor: { $in: ids } }),
      PharmacyOrder.deleteMany({ patient: patientId }),
      InventoryMovement.deleteMany({ vendor: { $in: ids } }),
      PharmacyDemandSignal.deleteMany({ medicine: { $in: meds.map((m) => m._id) } }),
      Medicine.deleteMany({ slug: new RegExp(RUN) })
    ]);
    await mongoose.connection.close();
  });

  const store = (home, km, overrides = {}) => {
    const slug = uid('store');
    return PharmacyVendor.create({
      name: overrides.name || slug,
      slug,
      location: { type: 'Point', coordinates: northOf(home, km) },
      serviceRadiusKm: 5,
      status: 'APPROVED',
      isActive: true,
      isOpen: true,
      avgPreparationMinutes: 10,
      deliveryFee: 20,
      ...overrides
    });
  };
  const medicine = (overrides = {}) => {
    const slug = uid('med');
    return Medicine.create({ name: overrides.name || slug, slug, form: 'TABLET', ...overrides });
  };
  const list = (vendor, med, overrides = {}) => VendorInventory.create({
    vendor: vendor._id, medicine: med._id, mrp: 50, sellingPrice: 40, stockQty: 10, stockUpdatedAt: new Date(), ...overrides
  });
  const stockOf = async (vendor, med) => (await VendorInventory.findOne({ vendor: vendor._id, medicine: med._id }).lean()).stockQty;
  const codOrder = (home, vendor, items, extra = {}) => pharmacyService.createOrder(patientId, {
    vendorId: String(vendor._id),
    items: items.map(([med, quantity]) => ({ medicineId: String(med._id), quantity })),
    deliveryAddress: { line1: '1 Test Road', pincode: '411001' },
    deliveryLocation: { coordinates: [home.lng, home.lat] },
    paymentMode: 'COD',
    ...extra
  });
  const later = (minutes = 10) => new Date(Date.now() + minutes * 60 * 1000);

  // ── Availability ──────────────────────────────────────────────────────────

  it('lists only stores that can really sell now, with honest confidence', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const med = await medicine();
    const fresh = await store(home, 1);
    const stale = await store(home, 2);
    const paused = await store(home, 1.5, { pausedUntil: later(30) });
    const lapsed = await store(home, 1.2, { drugLicenseExpiry: new Date(Date.now() - DAY) });
    const nearExpiry = await store(home, 1.1);
    const closedToday = await store(home, 0.8, {
      operatingHours: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((day) => ({ day, isClosed: true }))
    });
    await list(fresh, med, { sellingPrice: 30 });
    await list(stale, med, { sellingPrice: 25, stockUpdatedAt: new Date(Date.now() - 5 * DAY) });
    await list(paused, med);
    await list(lapsed, med);
    await list(nearExpiry, med, { expiryDate: new Date(Date.now() + 5 * DAY) });
    await list(closedToday, med);

    const result = await availability.getMedicineAvailability({ medicineId: med._id, ...home });
    const ids = result.stores.map((s) => String(s.store.id));
    expect(ids.sort()).toEqual([String(fresh._id), String(stale._id)].sort());
    expect(result.stores.find((s) => String(s.store.id) === String(stale._id)).confidence).toBe('LIKELY');
    expect(result.stores.find((s) => String(s.store.id) === String(fresh._id)).confidence).toBe('CONFIRMED');
    expect(result.fromPrice).toBe(25);
  });

  it('sends cold-chain products only to stores with a fridge', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const insulin = await medicine({ coldChain: true, scheduleType: 'PRESCRIPTION' });
    const noFridge = await store(home, 1);
    const fridge = await store(home, 2, { hasColdStorage: true });
    await list(noFridge, insulin);
    await list(fridge, insulin);

    const result = await availability.getMedicineAvailability({ medicineId: insulin._id, ...home });
    expect(result.stores.map((s) => String(s.store.id))).toEqual([String(fridge._id)]);
    await expect(codOrder(home, noFridge, [[insulin, 1]], { prescriptionKey: `prescriptions/${patientId}/rx.jpg` }))
      .rejects.toThrow(/refrigeration/);
  });

  it('offers same-salt substitutes and records unmet demand when nobody has it', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const composition = [{ ingredient: `Salt ${RUN}`, strength: '650 mg' }];
    const wanted = await medicine({ name: `Brand A ${RUN}`, composition });
    const alt = await medicine({ name: `Brand B ${RUN}`, composition, packUnits: 15 });
    const s1 = await store(home, 1);
    await list(s1, alt, { sellingPrice: 30 });

    const result = await availability.getMedicineAvailability({ medicineId: wanted._id, ...home });
    expect(result.storeCount).toBe(0);
    expect(wanted.saltKey).toBe(alt.saltKey);
    expect(result.substitutes.map((s) => String(s.medicine.id))).toEqual([String(alt._id)]);
    expect(result.substitutes[0].unitPrice).toBe(2);

    await new Promise((r) => setTimeout(r, 50)); // demand write is fire-and-forget
    const signal = await PharmacyDemandSignal.findOne({ medicine: wanted._id });
    expect(signal && signal.unmet).toBeGreaterThanOrEqual(1);
  });

  it('never sells Schedule X or banned products online', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const narcotic = await medicine({ scheduleType: 'SCHEDULE_X' });
    const s1 = await store(home, 1);
    await VendorInventory.create({ vendor: s1._id, medicine: narcotic._id, mrp: 50, sellingPrice: 40, stockQty: 10 });

    const result = await availability.getMedicineAvailability({ medicineId: narcotic._id, ...home });
    expect(result.blocked).toBe('SCHEDULE_X');
    await expect(codOrder(home, s1, [[narcotic, 1]])).rejects.toThrow(/Schedule X/);
    await expect(pharmacyService.upsertInventoryItem(s1._id, { medicineId: narcotic._id, mrp: 50, sellingPrice: 40 }))
      .rejects.toThrow(/can't be sold online/);
  });

  // ── Cart planning ─────────────────────────────────────────────────────────

  it('prefers one store with everything, else splits across two', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const a = await medicine();
    const b = await medicine();
    const onlyA = await store(home, 1);
    const onlyB = await store(home, 1.5);
    await list(onlyA, a);
    await list(onlyB, b);

    let plan = await availability.planCart({ ...home, items: [{ medicineId: a._id, quantity: 1 }, { medicineId: b._id, quantity: 1 }] });
    expect(plan.best).toBeNull();
    expect(plan.split).toHaveLength(2);
    expect(plan.split.map((p) => String(p.store.id)).sort()).toEqual([String(onlyA._id), String(onlyB._id)].sort());

    const both = await store(home, 3);
    await list(both, a);
    await list(both, b);
    plan = await availability.planCart({ ...home, items: [{ medicineId: a._id, quantity: 1 }, { medicineId: b._id, quantity: 1 }] });
    expect(String(plan.best.store.id)).toBe(String(both._id));
    expect(plan.split).toBeNull();
    expect(availability.stripInternal(plan)._fullOptions).toBeUndefined();
  });

  it('enforces per-order caps and merges duplicate cart lines', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const syrup = await medicine({ maxQtyPerOrder: 2 });
    const s1 = await store(home, 1);
    await list(s1, syrup);

    const plan = await availability.planCart({ ...home, items: [{ medicineId: syrup._id, quantity: 3 }] });
    expect(plan.blocked[0].reason).toBe('QUANTITY_LIMIT');
    await expect(codOrder(home, s1, [[syrup, 3]])).rejects.toThrow(/at most 2/);

    const order = await codOrder(home, s1, [[syrup, 1], [syrup, 1]]);
    expect(order.items).toHaveLength(1);
    expect(order.items[0].quantity).toBe(2);
    expect(await stockOf(s1, syrup)).toBe(8);
  });

  // ── Checkout ──────────────────────────────────────────────────────────────

  it('starts the acceptance clock on COD orders and refuses silent price changes', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const med = await medicine();
    const s1 = await store(home, 1);
    await list(s1, med, { sellingPrice: 40 });

    await expect(codOrder(home, s1, [[med, 1]], { quotedSubtotal: 10 })).rejects.toThrow(/Prices changed/);
    expect(await stockOf(s1, med)).toBe(10); // reservation rolled back

    const order = await codOrder(home, s1, [[med, 1]], { quotedSubtotal: 40 });
    expect(order.acceptBy.getTime()).toBeGreaterThan(Date.now());
    expect(order.assignmentAttempts).toHaveLength(1);
    expect(order.assignmentAttempts[0].outcome).toBe('PENDING');
    expect(order.amounts.originalTotal).toBe(order.amounts.total);
  });

  // ── Acceptance SLA & reassignment ─────────────────────────────────────────

  it('moves an order to the next store when the first one stays silent, then cancels when none are left', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const med = await medicine();
    const first = await store(home, 1);
    const second = await store(home, 2);
    await list(first, med);
    await list(second, med);

    const order = await codOrder(home, first, [[med, 2]]);
    expect(await stockOf(first, med)).toBe(8);

    await assignment.sweepAcceptanceTimeouts({ now: later(5) });
    let moved = await PharmacyOrder.findById(order._id);
    expect(String(moved.vendor)).toBe(String(second._id));
    expect(moved.status).toBe('PLACED');
    expect(moved.assignmentAttempts.map((a) => a.outcome)).toEqual(['TIMED_OUT', 'PENDING']);
    expect(await stockOf(first, med)).toBe(10); // released exactly once
    expect(await stockOf(second, med)).toBe(8); // reserved at the new store
    expect((await PharmacyVendor.findById(first._id)).reliability.timedOut).toBe(1);

    await assignment.sweepAcceptanceTimeouts({ now: later(20) });
    moved = await PharmacyOrder.findById(order._id);
    expect(moved.status).toBe('CANCELLED');
    expect(moved.cancelledBy).toBe('SYSTEM');
    expect(await stockOf(second, med)).toBe(10);
  });

  it('never moves an order to a store that would charge more', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const med = await medicine();
    const cheap = await store(home, 1);
    const dear = await store(home, 2);
    await list(cheap, med, { sellingPrice: 30 });
    await list(dear, med, { sellingPrice: 45 });

    const order = await codOrder(home, cheap, [[med, 1]]);
    await assignment.sweepAcceptanceTimeouts({ now: later(5) });
    const after = await PharmacyOrder.findById(order._id);
    expect(after.status).toBe('CANCELLED');
    expect(await stockOf(dear, med)).toBe(10);
  });

  it('auto-pauses a store after repeated silence', async () => {
    if (!databaseAvailable) return;
    const previous = process.env.PHARMACY_AUTO_PAUSE_AFTER_MISSES;
    process.env.PHARMACY_AUTO_PAUSE_AFTER_MISSES = '1';
    try {
      const home = newArea();
      const med = await medicine();
      const sleepy = await store(home, 1);
      await list(sleepy, med);
      await codOrder(home, sleepy, [[med, 1]]);
      await assignment.sweepAcceptanceTimeouts({ now: later(5) });
      const after = await PharmacyVendor.findById(sleepy._id);
      expect(after.pausedUntil.getTime()).toBeGreaterThan(Date.now());
      expect(after.pauseReason).toMatch(/Missed/);
    } finally {
      if (previous === undefined) delete process.env.PHARMACY_AUTO_PAUSE_AFTER_MISSES;
      else process.env.PHARMACY_AUTO_PAUSE_AFTER_MISSES = previous;
    }
  });

  it('accepting closes the store turn and stops the clock', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const med = await medicine();
    const s1 = await store(home, 1);
    await list(s1, med);
    const order = await codOrder(home, s1, [[med, 1]]);

    const accepted = await pharmacyService.updateOrderStatus(order._id, { vendorId: s1._id, actorUserId, status: 'ACCEPTED' });
    expect(accepted.status).toBe('ACCEPTED');
    expect(accepted.acceptBy).toBeUndefined();
    expect(accepted.assignmentAttempts[0].outcome).toBe('ACCEPTED');
    expect((await PharmacyVendor.findById(s1._id)).reliability.accepted).toBe(1);

    const swept = await assignment.sweepAcceptanceTimeouts({ now: later(10) });
    expect(swept.moved + swept.cancelled).toBe(0);
  });

  // ── Store declines ────────────────────────────────────────────────────────

  it('out-of-stock decline zeroes the wrong count and moves the order', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const med = await medicine();
    const wrongCount = await store(home, 1);
    const backup = await store(home, 2);
    await list(wrongCount, med);
    await list(backup, med);
    const order = await codOrder(home, wrongCount, [[med, 2]]);

    await pharmacyService.updateOrderStatus(order._id, {
      vendorId: wrongCount._id, actorUserId, status: 'REJECTED', reasonCode: 'OUT_OF_STOCK', unavailableMedicineIds: [String(med._id)]
    });
    const after = await PharmacyOrder.findById(order._id);
    expect(String(after.vendor)).toBe(String(backup._id));
    expect(after.assignmentAttempts[0]).toMatchObject({ outcome: 'REJECTED', reasonCode: 'OUT_OF_STOCK' });
    expect(await stockOf(wrongCount, med)).toBe(0);
    expect(await InventoryMovement.countDocuments({ vendor: wrongCount._id, type: 'MARKED_UNAVAILABLE' })).toBe(1);
  });

  it('prescription rejections cancel instead of shopping the order around', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const rx = await medicine({ scheduleType: 'PRESCRIPTION' });
    const s1 = await store(home, 1);
    const s2 = await store(home, 2);
    await list(s1, rx);
    await list(s2, rx);
    const order = await codOrder(home, s1, [[rx, 1]], { prescriptionKey: `prescriptions/${patientId}/rx.jpg` });

    await pharmacyService.updateOrderStatus(order._id, {
      vendorId: s1._id, actorUserId, status: 'REJECTED', reasonCode: 'PRESCRIPTION_INVALID', note: 'Prescription expired'
    });
    const after = await PharmacyOrder.findById(order._id);
    expect(after.status).toBe('REJECTED');
    expect(String(after.vendor)).toBe(String(s1._id));
    expect(after.rejectionReasonCode).toBe('PRESCRIPTION_INVALID');
    expect(await stockOf(s1, rx)).toBe(10);
    expect(await stockOf(s2, rx)).toBe(10);
  });

  it('drops only the missing items, lowers the bill and zeroes that count', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const a = await medicine();
    const b = await medicine();
    const s1 = await store(home, 1);
    await list(s1, a, { sellingPrice: 40 });
    await list(s1, b, { sellingPrice: 15 });
    const order = await codOrder(home, s1, [[a, 2], [b, 1]]);
    const before = order.amounts.total;

    const updated = await assignment.markItemsUnavailable(order._id, {
      vendorId: s1._id, actorUserId, medicineIds: [String(b._id)], reason: 'Last strip was damaged'
    });
    expect(updated.status).toBe('PLACED');
    expect(updated.items.find((i) => String(i.medicine) === String(b._id)).status).toBe('UNAVAILABLE');
    expect(updated.amounts.total).toBe(Math.round((before - 15) * 100) / 100);
    expect(await stockOf(s1, b)).toBe(0);
    expect(await stockOf(s1, a)).toBe(8);

    // Cancelling later returns only what was really taken.
    await pharmacyService.cancelOrderByPatient(order._id, patientId, 'Changed my mind');
    expect(await stockOf(s1, a)).toBe(10);
    expect(await stockOf(s1, b)).toBe(0);
  });

  // ── Races ─────────────────────────────────────────────────────────────────

  it('customer cancel racing a store decline moves stock exactly once', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const med = await medicine();
    const s1 = await store(home, 1);
    await list(s1, med);
    const order = await codOrder(home, s1, [[med, 3]]);

    const results = await Promise.allSettled([
      pharmacyService.cancelOrderByPatient(order._id, patientId, 'Cancel'),
      pharmacyService.updateOrderStatus(order._id, { vendorId: s1._id, actorUserId, status: 'REJECTED', reasonCode: 'OTHER' })
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await stockOf(s1, med)).toBe(10);
    const ledger = await InventoryMovement.find({ order: order._id, type: 'ORDER_RELEASED' });
    expect(ledger).toHaveLength(1);
  });

  it('a store accepting while the sweeper moves the order ends in exactly one owner', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const med = await medicine();
    const s1 = await store(home, 1);
    const s2 = await store(home, 2);
    await list(s1, med);
    await list(s2, med);
    const order = await codOrder(home, s1, [[med, 1]]);

    await Promise.allSettled([
      assignment.sweepAcceptanceTimeouts({ now: later(5) }),
      pharmacyService.updateOrderStatus(order._id, { vendorId: s1._id, actorUserId, status: 'ACCEPTED' })
    ]);
    const after = await PharmacyOrder.findById(order._id);
    const s1Stock = await stockOf(s1, med);
    const s2Stock = await stockOf(s2, med);
    // Units reserved = 1 in total, wherever the order ended up.
    expect(s1Stock + s2Stock).toBe(19);
    if (String(after.vendor) === String(s1._id)) {
      expect(after.status).toBe('ACCEPTED');
      expect(s1Stock).toBe(9);
    } else {
      expect(after.status).toBe('PLACED');
      expect(s2Stock).toBe(9);
    }
  });
});
