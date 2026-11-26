/**
 * Nabz credit pays for medicine orders (real MongoDB):
 *   - credit comes off the bill; `total` stays what the customer pays (cash, card, refunds)
 *   - credit never pays more than the bill, and a card order it fully covers must be cash
 *   - cancelling gives the credit back once, however often the sweep runs
 *   - when the store removes items, unused credit goes back to the wallet
 *   - adding items keeps the credit; the quote shows what credit is available
 *   - Nabz pays for the credit in the books; the store still earns on the full price
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
const SettlementEntry = require('../../models/settlementEntry');
const WalletAccount = require('../../models/walletAccount');
const WalletEntry = require('../../models/walletEntry');
const walletService = require('../../services/walletService');

const RUN = Date.now();
const PASSWORD = 'Strong@12345';
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };
const STORE = { lat: 26.9124, lng: 75.7873 };

describe('Nabz credit on medicine orders (real MongoDB)', () => {
  let app;
  let db = false;
  let vendor;
  let vendorUser;
  let patient;
  let med;
  let med2;
  let credits;
  let settlement;
  const tokens = {};

  const login = async (path, email, extra = {}) => (await request(app).post(`/api/v1${path}`).set(MOBILE).send({ email, password: PASSWORD, ...extra })).body.tokens?.accessToken;
  const auth = (t) => ({ ...MOBILE, Authorization: `Bearer ${t}` });
  // 2 × ₹50 + ₹25 delivery = ₹125 before credit.
  const place = (extra = {}) => request(app).post('/api/v1/pharmacy/orders').set(auth(tokens.patient)).send({
    vendorId: String(vendor._id), items: [{ medicineId: String(med._id), quantity: 2 }], paymentMode: 'COD',
    deliveryAddress: { line1: 'Tonk Road', city: 'Jaipur', pincode: '302015' }, deliveryLocation: { coordinates: [STORE.lng, STORE.lat + 1.5 / 111.2] },
    ...extra
  });
  const balance = () => walletService.balance(patient._id);
  const give = (amount) => walletService.credit(patient._id, amount, { reason: 'Test credit', ref: `test:${RUN}:${Math.random()}` });
  const fresh = (id) => PharmacyOrder.findById(id).lean();

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping credit tests: MongoDB unavailable (${error.message})`);
      return;
    }
    for (const M of [PharmacyVendor, VendorInventory, PharmacyOrder, Patient, User, WalletEntry, WalletAccount]) await M.createIndexes();
    app = require('../../app');
    credits = require('../../services/pharmacyCreditService');
    settlement = require('../../services/settlementService');
    vendor = await PharmacyVendor.create({
      name: `Credit Store ${RUN}`, slug: `credit-store-${RUN}`, location: { type: 'Point', coordinates: [STORE.lng, STORE.lat] },
      serviceRadiusKm: 8, status: 'APPROVED', isActive: true, isOpen: true, deliveryFee: 25
    });
    vendorUser = await User.create({ name: 'Store', email: `crstore.${RUN}@nabz.test`, password: PASSWORD, phone: '9876573001', role: 'pharmacy_vendor', pharmacyVendor: vendor._id, isVerified: true });
    vendor.owner = vendorUser._id;
    await vendor.save();
    med = await Medicine.create({ name: `Paracetamol K${RUN}`, slug: `paracetamol-k-${RUN}` });
    med2 = await Medicine.create({ name: `ORS K${RUN}`, slug: `ors-k-${RUN}` });
    await VendorInventory.create([
      { vendor: vendor._id, medicine: med._id, mrp: 60, sellingPrice: 50, stockQty: 200 },
      { vendor: vendor._id, medicine: med2._id, mrp: 25, sellingPrice: 20, stockQty: 200 }
    ]);
    patient = await Patient.create({ name: 'Savitri', email: `crp.${RUN}@nabz.test`, password: PASSWORD, phone: `93${String(RUN).slice(-8)}` });
    tokens.patient = await login('/patients/login', patient.email);
    tokens.vendor = await login('/auth/login', vendorUser.email, { portal: 'pharmacy' });
  }, 90000);

  afterEach(async () => {
    if (!db) return;
    // Every test starts with an empty wallet and a full shelf (marking an item unavailable zeroes it).
    await Promise.all([
      WalletEntry.deleteMany({ patient: patient._id }), WalletAccount.deleteMany({ patient: patient._id }),
      VendorInventory.updateMany({ vendor: vendor._id }, { $set: { stockQty: 200 } })
    ]);
  });

  afterAll(async () => {
    if (!db) return;
    const ids = (await PharmacyOrder.find({ vendor: vendor._id }).select('_id')).map((o) => o._id);
    await Promise.all([
      PharmacyOrder.deleteMany({ vendor: vendor._id }),
      Notification.deleteMany({ user: { $in: [vendorUser._id, patient._id] } }),
      SettlementEntry.deleteMany({ 'source.id': { $in: ids } }),
      VendorInventory.deleteMany({ vendor: vendor._id }),
      InventoryMovement.deleteMany({ vendor: vendor._id }),
      Medicine.deleteMany({ _id: { $in: [med._id, med2._id] } }),
      PharmacyVendor.deleteOne({ _id: vendor._id }),
      Patient.deleteOne({ _id: patient._id }),
      User.deleteOne({ _id: vendorUser._id })
    ]);
    await mongoose.disconnect();
  });

  it('credit comes off a cash order: the rider collects only the rest', async () => {
    if (!db) return;
    await give(50);
    const res = await place();
    expect(res.status).toBe(201);
    expect(res.body.order.amounts).toMatchObject({ itemsSubtotal: 100, deliveryFee: 25, credit: 50, creditSpent: 50, total: 75 });
    expect(await balance()).toBe(0);
  });

  it('credit never pays more than the bill', async () => {
    if (!db) return;
    await give(500);
    const res = await place();
    expect(res.body.order.amounts).toMatchObject({ credit: 125, total: 0 });
    expect(await balance()).toBe(375);
  });

  it('a card order the credit covers completely is refused before anything is spent', async () => {
    if (!db) return;
    const gateway = require('../../utils/razorpayGateway');
    const spy = jest.spyOn(gateway, 'isEnabled').mockReturnValue(true);
    try {
      await give(500);
      const before = await PharmacyOrder.countDocuments({ patient: patient._id });
      const res = await place({ paymentMode: 'PREPAID' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Nabz credit covers/);
      expect(await balance()).toBe(500);
      expect(await PharmacyOrder.countDocuments({ patient: patient._id })).toBe(before);
    } finally {
      spy.mockRestore();
    }
  });

  it('cancelling gives the credit back once, however often the sweep runs', async () => {
    if (!db) return;
    await give(50);
    const id = (await place()).body.order._id;
    const cancel = await request(app).post(`/api/v1/pharmacy/orders/${id}/cancel`).set(auth(tokens.patient)).send({ reason: 'Changed my mind' });
    expect(cancel.status).toBe(200);
    expect(await balance()).toBe(50);
    await credits.sweep();
    await credits.sweep();
    await credits.settle(await fresh(id));
    expect(await balance()).toBe(50);
    expect((await fresh(id)).amounts.creditReturned).toBe(50);
  });

  it('when the store removes items, credit the order no longer needs goes back to the wallet', async () => {
    if (!db) return;
    await give(100);
    const placed = await request(app).post('/api/v1/pharmacy/orders').set(auth(tokens.patient)).send({
      vendorId: String(vendor._id), items: [{ medicineId: String(med._id), quantity: 2 }, { medicineId: String(med2._id), quantity: 1 }], paymentMode: 'COD',
      deliveryAddress: { line1: 'Tonk Road', city: 'Jaipur', pincode: '302015' }, deliveryLocation: { coordinates: [STORE.lng, STORE.lat + 1.5 / 111.2] }
    });
    // 100 + 20 items + 25 delivery = 145; credit 100, cash 45.
    expect(placed.body.order.amounts).toMatchObject({ credit: 100, total: 45 });
    const id = placed.body.order._id;
    const removed = await request(app).post(`/api/v1/pharmacy/vendor/orders/${id}/items/unavailable`).set(auth(tokens.vendor)).send({ medicineIds: [String(med._id)], reason: 'Out of stock' });
    expect(removed.status).toBe(200);
    // Now 20 + 25 = 45: credit covers it all, nothing to collect, 55 goes back.
    expect((await fresh(id)).amounts).toMatchObject({ itemsSubtotal: 20, credit: 45, total: 0 });
    await credits.sweep();
    expect(await balance()).toBe(55);
    await credits.sweep();
    expect(await balance()).toBe(55);
  });

  it('adding items keeps the credit; the bill goes up by the new items only', async () => {
    if (!db) return;
    await give(30);
    const id = (await place()).body.order._id;
    expect((await fresh(id)).amounts).toMatchObject({ credit: 30, total: 95 });
    const add = await request(app).post(`/api/v1/pharmacy/orders/${id}/items`).set(auth(tokens.patient)).send({ items: [{ medicineId: String(med2._id), quantity: 1 }] });
    expect(add.status).toBe(200);
    expect((await fresh(id)).amounts).toMatchObject({ itemsSubtotal: 120, credit: 30, total: 115 });
    await credits.sweep();
    expect(await balance()).toBe(0);
  });

  it('the delivery quote shows the credit available', async () => {
    if (!db) return;
    await give(40);
    const q = await request(app).post('/api/v1/pharmacy/delivery-quote').set(auth(tokens.patient)).send({ vendorId: String(vendor._id), itemsSubtotal: 100 });
    expect(q.status).toBe(200);
    expect(q.body.data?.creditAvailable ?? q.body.creditAvailable).toBe(40);
  });

  it('Nabz pays for the credit in the books; the store still earns on the full price', async () => {
    if (!db) return;
    await give(50);
    const id = (await place()).body.order._id;
    await PharmacyOrder.updateOne({ _id: id }, { $set: { status: 'DELIVERED', deliveredAt: new Date() } });
    await settlement.recordPharmacyOrder(await PharmacyOrder.findById(id));
    const rows = await SettlementEntry.find({ 'source.id': id }).lean();
    const of = (type) => rows.find((r) => r.type === type);
    expect(of('CREDIT_USED')).toMatchObject({ amount: 50 });
    expect(of('VENDOR_PAYOUT').basis).toBe(100);
    expect(of('CASH_COLLECTED')).toMatchObject({ amount: 75 });
  });
});
