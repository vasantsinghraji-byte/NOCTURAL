/**
 * Medicine substitution with consent (real MongoDB): same salt only, units
 * held while the customer decides, accept swaps the line (cheaper → refund /
 * lower bill), decline or no answer removes it like "item unavailable", and
 * the store can't pack while an answer is pending.
 */
const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../models/user');
const Patient = require('../../models/patient');
const Medicine = require('../../models/medicine');
const PharmacyVendor = require('../../models/pharmacyVendor');
const VendorInventory = require('../../models/vendorInventory');
const PharmacyOrder = require('../../models/pharmacyOrder');
const InventoryMovement = require('../../models/inventoryMovement');
const Notification = require('../../models/notification');

const RUN = Date.now();
const PASSWORD = 'Strong@12345';
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };
const STORE = { lat: 26.9124, lng: 75.7873 };

describe('Medicine substitution (real MongoDB)', () => {
  let app;
  let db = false;
  let vendor;
  let vendorUser;
  let patient;
  const med = {};
  const tokens = {};

  const login = async (path, email, extra = {}) => (await request(app).post(`/api/v1${path}`).set(MOBILE).send({ email, password: PASSWORD, ...extra })).body.tokens?.accessToken;
  const auth = (t) => ({ ...MOBILE, Authorization: `Bearer ${t}` });
  const stock = async (m) => (await VendorInventory.findOne({ vendor: vendor._id, medicine: med[m]._id }).lean()).stockQty;
  const placeAndAccept = async () => {
    const res = await request(app).post('/api/v1/pharmacy/orders').set(auth(tokens.patient)).send({
      vendorId: String(vendor._id), items: [{ medicineId: String(med.brand._id), quantity: 2 }, { medicineId: String(med.other._id), quantity: 1 }], paymentMode: 'COD',
      deliveryAddress: { line1: 'Tonk Road', city: 'Jaipur', pincode: '302015' }, deliveryLocation: { coordinates: [STORE.lng, STORE.lat + 0.01] }
    });
    expect(res.status).toBe(201);
    expect((await request(app).patch(`/api/v1/pharmacy/vendor/orders/${res.body.order._id}/status`).set(auth(tokens.vendor)).send({ status: 'ACCEPTED' })).status).toBe(200);
    return res.body.order;
  };
  const propose = (orderId, substitute) => request(app).post(`/api/v1/pharmacy/vendor/orders/${orderId}/substitutions`).set(auth(tokens.vendor))
    .send({ medicineId: String(med.brand._id), substituteId: String(med[substitute]._id), note: 'Same salt, trusted maker' });
  const answer = (orderId, accept) => request(app).post(`/api/v1/pharmacy/orders/${orderId}/substitutions/${med.brand._id}`).set(auth(tokens.patient)).send({ accept });

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping substitution tests: MongoDB unavailable (${error.message})`);
      return;
    }
    for (const M of [PharmacyVendor, VendorInventory, PharmacyOrder, Patient, User, Medicine]) await M.createIndexes();
    app = require('../../app');
    vendor = await PharmacyVendor.create({
      name: `Sub Store ${RUN}`, slug: `sub-store-${RUN}`, location: { type: 'Point', coordinates: [STORE.lng, STORE.lat] },
      serviceRadiusKm: 8, status: 'APPROVED', isActive: true, isOpen: true, deliveryFee: 25
    });
    vendorUser = await User.create({ name: 'Store', email: `substore.${RUN}@nabz.test`, password: PASSWORD, phone: '9876571001', role: 'pharmacy_vendor', pharmacyVendor: vendor._id, isVerified: true });
    vendor.owner = vendorUser._id;
    await vendor.save();
    const salt = { genericName: 'Amlodipine', strength: '5mg', form: 'TABLET' };
    med.brand = await Medicine.create({ name: `Amlong 5 ${RUN}`, slug: `amlong-${RUN}`, manufacturer: 'Micro Labs', ...salt });
    med.cheaper = await Medicine.create({ name: `Amlodac 5 ${RUN}`, slug: `amlodac-${RUN}`, manufacturer: 'Zydus', ...salt });
    med.dearer = await Medicine.create({ name: `Norvasc 5 ${RUN}`, slug: `norvasc-${RUN}`, manufacturer: 'Pfizer', ...salt });
    med.otherSalt = await Medicine.create({ name: `Telma 40 ${RUN}`, slug: `telma-${RUN}`, genericName: 'Telmisartan', strength: '40mg', form: 'TABLET' });
    med.other = await Medicine.create({ name: `Crocin ${RUN}`, slug: `crocin-sub-${RUN}`, genericName: 'Paracetamol', strength: '500mg', form: 'TABLET' });
    await VendorInventory.create([
      { vendor: vendor._id, medicine: med.brand._id, mrp: 60, sellingPrice: 50, stockQty: 20 },
      { vendor: vendor._id, medicine: med.cheaper._id, mrp: 45, sellingPrice: 40, stockQty: 20 },
      { vendor: vendor._id, medicine: med.dearer._id, mrp: 80, sellingPrice: 70, stockQty: 20 },
      { vendor: vendor._id, medicine: med.otherSalt._id, mrp: 90, sellingPrice: 85, stockQty: 20 },
      { vendor: vendor._id, medicine: med.other._id, mrp: 30, sellingPrice: 25, stockQty: 20 }
    ]);
    patient = await Patient.create({ name: 'Kamla', email: `subp.${RUN}@nabz.test`, password: PASSWORD, phone: `92${String(RUN).slice(-8)}` });
    tokens.patient = await login('/patients/login', patient.email);
    tokens.vendor = await login('/auth/login', vendorUser.email, { portal: 'pharmacy' });
  }, 90000);

  afterAll(async () => {
    if (!db) return;
    await Promise.all([
      PharmacyOrder.deleteMany({ vendor: vendor._id }),
      VendorInventory.deleteMany({ vendor: vendor._id }),
      InventoryMovement.deleteMany({ vendor: vendor._id }),
      Medicine.deleteMany({ _id: { $in: Object.values(med).map((m) => m._id) } }),
      Notification.deleteMany({ user: { $in: [patient._id, vendorUser._id] } }),
      PharmacyVendor.deleteOne({ _id: vendor._id }),
      Patient.deleteOne({ _id: patient._id }),
      User.deleteOne({ _id: vendorUser._id })
    ]);
    await mongoose.disconnect();
  });

  it('the store sees only same-salt substitutes it has in stock, cheapest first', async () => {
    if (!db) return;
    const order = await placeAndAccept();
    const r = await request(app).get(`/api/v1/pharmacy/vendor/orders/${order._id}/substitutes?medicineId=${med.brand._id}`).set(auth(tokens.vendor));
    expect(r.status).toBe(200);
    expect(r.body.substitutes.map((s) => s.name)).toEqual([med.cheaper.name, med.dearer.name]);
    expect(r.body.substitutes[0]).toMatchObject({ difference: -20, allowed: true });
    expect((await propose(order._id, 'otherSalt')).status).toBe(400); // a different medicine
  });

  it('accepting a cheaper substitute swaps the line, lowers the bill and puts the original back on the shelf', async () => {
    if (!db) return;
    const order = await placeAndAccept();
    const [brandBefore, cheapBefore] = [await stock('brand'), await stock('cheaper')];
    const res = await propose(order._id, 'cheaper');
    expect(res.status).toBe(201);
    expect(await stock('cheaper')).toBe(cheapBefore - 2); // held for the customer
    expect((await propose(order._id, 'dearer')).status).toBe(409); // one suggestion at a time
    // Can't pack while the customer is deciding.
    expect((await request(app).patch(`/api/v1/pharmacy/vendor/orders/${order._id}/status`).set(auth(tokens.vendor)).send({ status: 'PREPARING' })).status).toBe(409);

    const ok = await answer(order._id, true);
    expect(ok.status).toBe(200);
    const after = await PharmacyOrder.findById(order._id).lean();
    const line = after.items.find((i) => String(i.medicine) === String(med.cheaper._id));
    expect(line).toMatchObject({ unitPrice: 40, lineTotal: 80, status: 'AVAILABLE' });
    expect(line.substitutedFrom).toMatchObject({ name: med.brand.name, lineTotal: 100 });
    expect(after.amounts.total).toBe(order.amounts.total - 20);
    expect(await stock('brand')).toBe(brandBefore + 2);
    expect((await answer(order._id, true)).status).toBe(409); // already answered
    expect((await request(app).patch(`/api/v1/pharmacy/vendor/orders/${order._id}/status`).set(auth(tokens.vendor)).send({ status: 'PREPARING' })).status).toBe(200);
  });

  it('on a prepaid order a dearer substitute is refused; declining refunds the line like "unavailable"', async () => {
    if (!db) return;
    const order = await placeAndAccept();
    await PharmacyOrder.updateOne({ _id: order._id }, { $set: { paymentMode: 'PREPAID', paymentStatus: 'PAID', paymentId: 'pay_sub_test' } });
    expect((await propose(order._id, 'dearer')).status).toBe(400);
    const cheapBefore = await stock('cheaper');
    expect((await propose(order._id, 'cheaper')).status).toBe(201);
    const no = await answer(order._id, false);
    expect(no.status).toBe(200);
    expect(await stock('cheaper')).toBe(cheapBefore); // released
    const after = await PharmacyOrder.findById(order._id).lean();
    const brand = after.items.find((i) => String(i.medicine) === String(med.brand._id));
    expect(brand).toMatchObject({ status: 'UNAVAILABLE' });
    expect(brand.substitution.status).toBe('DECLINED');
    expect(after.amounts.total).toBe(order.amounts.total - 100);
    expect((after.refunds || []).some((r) => r.amount === 100)).toBe(true);
    expect(await stock('brand')).toBe(0); // declined = the store didn't have it, as with "unavailable"
  });

  it('nobody else can answer, and no answer in 15 minutes counts as declined', async () => {
    if (!db) return;
    // The decline above zeroed the shelf count (the store didn't have it): restock.
    await VendorInventory.updateOne({ vendor: vendor._id, medicine: med.brand._id }, { $set: { stockQty: 20 } });
    const order = await placeAndAccept();
    expect((await propose(order._id, 'cheaper')).status).toBe(201);
    const stranger = await Patient.create({ name: 'Other', email: `subx.${RUN}@nabz.test`, password: PASSWORD, phone: `91${String(RUN).slice(-8)}` });
    const strangerToken = await login('/patients/login', stranger.email);
    expect((await request(app).post(`/api/v1/pharmacy/orders/${order._id}/substitutions/${med.brand._id}`).set(auth(strangerToken)).send({ accept: true })).status).toBe(403);
    await Patient.deleteOne({ _id: stranger._id });

    await PharmacyOrder.updateOne({ _id: order._id, 'items.medicine': med.brand._id }, { $set: { 'items.$.substitution.respondBy': new Date(Date.now() - 1000) } });
    expect(await require('../../services/pharmacySubstitutionService').sweep()).toBe(1);
    const brand = (await PharmacyOrder.findById(order._id).lean()).items.find((i) => String(i.medicine) === String(med.brand._id));
    expect(brand.status).toBe('UNAVAILABLE');
    expect(brand.substitution.status).toBe('EXPIRED');
  });
});
