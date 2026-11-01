/**
 * Double taps and retries never create or move money twice: real app + real
 * MongoDB. Each test fires the same request several times AT ONCE, the way a
 * double tap or a flaky network does, with the Idempotency-Key the apps now
 * send (frontends/shared/src/repeatGuard.ts), and counts what was created.
 *   - Place order x6 at once -> one order, stock taken once.
 *   - The same order again after it succeeded -> the same order, not a new one.
 *   - The same key with a different basket -> refused (422), nothing created.
 *   - Cancel x6 at once -> cancelled once, stock returned once.
 *   - Book a nurse visit x6 at once -> one booking.
 * Skips when MONGODB_URI is unreachable.
 */

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a'.repeat(64);

const crypto = require('crypto');
const request = require('supertest');
const mongoose = require('mongoose');
const Patient = require('../../models/patient');
const User = require('../../models/user');
const PharmacyVendor = require('../../models/pharmacyVendor');
const Medicine = require('../../models/medicine');
const VendorInventory = require('../../models/vendorInventory');
const PharmacyOrder = require('../../models/pharmacyOrder');
const InventoryMovement = require('../../models/inventoryMovement');
const NurseBooking = require('../../models/nurseBooking');
const ServiceCatalog = require('../../models/serviceCatalog');
const IdempotencyKey = require('../../models/idempotencyKey');

const RUN = `dt${Date.now().toString(36)}`;
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };
const PASSWORD = 'Strong@12345';
const HOME = { lat: 26.9110, lng: 75.8010 };
const TAPS = 6;

describe('Double-tap and retry safety (real MongoDB)', () => {
  let app;
  let db = false;
  let vendor;
  let medicine;
  let patient;
  let token;
  let createdService = null;

  const auth = () => ({ Authorization: `Bearer ${token}`, ...MOBILE });
  const key = () => crypto.randomUUID();
  const stock = async () => (await VendorInventory.findOne({ vendor: vendor._id, medicine: medicine._id }).lean()).stockQty;
  const orderBody = (quantity = 2) => ({
    vendorId: String(vendor._id),
    items: [{ medicineId: String(medicine._id), quantity }],
    deliveryAddress: { line1: '12 Ashok Marg', pincode: '302001' },
    deliveryLocation: { coordinates: [HOME.lng, HOME.lat] },
    paymentMode: 'COD'
  });
  const tapAtOnce = (n, send) => Promise.all(Array.from({ length: n }, () => send()));

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping double-tap safety: MongoDB unavailable (${error.message})`);
      return;
    }
    for (const Model of [Patient, User, PharmacyVendor, Medicine, VendorInventory, PharmacyOrder, NurseBooking, ServiceCatalog, IdempotencyKey]) {
      await Model.createIndexes();
    }
    app = require('../../app');

    vendor = await PharmacyVendor.create({
      name: `Double Tap Pharmacy ${RUN}`, slug: `dt-store-${RUN}`, location: { type: 'Point', coordinates: [HOME.lng, HOME.lat] },
      serviceRadiusKm: 8, status: 'APPROVED', isActive: true, isOpen: true, deliveryFee: 25, minOrderValue: 0
    });
    medicine = await Medicine.create({ name: `Dolo 650 ${RUN}`, slug: `dolo-${RUN}`, genericName: 'Paracetamol', strength: '650mg', form: 'TABLET' });
    await VendorInventory.create({ vendor: vendor._id, medicine: medicine._id, mrp: 35, sellingPrice: 30, stockQty: 50 });
    patient = await Patient.create({ name: 'Kamla Devi', email: `dt.${RUN}@nabz.test`, password: PASSWORD, phone: `93${String(Date.now()).slice(-8)}` });
    const login = await request(app).post('/api/v1/patients/login').set(MOBILE).send({ email: patient.email, password: PASSWORD });
    token = login.body.tokens.accessToken;

    if (!(await ServiceCatalog.exists({ name: 'INJECTION_IM' }))) {
      createdService = await ServiceCatalog.create({
        name: 'INJECTION_IM', slug: `injection-${RUN}`, category: 'NURSING', displayName: 'IM Injection',
        pricing: { basePrice: 299, currency: 'INR' }, availability: { isActive: true, availableCities: ['Jaipur'] },
        requirements: { prescriptionRequired: false }
      });
    }
  }, 90000);

  afterAll(async () => {
    if (!db) return;
    await Promise.all([
      PharmacyOrder.deleteMany({ vendor: vendor._id }),
      InventoryMovement.deleteMany({ vendor: vendor._id }),
      VendorInventory.deleteMany({ vendor: vendor._id }),
      Medicine.deleteOne({ _id: medicine._id }),
      PharmacyVendor.deleteOne({ _id: vendor._id }),
      NurseBooking.deleteMany({ patient: patient._id }),
      Patient.deleteOne({ _id: patient._id }),
      createdService ? ServiceCatalog.deleteOne({ _id: createdService._id }) : null
    ]);
    await mongoose.disconnect();
  });

  it(`place order tapped ${TAPS} times at once -> exactly one order, stock taken once`, async () => {
    if (!db) return;
    const before = await stock();
    const k = key();
    const body = orderBody(2);
    const responses = await tapAtOnce(TAPS, () => request(app).post('/api/v1/pharmacy/orders').set(auth()).set('Idempotency-Key', k).send(body));

    const created = responses.filter((r) => r.status === 201);
    const blocked = responses.filter((r) => r.status === 409);
    expect(created.length + blocked.length).toBe(TAPS); // nothing else (no 500s)
    expect(created.length).toBeGreaterThanOrEqual(1);
    expect(new Set(created.map((r) => r.body.order._id)).size).toBe(1); // replays point at the same order
    expect(await PharmacyOrder.countDocuments({ vendor: vendor._id, patient: patient._id })).toBe(1);
    expect(await stock()).toBe(before - 2);
  });

  it('the same order sent again after it succeeded returns that order, not a new one', async () => {
    if (!db) return;
    const k = key();
    const body = orderBody(1);
    const first = await request(app).post('/api/v1/pharmacy/orders').set(auth()).set('Idempotency-Key', k).send(body);
    expect(first.status).toBe(201);
    const countAfterFirst = await PharmacyOrder.countDocuments({ vendor: vendor._id });
    const stockAfterFirst = await stock();

    const retry = await request(app).post('/api/v1/pharmacy/orders').set(auth()).set('Idempotency-Key', k).send(body);
    expect(retry.status).toBe(201);
    expect(retry.body.order._id).toBe(first.body.order._id);
    expect(await PharmacyOrder.countDocuments({ vendor: vendor._id })).toBe(countAfterFirst);
    expect(await stock()).toBe(stockAfterFirst);
  });

  it('the same key with a different basket is refused and creates nothing', async () => {
    if (!db) return;
    const k = key();
    const first = await request(app).post('/api/v1/pharmacy/orders').set(auth()).set('Idempotency-Key', k).send(orderBody(1));
    expect(first.status).toBe(201);
    const count = await PharmacyOrder.countDocuments({ vendor: vendor._id });
    const changed = await request(app).post('/api/v1/pharmacy/orders').set(auth()).set('Idempotency-Key', k).send(orderBody(3));
    expect(changed.status).toBe(422);
    expect(await PharmacyOrder.countDocuments({ vendor: vendor._id })).toBe(count);
  });

  it(`cancel tapped ${TAPS} times at once -> cancelled once, stock returned once`, async () => {
    if (!db) return;
    const placed = await request(app).post('/api/v1/pharmacy/orders').set(auth()).set('Idempotency-Key', key()).send(orderBody(3));
    expect(placed.status).toBe(201);
    const stockAfterOrder = await stock();
    const id = placed.body.order._id;

    const responses = await tapAtOnce(TAPS, () => request(app).post(`/api/v1/pharmacy/orders/${id}/cancel`).set(auth()).send({ reason: 'Changed my mind' }));
    expect(responses.filter((r) => r.status >= 500)).toEqual([]);
    expect(responses.some((r) => r.status === 200)).toBe(true);
    expect((await PharmacyOrder.findById(id).lean()).status).toBe('CANCELLED');
    expect(await stock()).toBe(stockAfterOrder + 3); // returned exactly once
  });

  it(`book a nurse visit tapped ${TAPS} times at once -> exactly one booking`, async () => {
    if (!db) return;
    const today = new Date().toISOString().slice(0, 10);
    const k = key();
    const body = {
      serviceType: 'INJECTION', mode: 'SCHEDULED', scheduledDate: today, scheduledTime: '23:30',
      scheduledTimezone: 'Asia/Kolkata', scheduledTimezoneOffsetMinutes: 330,
      serviceLocation: { type: 'HOME', address: { street: 'Ashok Marg', city: 'Jaipur', pincode: '302001', coordinates: HOME } },
      patientDetails: { name: 'Meera Sharma', age: 34, gender: 'Female' }
    };
    const responses = await tapAtOnce(TAPS, () => request(app).post('/api/v1/bookings').set(auth()).set('Idempotency-Key', k).send(body));
    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s >= 500)).toEqual([]);
    expect(statuses.every((s) => s === 201 || s === 409)).toBe(true);
    expect(await NurseBooking.countDocuments({ patient: patient._id })).toBe(1);
    const created = responses.filter((r) => r.status === 201);
    expect(new Set(created.map((r) => String(r.body.booking?._id || r.body.data?._id))).size).toBe(1);
  });
});
