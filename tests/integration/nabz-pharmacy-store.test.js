/**
 * Pharmacy store management (real MongoDB): the day at a glance, stock search
 * and filters, shop settings with validation, and the sales statement.
 */
const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../models/user');
const Patient = require('../../models/patient');
const Medicine = require('../../models/medicine');
const PharmacyVendor = require('../../models/pharmacyVendor');
const VendorInventory = require('../../models/vendorInventory');
const InventoryBatch = require('../../models/inventoryBatch');
const PharmacyOrder = require('../../models/pharmacyOrder');
const SettlementEntry = require('../../models/settlementEntry');
const InventoryMovement = require('../../models/inventoryMovement');
const Notification = require('../../models/notification');

const RUN = Date.now();
const PASSWORD = 'Strong@12345';
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };
const STORE = { lat: 26.9124, lng: 75.7873 };
const DAY = 24 * 3600 * 1000;

describe('Pharmacy store management (real MongoDB)', () => {
  let app;
  let db = false;
  let vendor;
  let vendorUser;
  let patient;
  const med = {};
  const tokens = {};

  const login = async (path, email, extra = {}) => (await request(app).post(`/api/v1${path}`).set(MOBILE).send({ email, password: PASSWORD, ...extra })).body.tokens?.accessToken;
  const auth = (t) => ({ ...MOBILE, Authorization: `Bearer ${t}` });
  const get = (path) => request(app).get(`/api/v1/pharmacy/vendor${path}`).set(auth(tokens.vendor));

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping store management tests: MongoDB unavailable (${error.message})`);
      return;
    }
    for (const M of [PharmacyVendor, VendorInventory, InventoryBatch, PharmacyOrder, SettlementEntry, Patient, User, Medicine]) await M.createIndexes();
    app = require('../../app');
    vendor = await PharmacyVendor.create({
      name: `Store Mgmt ${RUN}`, slug: `store-mgmt-${RUN}`, location: { type: 'Point', coordinates: [STORE.lng, STORE.lat] },
      serviceRadiusKm: 6, status: 'APPROVED', isActive: true, isOpen: true, deliveryFee: 25
    });
    vendorUser = await User.create({ name: 'Owner', email: `storemgmt.${RUN}@nabz.test`, password: PASSWORD, phone: '9876571101', role: 'pharmacy_vendor', pharmacyVendor: vendor._id, isVerified: true });
    vendor.owner = vendorUser._id;
    await vendor.save();
    med.plenty = await Medicine.create({ name: `Azithral 500 ${RUN}`, slug: `azithral-${RUN}`, genericName: 'Azithromycin', strength: '500mg', form: 'TABLET', manufacturer: 'Alembic' });
    med.low = await Medicine.create({ name: `Benadryl ${RUN}`, slug: `benadryl-${RUN}`, genericName: 'Diphenhydramine', strength: '100ml', form: 'SYRUP' });
    med.out = await Medicine.create({ name: `Calpol 650 ${RUN}`, slug: `calpol-${RUN}`, genericName: 'Paracetamol', strength: '650mg', form: 'TABLET' });
    med.hidden = await Medicine.create({ name: `Dolo 650 ${RUN}`, slug: `dolo-${RUN}`, genericName: 'Paracetamol', strength: '650mg', form: 'TABLET' });
    med.batched = await Medicine.create({ name: `Ecosprin 75 ${RUN}`, slug: `ecosprin-${RUN}`, genericName: 'Aspirin', strength: '75mg', form: 'TABLET' });
    await VendorInventory.create([
      { vendor: vendor._id, medicine: med.plenty._id, mrp: 120, sellingPrice: 110, stockQty: 50 },
      { vendor: vendor._id, medicine: med.low._id, mrp: 90, sellingPrice: 85, stockQty: 3, lowStockThreshold: 5 },
      { vendor: vendor._id, medicine: med.out._id, mrp: 35, sellingPrice: 32, stockQty: 0 },
      { vendor: vendor._id, medicine: med.hidden._id, mrp: 33, sellingPrice: 30, stockQty: 10, isAvailable: false },
      { vendor: vendor._id, medicine: med.batched._id, mrp: 50, sellingPrice: 45, stockQty: 30 }
    ]);
    await InventoryBatch.create([
      { vendor: vendor._id, medicine: med.batched._id, batchNumber: `SOON${RUN}`, expiryDate: new Date(Date.now() + 40 * DAY), qty: 10 },
      { vendor: vendor._id, medicine: med.batched._id, batchNumber: `LATE${RUN}`, expiryDate: new Date(Date.now() + 400 * DAY), qty: 20 }
    ]);
    patient = await Patient.create({ name: 'Ramesh', email: `storep.${RUN}@nabz.test`, password: PASSWORD, phone: `93${String(RUN).slice(-8)}` });
    tokens.patient = await login('/patients/login', patient.email);
    tokens.vendor = await login('/auth/login', vendorUser.email, { portal: 'pharmacy' });
  }, 90000);

  afterAll(async () => {
    if (!db) return;
    await Promise.all([
      PharmacyOrder.deleteMany({ vendor: vendor._id }),
      VendorInventory.deleteMany({ vendor: vendor._id }),
      InventoryBatch.deleteMany({ vendor: vendor._id }),
      InventoryMovement.deleteMany({ vendor: vendor._id }),
      SettlementEntry.deleteMany({ 'party.id': vendor._id }),
      Medicine.deleteMany({ _id: { $in: Object.values(med).map((m) => m._id) } }),
      Notification.deleteMany({ user: { $in: [patient._id, vendorUser._id] } }),
      PharmacyVendor.deleteOne({ _id: vendor._id }),
      Patient.deleteOne({ _id: patient._id }),
      User.deleteOne({ _id: vendorUser._id })
    ]);
    await mongoose.disconnect();
  });

  it('stock list: sorted by name, searchable, and filtered by low / out / hidden / expiring', async () => {
    if (!db) return;
    const all = await get('/inventory');
    expect(all.status).toBe(200);
    expect(all.body.items.map((i) => i.medicine.name)).toEqual([med.plenty, med.low, med.out, med.hidden, med.batched].map((m) => m.name));
    const names = async (qs) => (await get(`/inventory?${qs}`)).body.items.map((i) => i.medicine.name);
    expect(await names('filter=low')).toEqual([med.low.name]);
    expect(await names('filter=out')).toEqual([med.out.name]);
    expect(await names('filter=hidden')).toEqual([med.hidden.name]);
    expect(await names('filter=expiring')).toEqual([med.batched.name]);
    expect(await names('q=paracetamol')).toEqual([med.out.name, med.hidden.name]); // by salt
    expect(await names('q=alembic')).toEqual([med.plenty.name]); // by maker
    expect(await names('q=.*')).toEqual([]); // treated as text, not a pattern
    const batched = all.body.items.find((i) => i.medicine.name === med.batched.name);
    expect(batched.batchSummary).toMatchObject({ count: 2, expiringQty: 10 });
    expect((await get('/inventory?filter=everything')).status).toBe(400);
  });

  it('shop settings: read, validated update, and the open switch', async () => {
    if (!db) return;
    const before = await get('/profile');
    expect(before.status).toBe(200);
    expect(before.body.vendor).toMatchObject({ name: vendor.name, isOpen: true, deliveryFee: 25 });
    const patch = (body) => request(app).patch('/api/v1/pharmacy/vendor/profile').set(auth(tokens.vendor)).send(body);
    expect((await patch({ operatingHours: [{ day: 'MON', open: '9am', close: '21:00' }] })).status).toBe(400);
    expect((await patch({ contactPhone: '12345' })).status).toBe(400);
    expect((await patch({ deliveryFee: 5000 })).status).toBe(400);
    const hours = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((day) => ({ day, open: '00:00', close: '23:59', isClosed: false }));
    const ok = await patch({ deliveryFee: 30, minOrderValue: 199, avgPreparationMinutes: 20, contactPhone: '9876500011', operatingHours: hours, status: 'APPROVED', rating: { average: 5 } });
    expect(ok.status).toBe(200);
    expect(ok.body.vendor).toMatchObject({ deliveryFee: 30, minOrderValue: 199, avgPreparationMinutes: 20, contactPhone: '9876500011', openNow: true });
    expect(ok.body.vendor.rating.average).toBe(0); // not something the owner can set
    const closed = await patch({ isOpen: false });
    expect(closed.body.vendor).toMatchObject({ isOpen: false, openNow: false });
    await patch({ isOpen: true, minOrderValue: 0 });
  });

  it('today: new and active orders, sales delivered today, and stock alerts', async () => {
    if (!db) return;
    const placed = await request(app).post('/api/v1/pharmacy/orders').set(auth(tokens.patient)).send({
      vendorId: String(vendor._id), items: [{ medicineId: String(med.plenty._id), quantity: 2 }], paymentMode: 'COD',
      deliveryAddress: { line1: 'MI Road', city: 'Jaipur', pincode: '302001' }, deliveryLocation: { coordinates: [STORE.lng, STORE.lat + 0.01] }
    });
    expect(placed.status).toBe(201);
    const delivered = await request(app).post('/api/v1/pharmacy/orders').set(auth(tokens.patient)).send({
      vendorId: String(vendor._id), items: [{ medicineId: String(med.plenty._id), quantity: 1 }], paymentMode: 'COD',
      deliveryAddress: { line1: 'MI Road', city: 'Jaipur', pincode: '302001' }, deliveryLocation: { coordinates: [STORE.lng, STORE.lat + 0.01] }
    });
    await PharmacyOrder.updateOne({ _id: delivered.body.order._id }, { $set: { status: 'DELIVERED', deliveredAt: new Date() } });

    const res = await get('/today');
    expect(res.status).toBe(200);
    const t = res.body.today;
    expect(t.orders).toMatchObject({ new: 1, deliveredToday: 1 });
    expect(t.sales.today).toBe(110);
    expect(t.stock).toMatchObject({ listed: 5, low: 1, out: 1, hidden: 1, expiringBatches: 1 });
    expect(t.shop).toMatchObject({ name: vendor.name, isOpen: true });
  });

  it('earnings: per-order sales, commission and payout, cash held, and a day-by-day series', async () => {
    if (!db) return;
    const source = (ref) => ({ kind: 'PHARMACY_ORDER', id: new mongoose.Types.ObjectId(), ref });
    const a = source(`ORD-A-${RUN}`);
    const b = source(`ORD-B-${RUN}`);
    const old = source(`ORD-OLD-${RUN}`);
    const party = { kind: 'VENDOR', id: vendor._id };
    await SettlementEntry.create([
      { source: a, party, type: 'VENDOR_PAYOUT', amount: 900, basis: 1000, rate: 0.1, occurredAt: new Date() },
      { source: a, party, type: 'CASH_COLLECTED', amount: 1025, occurredAt: new Date() },
      { source: b, party, type: 'VENDOR_PAYOUT', amount: 450, basis: 500, rate: 0.1, occurredAt: new Date(Date.now() - 2 * DAY), status: 'PAID' },
      { source: old, party, type: 'VENDOR_PAYOUT', amount: 90, basis: 100, rate: 0.1, occurredAt: new Date(Date.now() - 60 * DAY) }
    ]);
    const res = await get('/earnings?days=7');
    expect(res.status).toBe(200);
    const e = res.body.earnings;
    expect(e.totals).toMatchObject({ orders: 2, sales: 1500, commission: 150, payout: 1350, cashCollected: 1025, paidOut: 450 });
    expect(e.daily).toHaveLength(7);
    expect(e.daily.reduce((s, d) => s + d.sales, 0)).toBe(1500);
    expect(e.orders[0]).toMatchObject({ ref: a.ref, sales: 1000, commission: 100, payout: 900, cash: 1025 });
    expect((await get('/earnings?days=500')).status).toBe(400);
  });

  it('only store accounts can use these', async () => {
    if (!db) return;
    for (const path of ['/today', '/profile', '/earnings', '/inventory']) {
      const res = await request(app).get(`/api/v1/pharmacy/vendor${path}`).set(auth(tokens.patient));
      expect([401, 403]).toContain(res.status);
    }
  });
});
