/**
 * Nabz riders (real MongoDB): ready orders go to the nearest free rider,
 * nearby drops from the same store are batched, cold-chain orders travel
 * alone, the customer's code is needed at the door, and the rider is paid
 * per drop and per km (cash on delivery is booked against the rider).
 */
const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../models/user');
const Patient = require('../../models/patient');
const Medicine = require('../../models/medicine');
const PharmacyVendor = require('../../models/pharmacyVendor');
const VendorInventory = require('../../models/vendorInventory');
const PharmacyOrder = require('../../models/pharmacyOrder');
const SettlementEntry = require('../../models/settlementEntry');
const InventoryMovement = require('../../models/inventoryMovement');
const MedicineRefill = require('../../models/medicineRefill');
const Notification = require('../../models/notification');

const RUN = Date.now();
const PASSWORD = 'Strong@12345';
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };
const STORE = { lat: 26.9124, lng: 75.7873 };

describe('Rider deliveries (real MongoDB)', () => {
  let app;
  let db = false;
  let vendor;
  let vendorUser;
  let patient;
  let medicine;
  let coldMedicine;
  const riders = [];
  const tokens = {};
  const orders = {};

  const login = async (path, email, extra = {}) => (await request(app).post(`/api/v1${path}`).set(MOBILE).send({ email, password: PASSWORD, ...extra })).body.tokens?.accessToken;
  const auth = (t) => ({ ...MOBILE, Authorization: `Bearer ${t}` });
  const settle = () => new Promise((r) => setTimeout(r, 400)); // assignment runs just after the status change
  const place = (medId, dropLat) => request(app).post('/api/v1/pharmacy/orders').set(auth(tokens.patient)).send({
    vendorId: String(vendor._id), items: [{ medicineId: String(medId), quantity: 1 }], paymentMode: 'COD',
    deliveryAddress: { line1: 'Tonk Road', city: 'Jaipur', pincode: '302015' }, deliveryLocation: { coordinates: [STORE.lng, dropLat] }
  });
  const ready = async (id) => {
    for (const status of ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP']) {
      const r = await request(app).patch(`/api/v1/pharmacy/vendor/orders/${id}/status`).set(auth(tokens.vendor)).send({ status });
      expect(r.status).toBe(200);
    }
    await settle();
  };
  const riderApi = (method, path, who, body) => {
    const r = request(app)[method](`/api/v1/rider${path}`).set(auth(tokens[who]));
    return body !== undefined ? r.send(body) : r;
  };

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping rider tests: MongoDB unavailable (${error.message})`);
      return;
    }
    for (const M of [PharmacyVendor, VendorInventory, PharmacyOrder, Patient, SettlementEntry, User]) await M.createIndexes();
    app = require('../../app');
    vendor = await PharmacyVendor.create({
      name: `Rider Store ${RUN}`, slug: `rider-store-${RUN}`, location: { type: 'Point', coordinates: [STORE.lng, STORE.lat] },
      serviceRadiusKm: 8, status: 'APPROVED', isActive: true, isOpen: true, deliveryFee: 25, hasColdStorage: true
    });
    vendorUser = await User.create({ name: 'Store', email: `rstore.${RUN}@nabz.test`, password: PASSWORD, phone: '9876561001', role: 'pharmacy_vendor', pharmacyVendor: vendor._id, isVerified: true });
    vendor.owner = vendorUser._id;
    await vendor.save();
    medicine = await Medicine.create({ name: `Paracetamol R${RUN}`, slug: `paracetamol-r-${RUN}` });
    coldMedicine = await Medicine.create({ name: `Insulin R${RUN}`, slug: `insulin-r-${RUN}`, coldChain: true });
    await VendorInventory.create([
      { vendor: vendor._id, medicine: medicine._id, mrp: 60, sellingPrice: 50, stockQty: 50 },
      { vendor: vendor._id, medicine: coldMedicine._id, mrp: 500, sellingPrice: 450, stockQty: 10 }
    ]);
    patient = await Patient.create({ name: 'Ravi', email: `rp.${RUN}@nabz.test`, password: PASSWORD, phone: `93${String(RUN).slice(-8)}` });
    tokens.patient = await login('/patients/login', patient.email);
    tokens.vendor = await login('/auth/login', vendorUser.email, { portal: 'pharmacy' });
    for (const [i, km] of [0.5, 1.5].entries()) {
      riders.push(await User.create({
        name: `Rider ${i ? 'Bala' : 'Arjun'}`, email: `rider${i}.${RUN}@nabz.test`, password: PASSWORD, phone: `98765620${i}${String(RUN).slice(-1)}`,
        role: 'delivery_partner', isVerified: true
      }));
      tokens[`r${i}`] = await login('/auth/login', riders[i].email, { portal: 'rider' });
      const on = await riderApi('post', '/online', `r${i}`, { online: true, lat: STORE.lat + km / 111.2, lng: STORE.lng });
      expect(on.status).toBe(200);
    }
  }, 90000);

  afterAll(async () => {
    if (!db) return;
    const ids = (await PharmacyOrder.find({ vendor: vendor._id }).select('_id')).map((o) => o._id);
    await Promise.all([
      PharmacyOrder.deleteMany({ vendor: vendor._id }),
      MedicineRefill.deleteMany({ patient: patient._id }),
      Notification.deleteMany({ user: patient._id }),
      SettlementEntry.deleteMany({ 'source.id': { $in: ids } }),
      VendorInventory.deleteMany({ vendor: vendor._id }),
      InventoryMovement.deleteMany({ vendor: vendor._id }),
      Medicine.deleteMany({ _id: { $in: [medicine._id, coldMedicine._id] } }),
      PharmacyVendor.deleteOne({ _id: vendor._id }),
      Patient.deleteOne({ _id: patient._id }),
      User.deleteMany({ _id: { $in: [vendorUser, ...riders].map((u) => u._id) } })
    ]);
    await mongoose.disconnect();
  });

  it('a ready order goes to the nearest free rider; a nearby second drop joins the same trip', async () => {
    if (!db) return;
    orders.a = (await place(medicine._id, STORE.lat + 2 / 111.2)).body.order;
    orders.b = (await place(medicine._id, STORE.lat + 2.8 / 111.2)).body.order;
    expect(orders.a && orders.b).toBeTruthy();
    await ready(orders.a._id);
    const a = await PharmacyOrder.findById(orders.a._id).lean();
    expect(String(a.rider)).toBe(String(riders[0]._id)); // 0.5 km away beats 1.5 km
    expect(a.deliveryStatus).toBe('ASSIGNED');
    await ready(orders.b._id);
    expect(String((await PharmacyOrder.findById(orders.b._id).lean()).rider)).toBe(String(riders[0]._id)); // batched
    const jobs = await riderApi('get', '/jobs', 'r0');
    expect(jobs.body.batches).toHaveLength(1);
    expect(jobs.body.batches[0].drops.map((d) => d.orderNumber).sort()).toEqual([a.orderNumber, orders.b.orderNumber].sort());
    expect(jobs.body.batches[0].drops[0].collectCash).toBeGreaterThan(0);
  });

  it('a cold-chain order is never batched: it goes to another free rider', async () => {
    if (!db) return;
    orders.c = (await place(coldMedicine._id, STORE.lat + 2.2 / 111.2)).body.order;
    await ready(orders.c._id);
    const c = await PharmacyOrder.findById(orders.c._id).lean();
    expect(c.coldChain).toBe(true);
    expect(String(c.rider)).toBe(String(riders[1]._id));
  });

  it('once a rider is assigned the store can’t hand the order out itself', async () => {
    if (!db) return;
    const r = await request(app).patch(`/api/v1/pharmacy/vendor/orders/${orders.a._id}/status`).set(auth(tokens.vendor)).send({ status: 'OUT_FOR_DELIVERY' });
    expect(r.status).toBe(409);
  });

  it('a rider who can’t take a drop releases it and is not offered it again', async () => {
    if (!db) return;
    expect((await riderApi('post', `/jobs/${orders.b._id}/release`, 'r0', { reason: 'Bike puncture' })).body).toMatchObject({ released: true });
    await settle();
    const b = await PharmacyOrder.findById(orders.b._id).lean();
    expect(b.riderDeclined).toContain(String(riders[0]._id));
    expect(String(b.rider || '')).not.toBe(String(riders[0]._id));
    expect((await riderApi('post', `/jobs/${orders.b._id}/picked-up`, 'r0')).status).toBe(404); // not theirs any more
  });

  it('pickup sends it out; delivery needs the customer’s code; the rider is paid and the cash is booked to them', async () => {
    if (!db) return;
    expect((await riderApi('post', `/jobs/${orders.a._id}/delivered`, 'r0', { code: '0000' })).status).toBe(409); // not picked up yet
    expect((await riderApi('post', `/jobs/${orders.a._id}/arrived-store`, 'r0')).status).toBe(200);
    expect((await riderApi('post', `/jobs/${orders.a._id}/picked-up`, 'r0')).status).toBe(200);
    expect((await PharmacyOrder.findById(orders.a._id).lean()).status).toBe('OUT_FOR_DELIVERY');
    const { deliveryOtp } = await PharmacyOrder.findById(orders.a._id).select('+deliveryOtp.code').lean();
    const wrong = deliveryOtp.code === '0000' ? '1111' : '0000';
    expect((await riderApi('post', `/jobs/${orders.a._id}/delivered`, 'r0', { code: wrong })).status).toBe(400);
    const done = await riderApi('post', `/jobs/${orders.a._id}/delivered`, 'r0', { code: deliveryOtp.code });
    expect(done.status).toBe(200);
    expect(done.body.pay).toBeGreaterThan(20); // base + per km
    const a = await PharmacyOrder.findById(orders.a._id).lean();
    expect(a).toMatchObject({ status: 'DELIVERED', deliveryStatus: 'DELIVERED' });
    const rows = await SettlementEntry.find({ 'source.id': a._id }).lean();
    const by = (type, kind) => rows.find((r) => r.type === type && r.party.kind === kind);
    expect(by('RIDER_PAYOUT', 'RIDER').amount).toBe(done.body.pay);
    expect(by('CASH_COLLECTED', 'RIDER').amount).toBe(a.amounts.total);
    expect(by('CASH_COLLECTED', 'VENDOR')).toBeUndefined(); // the store didn't take the cash
    expect(by('VENDOR_PAYOUT', 'VENDOR')).toBeTruthy();
    const earn = await riderApi('get', '/earnings', 'r0');
    expect(earn.body.today).toMatchObject({ drops: 1, earned: done.body.pay });
  });

  it('a delivered order becomes a monthly refill: reminded once, two days before, and one tap refills the cart', async () => {
    if (!db) return;
    await MedicineRefill.createIndexes();
    const refills = (method, path, body) => {
      const r = request(app)[method](`/api/v1/refills${path}`).set(auth(tokens.patient));
      return body !== undefined ? r.send(body) : r;
    };
    expect((await refills('post', '', { orderId: String(orders.c._id), everyDays: 30 })).status).toBe(400); // not delivered yet
    const made = await refills('post', '', { orderId: String(orders.a._id), everyDays: 30 });
    expect(made.status).toBe(201);
    expect(made.body.refill.items[0]).toMatchObject({ quantity: 1 });
    expect((await refills('post', '', { orderId: String(orders.a._id), everyDays: 30 })).status).toBe(409);
    const id = made.body.refill._id;

    const svc = require('../../services/refillService');
    expect(await svc.sweep()).toBe(0); // a month away
    await MedicineRefill.updateOne({ _id: id }, { $set: { nextDue: new Date(Date.now() + 86400000) } });
    expect(await svc.sweep()).toBe(1);
    expect(await svc.sweep()).toBe(0); // once per cycle
    expect(await Notification.countDocuments({ user: patient._id, 'metadata.refillId': String(id) })).toBe(1);

    const cart = await refills('get', `/${id}/reorder`);
    expect(cart.body.vendor).toMatchObject({ _id: String(vendor._id), available: true });
    expect(cart.body.items).toEqual([expect.objectContaining({ medicineId: String(medicine._id), quantity: 1 })]);
    const again = await place(medicine._id, STORE.lat + 1 / 111.2);
    const after = await refills('post', `/${id}/ordered`, { orderId: again.body.order._id });
    expect(new Date(after.body.refill.nextDue).getTime()).toBeGreaterThan(Date.now() + 25 * 86400000);
    expect((await refills('put', `/${id}`, { status: 'PAUSED' })).body.refill.status).toBe('PAUSED');
  });
});
