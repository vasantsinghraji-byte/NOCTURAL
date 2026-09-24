/**
 * Pharmacy store network, phase 2 (real MongoDB): batches and FEFO, expiry
 * quarantine, recalls, pharmacist Rx verification, Schedule H1 register,
 * monthly patient caps and risk flags, back-in-stock alerts, split checkout,
 * duplicate merge, CSV stock import and unmet demand.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27999/medrush_test npx jest --config jest.config.js tests/integration/pharmacy-store-network-phase2.test.js --forceExit
 */

const mongoose = require('mongoose');
const PharmacyVendor = require('../../models/pharmacyVendor');
const Medicine = require('../../models/medicine');
const VendorInventory = require('../../models/vendorInventory');
const InventoryBatch = require('../../models/inventoryBatch');
const PharmacyOrder = require('../../models/pharmacyOrder');
const InventoryMovement = require('../../models/inventoryMovement');
const StockAlert = require('../../models/stockAlert');
const Notification = require('../../models/notification');
const PharmacyCheckout = require('../../models/pharmacyCheckout');
const PharmacyDemandSignal = require('../../models/pharmacyDemandSignal');
const PharmacyInventoryImport = require('../../models/pharmacyInventoryImport');
const pharmacyService = require('../../services/pharmacyService');
const batchService = require('../../services/pharmacyBatchService');
const compliance = require('../../services/pharmacyComplianceService');
const stockAlerts = require('../../services/pharmacyStockAlertService');
const checkoutService = require('../../services/pharmacyCheckoutService');
const catalog = require('../../services/pharmacyCatalogService');
const availability = require('../../services/pharmacyAvailabilityService');

const RUN = `p2-${Date.now().toString(36)}`;
const patientId = new mongoose.Types.ObjectId();
const actorUserId = new mongoose.Types.ObjectId();
const DAY = 24 * 60 * 60 * 1000;
const inDays = (n) => new Date(Date.now() + n * DAY);

const BASE = { lat: 22.57, lng: 88.36 }; // Kolkata: away from the phase-1 suite
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

describe('Pharmacy store network phase 2 (real MongoDB)', () => {
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
        console.warn(`Skipping pharmacy phase 2 integration: MongoDB unavailable (${error.message})`);
        return;
      }
    } else {
      databaseAvailable = true;
    }
    for (const Model of [PharmacyVendor, Medicine, VendorInventory, InventoryBatch, PharmacyOrder, InventoryMovement, StockAlert, PharmacyDemandSignal]) {
      await Model.createIndexes();
    }
  });

  afterAll(async () => {
    if (!databaseAvailable) return;
    const ids = (await PharmacyVendor.find({ slug: new RegExp(RUN) }).select('_id')).map((v) => v._id);
    const meds = (await Medicine.find({ slug: new RegExp(RUN) }).select('_id')).map((m) => m._id);
    await Promise.all([
      PharmacyVendor.deleteMany({ _id: { $in: ids } }),
      VendorInventory.deleteMany({ vendor: { $in: ids } }),
      InventoryBatch.deleteMany({ vendor: { $in: ids } }),
      PharmacyOrder.deleteMany({ patient: patientId }),
      InventoryMovement.deleteMany({ vendor: { $in: ids } }),
      StockAlert.deleteMany({ medicine: { $in: meds } }),
      Notification.deleteMany({ user: patientId }),
      PharmacyCheckout.deleteMany({ patient: patientId }),
      PharmacyDemandSignal.deleteMany({ medicine: { $in: meds } }),
      PharmacyInventoryImport.deleteMany({ vendor: { $in: ids } }),
      Medicine.deleteMany({ slug: new RegExp(RUN) })
    ]);
    await mongoose.connection.close();
  });

  const store = (home, km, overrides = {}) => {
    const slug = uid('store');
    return PharmacyVendor.create({
      name: overrides.name || slug, slug, location: { type: 'Point', coordinates: northOf(home, km) },
      serviceRadiusKm: 5, status: 'APPROVED', isActive: true, isOpen: true, avgPreparationMinutes: 10, deliveryFee: 20, ...overrides
    });
  };
  const medicine = (overrides = {}) => {
    const slug = uid('med');
    return Medicine.create({ name: overrides.name || slug, slug, form: 'TABLET', ...overrides });
  };
  const list = (vendor, med, overrides = {}) => VendorInventory.create({
    vendor: vendor._id, medicine: med._id, mrp: 50, sellingPrice: 40, stockQty: 10, stockUpdatedAt: new Date(), ...overrides
  });
  const listing = (vendor, med) => VendorInventory.findOne({ vendor: vendor._id, medicine: med._id }).lean();
  const codOrder = (home, vendor, items, extra = {}) => pharmacyService.createOrder(patientId, {
    vendorId: String(vendor._id),
    items: items.map(([med, quantity]) => ({ medicineId: String(med._id), quantity })),
    deliveryAddress: { line1: '1 Test Road', pincode: '700001' },
    deliveryLocation: { coordinates: [home.lng, home.lat] },
    paymentMode: 'COD',
    ...extra
  });
  const rx = `prescriptions/${patientId}/rx.jpg`;

  // ── Batches ───────────────────────────────────────────────────────────────

  it('sells earliest-expiry batches first and puts units back where they came from', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const med = await medicine();
    const s1 = await store(home, 1);
    await batchService.receiveBatch(s1._id, { medicineId: med._id, batchNumber: 'late', expiryDate: inDays(400), qty: 5, mrp: 50, sellingPrice: 40 });
    await batchService.receiveBatch(s1._id, { medicineId: med._id, batchNumber: 'early', expiryDate: inDays(90), qty: 3 });
    let l = await listing(s1, med);
    expect(l.stockQty).toBe(8);
    expect(l.batchNumber).toBe('EARLY');

    const order = await codOrder(home, s1, [[med, 4]]);
    expect(order.items[0].batches.map((b) => [b.batchNumber, b.quantity])).toEqual([['EARLY', 3], ['LATE', 1]]);
    expect((await InventoryBatch.findOne({ vendor: s1._id, batchNumber: 'EARLY' })).qty).toBe(0);
    l = await listing(s1, med);
    expect(l.stockQty).toBe(4);
    expect(l.batchNumber).toBe('LATE');

    await pharmacyService.cancelOrderByPatient(order._id, patientId, 'test');
    expect((await InventoryBatch.findOne({ vendor: s1._id, batchNumber: 'EARLY' })).qty).toBe(3);
    expect((await listing(s1, med)).stockQty).toBe(8);
  });

  it('refuses stock that expires too soon and manual counts on batch-tracked items', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const med = await medicine();
    const s1 = await store(home, 1);
    await expect(batchService.receiveBatch(s1._id, { medicineId: med._id, batchNumber: 'B1', expiryDate: inDays(10), qty: 5, mrp: 50, sellingPrice: 40 }))
      .rejects.toThrow(/too soon/);
    await batchService.receiveBatch(s1._id, { medicineId: med._id, batchNumber: 'B1', expiryDate: inDays(200), qty: 5, mrp: 50, sellingPrice: 40 });
    await expect(pharmacyService.upsertInventoryItem(s1._id, { medicineId: med._id, mrp: 50, sellingPrice: 40, stockQty: 50 }))
      .rejects.toThrow(/tracked by batch/);
    await expect(batchService.receiveBatch(s1._id, { medicineId: med._id, batchNumber: 'b1', expiryDate: inDays(300), qty: 1 }))
      .rejects.toThrow(/different expiry/);
  });

  it('quarantines batches that fall inside the shelf-life window', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const med = await medicine();
    const s1 = await store(home, 1);
    await batchService.receiveBatch(s1._id, { medicineId: med._id, batchNumber: 'SOON', expiryDate: inDays(45), qty: 4, mrp: 50, sellingPrice: 40 });
    await batchService.receiveBatch(s1._id, { medicineId: med._id, batchNumber: 'FINE', expiryDate: inDays(300), qty: 6 });

    await batchService.quarantineExpiring({ now: inDays(20) }); // 45-day batch now has < 30 days left
    const soon = await InventoryBatch.findOne({ vendor: s1._id, batchNumber: 'SOON' });
    expect(soon.status).toBe('QUARANTINED');
    const l = await listing(s1, med);
    expect(l.stockQty).toBe(6);
    expect(l.batchNumber).toBe('FINE');
    expect(await InventoryMovement.countDocuments({ vendor: s1._id, type: 'EXPIRY_QUARANTINE' })).toBe(1);
  });

  it('recalls a batch everywhere, flags open orders and keeps recalled units off sale', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const med = await medicine();
    const s1 = await store(home, 1);
    const s2 = await store(home, 2);
    await batchService.receiveBatch(s1._id, { medicineId: med._id, batchNumber: 'BAD1', expiryDate: inDays(300), qty: 5, mrp: 50, sellingPrice: 40 });
    await batchService.receiveBatch(s2._id, { medicineId: med._id, batchNumber: 'BAD1', expiryDate: inDays(300), qty: 7, mrp: 50, sellingPrice: 40 });
    const order = await codOrder(home, s1, [[med, 2]]);

    const result = await batchService.recallBatch({ medicineId: med._id, batchNumber: 'bad1', reason: 'Contamination' });
    expect(result.stores).toBe(2);
    expect(result.unitsPulled).toBe(3 + 7);
    expect(result.openOrders.map((o) => String(o.id))).toEqual([String(order._id)]);
    expect((await listing(s1, med)).stockQty).toBe(0);
    expect((await listing(s2, med)).stockQty).toBe(0);
    const flagged = await PharmacyOrder.findById(order._id);
    expect(flagged.timeline.some((t) => /RECALL/.test(t.note || ''))).toBe(true);

    // Cancelling must not put recalled units back on sale.
    await pharmacyService.cancelOrderByPatient(order._id, patientId, 'recall');
    expect((await listing(s1, med)).stockQty).toBe(0);
  });

  // ── Prescriptions and the H1 register ─────────────────────────────────────

  it('blocks packing until the pharmacist verifies the prescription, then records it in the H1 register', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const med = await medicine({ scheduleType: 'SCHEDULE_H1', name: `Cefixime ${RUN}` });
    const s1 = await store(home, 1, { drugLicenseNumber: 'RJ-20B-1234' });
    await batchService.receiveBatch(s1._id, { medicineId: med._id, batchNumber: 'H1B', expiryDate: inDays(300), qty: 5, mrp: 90, sellingPrice: 80 });
    const order = await codOrder(home, s1, [[med, 1]], { prescriptionKey: rx });
    expect(order.items[0].scheduleType).toBe('SCHEDULE_H1');

    await pharmacyService.updateOrderStatus(order._id, { vendorId: s1._id, actorUserId, status: 'ACCEPTED' });
    await expect(pharmacyService.updateOrderStatus(order._id, { vendorId: s1._id, actorUserId, status: 'PREPARING' }))
      .rejects.toThrow(/Verify the prescription/);
    await expect(compliance.verifyPrescription(order._id, { vendorId: s1._id, actorUserId, prescriberName: 'Dr A Sharma', prescriberRegistrationNumber: 'RMC-5521', prescribedOn: inDays(3) }))
      .rejects.toThrow(/future/);
    await expect(compliance.verifyPrescription(order._id, { vendorId: s1._id, actorUserId, prescriberName: 'Dr A Sharma', prescriberRegistrationNumber: 'RMC-5521', prescribedOn: inDays(-400) }))
      .rejects.toThrow(/older than/);

    await compliance.verifyPrescription(order._id, { vendorId: s1._id, actorUserId, prescriberName: 'Dr A Sharma', prescriberRegistrationNumber: 'RMC-5521', prescribedOn: inDays(-2) });
    for (const status of ['PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED']) {
      await pharmacyService.updateOrderStatus(order._id, { vendorId: s1._id, actorUserId, status });
    }

    const register = await compliance.h1Register({ vendorId: s1._id, from: inDays(-1), to: inDays(1) });
    expect(register.rows).toHaveLength(1);
    expect(register.rows[0]).toMatchObject({ drug: `Cefixime ${RUN}`, prescriberName: 'Dr A Sharma', prescriberRegistration: 'RMC-5521', batches: 'H1B×1', quantity: 1, storeLicence: 'RJ-20B-1234' });
    const csv = compliance.h1RegisterCsv(register);
    expect(csv.split('\r\n')[0]).toMatch(/^Supplied on,Order,Store/);
    expect(csv).toContain('RMC-5521');
  });

  // ── Patient limits and risk flags ─────────────────────────────────────────

  it('enforces monthly caps across stores and flags risky patterns', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const syrup = await medicine({ habitForming: true, maxQtyPerMonth: 4, scheduleType: 'PRESCRIPTION' });
    const s1 = await store(home, 1);
    const s2 = await store(home, 2);
    const s3 = await store(home, 3);
    for (const s of [s1, s2, s3]) await list(s, syrup);

    const first = await codOrder(home, s1, [[syrup, 1]], { prescriptionKey: rx });
    expect(first.riskFlags).toEqual([]);
    const second = await codOrder(home, s2, [[syrup, 1]], { prescriptionKey: rx });
    expect(second.riskFlags.map((f) => f.code)).toContain('EARLY_REFILL');
    const third = await codOrder(home, s3, [[syrup, 1]], { prescriptionKey: rx });
    expect(third.riskFlags.map((f) => f.code)).toContain('MANY_STORES');

    await expect(codOrder(home, s1, [[syrup, 2]], { prescriptionKey: rx })).rejects.toThrow(/1 more/);
    const fourth = await codOrder(home, s1, [[syrup, 1]], { prescriptionKey: rx });
    expect(fourth.riskFlags.map((f) => f.code)).toContain('MONTHLY_LIMIT_NEAR'); // 4 of 4
    await expect(codOrder(home, s2, [[syrup, 1]], { prescriptionKey: rx })).rejects.toThrow(/reached the limit/);
    const flagged = await compliance.listFlaggedOrders({ days: 1 });
    expect(flagged.map((o) => String(o._id))).toEqual(expect.arrayContaining([String(second._id), String(third._id)]));
  });

  // ── Back-in-stock alerts ──────────────────────────────────────────────────

  it('tells subscribers nearby when a store restocks, once', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const med = await medicine();
    const s1 = await store(home, 1);
    await list(s1, med, { stockQty: 0 });
    const farPatient = new mongoose.Types.ObjectId();
    await stockAlerts.subscribe(patientId, med._id, home);
    await StockAlert.create({ patient: farPatient, medicine: med._id, point: { type: 'Point', coordinates: northOf(home, 40) }, expiresAt: inDays(10) });

    await pharmacyService.upsertInventoryItem(s1._id, { medicineId: med._id, mrp: 50, sellingPrice: 40, stockQty: 6 });
    await new Promise((r) => setTimeout(r, 300)); // hook is fire-and-forget
    const mine = await StockAlert.findOne({ patient: patientId, medicine: med._id });
    expect(mine.status).toBe('NOTIFIED');
    expect(String(mine.notifiedVendor)).toBe(String(s1._id));
    expect(await Notification.countDocuments({ user: patientId, title: new RegExp('is back') })).toBeGreaterThanOrEqual(1);
    expect((await StockAlert.findOne({ patient: farPatient })).status).toBe('ACTIVE');
    await StockAlert.deleteMany({ patient: farPatient });
  });

  // ── Split checkout ────────────────────────────────────────────────────────

  it('places a split checkout all-or-nothing', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const a = await medicine();
    const b = await medicine();
    const s1 = await store(home, 1);
    const s2 = await store(home, 2);
    await list(s1, a);
    await list(s2, b, { stockQty: 1 });
    const base = { deliveryAddress: { line1: '2 Test Road', pincode: '700001' }, deliveryLocation: { coordinates: [home.lng, home.lat] } };

    const ok = await checkoutService.createSplitCheckout(patientId, {
      ...base,
      groups: [{ vendorId: s1._id, items: [{ medicineId: a._id, quantity: 1 }] }, { vendorId: s2._id, items: [{ medicineId: b._id, quantity: 1 }] }]
    });
    expect(ok.orders).toHaveLength(2);
    expect(ok.checkout.status).toBe('PLACED');
    expect(ok.orders.every((o) => String(o.checkout) === String(ok.checkout._id))).toBe(true);

    // Store 2 is now out of b: the whole checkout fails and store 1's part is undone.
    await expect(checkoutService.createSplitCheckout(patientId, {
      ...base,
      groups: [{ vendorId: s1._id, items: [{ medicineId: a._id, quantity: 2 }] }, { vendorId: s2._id, items: [{ medicineId: b._id, quantity: 1 }] }]
    })).rejects.toThrow();
    expect((await listing(s1, a)).stockQty).toBe(9);
    const failed = await PharmacyCheckout.findOne({ patient: patientId, status: 'FAILED' });
    expect(failed).toBeTruthy();
    await expect(checkoutService.createSplitCheckout(patientId, { ...base, paymentMode: 'PREPAID', groups: [] }))
      .rejects.toThrow(/cash on delivery/);
  });

  // ── Duplicate merge ───────────────────────────────────────────────────────

  it('merges a duplicate product without losing stock, and refuses different drugs', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const composition = [{ ingredient: `Merge ${RUN}`, strength: '10mg' }];
    const real = await medicine({ composition, barcodes: ['8901234500011'] });
    const dup = await medicine({ composition, barcodes: ['8901234500028'] });
    const other = await medicine({ composition: [{ ingredient: `Other ${RUN}`, strength: '10mg' }] });
    const s1 = await store(home, 1);
    const s2 = await store(home, 2);
    await list(s1, real, { stockQty: 4 });
    await list(s1, dup, { stockQty: 3 });
    await list(s2, dup, { stockQty: 5 });
    const openOrder = await codOrder(home, s2, [[dup, 2]]);

    await expect(catalog.mergeMedicines(dup._id, other._id)).rejects.toThrow(/different compositions/);
    const result = await catalog.mergeMedicines(dup._id, real._id);
    expect(result.unitsMoved).toBe(3 + 3);
    expect((await listing(s1, real)).stockQty).toBe(7);
    expect((await listing(s2, real)).stockQty).toBe(3);
    expect(await listing(s1, dup)).toBeNull();
    const merged = await Medicine.findById(dup._id);
    expect(merged.isActive).toBe(false);
    expect(String(merged.mergedInto)).toBe(String(real._id));
    expect((await Medicine.findById(real._id)).barcodes).toEqual(expect.arrayContaining(['8901234500028']));

    // An order placed before the merge restocks onto the surviving listing.
    await pharmacyService.cancelOrderByPatient(openOrder._id, patientId, 'test');
    expect((await listing(s2, real)).stockQty).toBe(5);
  });

  // ── CSV import ────────────────────────────────────────────────────────────

  it('imports a billing-software CSV: exact matches apply, the rest waits for review', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const s1 = await store(home, 1);
    const byName = await medicine({ name: `Zincovit Tablet ${RUN}`, packSize: '15 tablets' });
    const byCode = await medicine({ name: `Shelcal 500 ${RUN}`, barcodes: [`890${seq}${Date.now() % 100000}`] });
    const batched = await medicine({ name: `Augmentin 625 ${RUN}` });
    await medicine({ name: `Vitamin C ${RUN} Chewable` });
    await medicine({ name: `Vitamin C ${RUN} Effervescent` });
    const code = byCode.barcodes[0];

    const csv = [
      'Item Name,Barcode,MRP,Sale Rate,Closing Stock,Batch No,Exp Date',
      `Zincovit Tablet ${RUN},,110,99,12,,`,
      `"Shelcal, 500mg",${code},120,110,8,,`,
      `Augmentin 625 ${RUN},,220,200,6,AUG77,09/28`,
      `Vitamin C ${RUN},,50,45,5,,`,
      `Broken row ${RUN},,abc,10,5,,`,
      `=HYPERLINK("x") ${RUN},,10,20,5,,`
    ].join('\r\n');
    const result = await catalog.importInventoryCsv(s1._id, csv, { actorId: actorUserId });
    const status = (line) => result.rows.find((r) => r.line === line).status;
    expect(status(2)).toBe('APPLIED');
    expect(status(3)).toBe('APPLIED');
    expect(result.rows.find((r) => r.line === 3).matchedBy).toBe('BARCODE');
    expect(status(4)).toBe('APPLIED');
    expect(status(5)).toBe('NEEDS_REVIEW');
    expect(status(6)).toBe('ERROR');
    expect(status(7)).toBe('ERROR'); // price above MRP
    expect((await listing(s1, byName)).stockQty).toBe(12);
    expect((await listing(s1, byCode)).stockQty).toBe(8);
    const aug = await InventoryBatch.findOne({ vendor: s1._id, medicine: batched._id });
    expect(aug.batchNumber).toBe('AUG77');
    expect(aug.expiryDate.toISOString().slice(0, 10)).toBe('2028-09-30'); // MM/YY = end of month

    const review = result.rows.find((r) => r.line === 5);
    expect(review.candidates.length).toBeGreaterThanOrEqual(2);
    const pick = review.candidates[0].medicine;
    const after = await catalog.resolveImportRow(s1._id, result._id, 5, { medicineId: pick });
    expect(after.rows.find((r) => r.line === 5).status).toBe('APPLIED');
    expect(after.counts.needsReview).toBe(0);
    expect((await listing(s1, { _id: pick })).stockQty).toBe(5);
  });

  // ── Demand ────────────────────────────────────────────────────────────────

  it('shows a store what customers near it could not find', async () => {
    if (!databaseAvailable) return;
    const home = newArea();
    const med = await medicine({ name: `Rare med ${RUN}` });
    const s1 = await store(home, 1);
    await availability.getMedicineAvailability({ medicineId: med._id, ...home });
    await availability.getMedicineAvailability({ medicineId: med._id, ...home });
    await new Promise((r) => setTimeout(r, 200));
    const items = await catalog.vendorDemand(s1._id, { days: 1 });
    const row = items.find((i) => String(i.medicineId) === String(med._id));
    expect(row).toBeTruthy();
    expect(row.unmet).toBeGreaterThanOrEqual(2);
    expect(row.youList).toBe(false);
  });
});
