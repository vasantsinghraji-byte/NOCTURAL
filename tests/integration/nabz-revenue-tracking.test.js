/**
 * Revenue model + live tracking: real app + real MongoDB.
 *   - Nabz Plus trial → free delivery on the next pharmacy order.
 *   - Delivered order → settlement ledger rows (store payout, commission, delivery fee).
 *   - Revenue summary is platform-admin only.
 *   - Staff live location → patient tracking with ETA; strangers are refused.
 * Skips when MONGODB_URI is unreachable.
 */

process.env.ENCRYPTION_KEY = 'a'.repeat(64);

const request = require('supertest');
const mongoose = require('mongoose');
const Patient = require('../../models/patient');
const User = require('../../models/user');
const PharmacyVendor = require('../../models/pharmacyVendor');
const Medicine = require('../../models/medicine');
const VendorInventory = require('../../models/vendorInventory');
const PharmacyOrder = require('../../models/pharmacyOrder');
const InventoryMovement = require('../../models/inventoryMovement');
const Membership = require('../../models/membership');
const SettlementEntry = require('../../models/settlementEntry');
const NurseBooking = require('../../models/nurseBooking');
const Notification = require('../../models/notification');

const RUN = `rv${Date.now().toString(36)}`;
const HOME = { lat: 26.9110, lng: 75.8010 }; // C-Scheme, Jaipur
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };
const PASSWORD = 'Strong@12345';

describe('Nabz revenue model + live tracking (real MongoDB)', () => {
  let app;
  let db = false;
  let vendor;
  let vendorUser;
  let nurse;
  let admin;
  let patient;
  let stranger;
  let medicine;
  let patientToken;
  const tokens = {};

  const login = async (email, portal) => {
    const res = await request(app).post('/api/v1/auth/login').set(MOBILE).send({ email, password: PASSWORD, ...(portal ? { portal } : {}) });
    return res.body.tokens.accessToken;
  };

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: Number(process.env.TEST_MONGO_SERVER_SELECTION_TIMEOUT_MS) || 3000,
        autoIndex: false
      });
      db = true;
    } catch (error) {
      console.warn(`Skipping revenue/tracking flow: MongoDB unavailable (${error.message})`);
      return;
    }
    for (const Model of [PharmacyVendor, VendorInventory, PharmacyOrder, Patient, Membership, SettlementEntry, User]) {
      await Model.createIndexes();
    }
    app = require('../../app');

    vendor = await PharmacyVendor.create({
      name: `Revenue Store ${RUN}`, slug: `revenue-store-${RUN}`,
      location: { type: 'Point', coordinates: [HOME.lng, HOME.lat + 0.5 / 111.2] },
      serviceRadiusKm: 5, status: 'APPROVED', isActive: true, isOpen: true, deliveryFee: 25
    });
    [vendorUser, nurse, admin] = await User.create([
      { name: 'Store', email: `store.${RUN}@nabz.test`, password: PASSWORD, phone: '9876503456', role: 'pharmacy_vendor', pharmacyVendor: vendor._id, isVerified: true },
      { name: 'Nurse Asha', email: `nurse.${RUN}@nabz.test`, password: PASSWORD, phone: '9876503457', role: 'nurse', isVerified: true,
        careProfile: { verification: { idVerified: true, policeVerified: true, councilVerified: true } } },
      { name: 'Ops Admin', email: `ops.${RUN}@nabz.test`, password: PASSWORD, phone: '9876503458', role: 'platform_admin', isVerified: true }
    ]);
    vendor.owner = vendorUser._id;
    await vendor.save();
    medicine = await Medicine.create({ name: `Paracetamol ${RUN}`, slug: `paracetamol-${RUN}` });
    await VendorInventory.create({ vendor: vendor._id, medicine: medicine._id, mrp: 60, sellingPrice: 50, stockQty: 20 });

    [patient, stranger] = await Patient.create([
      { name: 'Plus Patient', email: `plus.${RUN}@nabz.test`, password: PASSWORD, phone: `96${String(Date.now()).slice(-8)}` },
      { name: 'Stranger', email: `stranger.${RUN}@nabz.test`, password: PASSWORD, phone: `95${String(Date.now()).slice(-8)}` }
    ]);
    const p = await request(app).post('/api/v1/patients/login').set(MOBILE).send({ email: patient.email, password: PASSWORD });
    patientToken = p.body.tokens.accessToken;
    const s = await request(app).post('/api/v1/patients/login').set(MOBILE).send({ email: stranger.email, password: PASSWORD });
    tokens.stranger = s.body.tokens.accessToken;
    tokens.vendor = await login(vendorUser.email, 'pharmacy');
    tokens.nurse = await login(nurse.email, 'staff');
    tokens.admin = await login(admin.email, 'admin');
  });

  afterAll(async () => {
    if (!db) return;
    await new Promise((r) => setTimeout(r, 300));
    const orderIds = (await PharmacyOrder.find({ vendor: vendor._id }).select('_id')).map((o) => o._id);
    await Promise.all([
      PharmacyVendor.deleteOne({ _id: vendor._id }),
      User.deleteMany({ _id: { $in: [vendorUser, nurse, admin].map((u) => u._id) } }),
      Patient.deleteMany({ _id: { $in: [patient._id, stranger._id] } }),
      Medicine.deleteOne({ _id: medicine._id }),
      VendorInventory.deleteMany({ vendor: vendor._id }),
      PharmacyOrder.deleteMany({ vendor: vendor._id }),
      InventoryMovement.deleteMany({ vendor: vendor._id }),
      Membership.deleteMany({ patient: patient._id }),
      SettlementEntry.deleteMany({ 'source.id': { $in: orderIds } }),
      NurseBooking.deleteMany({ patient: patient._id }),
      Notification.deleteMany({ user: vendorUser._id })
    ]);
    await mongoose.disconnect();
  });

  const skip = () => !db;
  const auth = (t) => ({ Authorization: `Bearer ${t}` });

  const placeOrder = () => request(app).post('/api/v1/pharmacy/orders').set(auth(patientToken)).send({
    vendorId: String(vendor._id),
    items: [{ medicineId: String(medicine._id), quantity: 3 }],
    paymentMode: 'COD',
    deliveryAddress: { line1: 'Ashok Marg', city: 'Jaipur', pincode: '302001' },
    deliveryLocation: { coordinates: [HOME.lng, HOME.lat] }
  });

  it('Nabz Plus trial makes delivery free, and can only be used once', async () => {
    if (skip()) return;
    const before = await placeOrder();
    expect(before.status).toBe(201);
    expect(before.body.order.amounts.deliveryFee).toBeGreaterThan(0);

    const trial = await request(app).post('/api/v1/membership/trial').set(auth(patientToken));
    expect(trial.status).toBe(201);
    const status = await request(app).get('/api/v1/membership').set(auth(patientToken));
    expect(status.body).toMatchObject({ active: true, trialAvailable: false });
    expect((await request(app).post('/api/v1/membership/trial').set(auth(patientToken))).status).toBe(409);

    const after = await placeOrder();
    expect(after.status).toBe(201);
    expect(after.body.order.amounts.deliveryFee).toBe(0);
    expect(after.body.order.feeBreakdown.waiver).toBe('MEMBER');
  });

  it('a delivered order books store payout, commission and delivery fee exactly once', async () => {
    if (skip()) return;
    const order = await PharmacyOrder.findOne({ vendor: vendor._id, 'amounts.deliveryFee': { $gt: 0 } });
    const { deliveryOtp } = await PharmacyOrder.findById(order._id).select('+deliveryOtp.code').lean();
    for (const status of ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED']) {
      const body = status === 'DELIVERED' ? { status, deliveryCode: deliveryOtp.code } : { status };
      const res = await request(app).patch(`/api/v1/pharmacy/vendor/orders/${order._id}/status`).set(auth(tokens.vendor)).send(body);
      expect(res.status).toBe(200);
    }
    const rows = await SettlementEntry.find({ 'source.id': order._id }).lean();
    const byType = Object.fromEntries(rows.map((r) => [r.type, r]));
    expect(byType.VENDOR_PAYOUT).toMatchObject({ amount: 135, status: 'PENDING' }); // 150 − 10%
    expect(byType.COMMISSION).toMatchObject({ amount: 15, rate: 0.1 });
    expect(byType.DELIVERY_FEE.amount).toBe(order.amounts.deliveryFee);
    const expected = order.paymentMode === 'COD' ? 4 : 3;
    if (order.paymentMode === 'COD') {
      // The store took the cash, so it's netted off the store's payout.
      expect(byType.CASH_COLLECTED).toMatchObject({ amount: order.amounts.total, status: 'PENDING' });
      const payouts = await require('../../services/settlementService').getPendingPayouts({});
      const mine = payouts.find((p) => String(p.partyId) === String(vendor._id));
      expect(mine.cashHeld).toBeGreaterThanOrEqual(order.amounts.total);
    }

    // Replaying the event adds nothing.
    await require('../../services/settlementService').recordPharmacyOrder(await PharmacyOrder.findById(order._id));
    expect(await SettlementEntry.countDocuments({ 'source.id': order._id })).toBe(expected);
  });

  it('revenue summary is for platform admins only', async () => {
    if (skip()) return;
    const res = await request(app).get('/api/v1/admin/revenue/summary').set(auth(tokens.admin));
    expect(res.status).toBe(200);
    expect(res.body.summary.platformRevenue).toBeGreaterThanOrEqual(15);
    expect(res.body.summary.revenueByLine.PHARMACY_ORDER).toBeGreaterThanOrEqual(15);
    expect((await request(app).get('/api/v1/admin/revenue/summary').set(auth(tokens.vendor))).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/revenue/payouts').set(auth(patientToken))).status).toBeGreaterThanOrEqual(401);
  });

  it('staff are discoverable only while they are online (blurred, anonymous)', async () => {
    if (skip()) return;
    const nearby = () => request(app).get('/api/v1/care/staff/nearby').query({ ...HOME, radiusKm: 5 });
    const nurseAt = { lat: HOME.lat + 1 / 111.2, lng: HOME.lng };

    expect((await nearby()).body.count).toBe(0);
    const on = await request(app).put('/api/v1/care/staff/availability').set(auth(tokens.nurse)).send({ online: true, ...nurseAt });
    expect(on.status).toBe(200);
    expect(on.body.availability.online).toBe(true);

    const seen = await nearby();
    expect(seen.body.count).toBe(1);
    expect(seen.body.staff[0]).not.toHaveProperty('name');
    expect(Math.abs(seen.body.staff[0].lat - nurseAt.lat)).toBeLessThan(0.006); // blurred, not exact
    expect((await request(app).get('/api/v1/bookings/providers/assignable').set(auth(tokens.admin))).status).toBeLessThan(500);

    // A stale heartbeat (app killed / no signal) hides them without an explicit offline.
    await User.updateOne({ _id: nurse._id }, { $set: { 'currentLocation.updatedAt': new Date(Date.now() - 11 * 60 * 1000) } });
    expect((await nearby()).body.count).toBe(0);

    const off = await request(app).put('/api/v1/care/staff/availability').set(auth(tokens.nurse)).send({ online: false });
    expect(off.body.availability.online).toBe(false);
    expect((await User.findById(nurse._id).lean()).currentLocation).toBeUndefined(); // location wiped
    expect((await request(app).put('/api/v1/care/staff/availability').set(auth(tokens.vendor)).send({ online: true, ...nurseAt })).status).toBe(403);
  });

  it('staff live location reaches the patient with an ETA; others are refused', async () => {
    if (skip()) return;
    const booking = await NurseBooking.create({
      patient: patient._id,
      serviceProvider: nurse._id,
      serviceType: 'INJECTION',
      scheduledDate: new Date(Date.now() + 3600 * 1000),
      scheduledTime: '10:00',
      scheduledTimezone: 'Asia/Kolkata',
      scheduledTimezoneOffsetMinutes: 330,
      serviceLocation: { type: 'HOME', address: { street: 'Ashok Marg', city: 'Jaipur', pincode: '302001', coordinates: HOME } },
      pricing: { basePrice: 299, platformFee: 44.85, gst: 61.9, totalAmount: 405.75, payableAmount: 405.75 },
      status: 'EN_ROUTE'
    });

    const nurseAt = { lat: HOME.lat + 2 / 111.2, lng: HOME.lng }; // ~2 km north
    const post = await request(app).put(`/api/v1/bookings/${booking._id}/location`).set(auth(tokens.nurse)).send(nurseAt);
    expect(post.status).toBe(200);
    expect(post.body.tracking.distanceKm).toBeCloseTo(2, 0);

    const track = await request(app).get(`/api/v1/bookings/${booking._id}/tracking`).set(auth(patientToken));
    expect(track.status).toBe(200);
    expect(track.body.tracking.staffLocation).toMatchObject(nurseAt);
    expect(track.body.tracking.staff.name).toBe('Nurse Asha');
    expect(new Date(track.body.tracking.estimatedArrival).getTime()).toBeGreaterThan(Date.now());

    expect((await request(app).get(`/api/v1/bookings/${booking._id}/tracking`).set(auth(tokens.stranger))).status).toBe(403);
    expect((await request(app).put(`/api/v1/bookings/${booking._id}/location`).set(auth(tokens.vendor)).send(nurseAt)).status).toBe(403);

    // Visit finished → location is no longer shared.
    await NurseBooking.updateOne({ _id: booking._id }, { $set: { status: 'COMPLETED' } });
    const after = await request(app).get(`/api/v1/bookings/${booking._id}/tracking`).set(auth(patientToken));
    expect(after.body.tracking.staffLocation).toBeNull();
  });
});
