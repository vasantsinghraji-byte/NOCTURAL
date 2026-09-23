/**
 * MedRush mobile flow — real app + real MongoDB.
 *
 * Proves what the phone/emulator depends on:
 *   1. Login from the Expo app (native, no Origin) returns bearer tokens;
 *      the same login from a browser origin gets cookies only.
 *   2. Bearer tokens authenticate patient and vendor API calls.
 *   3. CORS: the web origin is allowed (with credentials and the mobile header),
 *      an unknown origin is not.
 *   4. A COD order notifies the store ("medical"): in-app Notification row +
 *      push attempt to the vendor's registered device.
 *
 * Skips when MONGODB_URI is unreachable. Locally:
 *   MONGODB_URI=mongodb://127.0.0.1:27017/medrush_test npx jest --config jest.config.js tests/integration/medrush-mobile-flow.test.js
 */

process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
process.env.ENCRYPTION_KEY = 'a'.repeat(64);

const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../models/user');
const Patient = require('../../models/patient');
const PharmacyVendor = require('../../models/pharmacyVendor');
const Medicine = require('../../models/medicine');
const VendorInventory = require('../../models/vendorInventory');
const PharmacyOrder = require('../../models/pharmacyOrder');
const Notification = require('../../models/notification');
const MobileDevice = require('../../models/mobileDevice');
const InventoryMovement = require('../../models/inventoryMovement');
const RefreshSession = require('../../models/refreshSession');
const pushNotificationService = require('../../services/pushNotificationService');

const RUN = `mf${Date.now().toString(36)}`;
const HOME = { lat: 12.9352, lng: 77.6245 };
const VENDOR_LOGIN = { email: `vendor.${RUN}@medrush.test`, password: 'Vendor@12345' };
const PATIENT_LOGIN = { email: `patient.${RUN}@medrush.test`, password: 'Patient@12345' };
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };

const waitFor = async (fn, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
};

describe('MedRush mobile flow (real MongoDB)', () => {
  let app;
  let databaseAvailable = false;
  let vendor;
  let vendorUser;
  let patient;
  let medicine;

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: Number(process.env.TEST_MONGO_SERVER_SELECTION_TIMEOUT_MS) || 3000,
        autoIndex: false
      });
      databaseAvailable = true;
    } catch (error) {
      console.warn(`Skipping MedRush mobile flow: MongoDB unavailable (${error.message})`);
      return;
    }
    for (const Model of [PharmacyVendor, VendorInventory, PharmacyOrder, Patient]) {
      await Model.createIndexes();
    }
    app = require('../../app');

    vendor = await PharmacyVendor.create({
      name: `Mobile Test Store ${RUN}`,
      slug: `mobile-test-store-${RUN}`,
      location: { type: 'Point', coordinates: [HOME.lng, HOME.lat + 1 / 111.2] },
      serviceRadiusKm: 5,
      status: 'APPROVED',
      isActive: true,
      isOpen: true,
      deliveryFee: 20
    });
    vendorUser = await User.create({
      name: 'Store Manager',
      email: VENDOR_LOGIN.email,
      password: VENDOR_LOGIN.password,
      phone: '9876501234',
      role: 'pharmacy_vendor',
      pharmacyVendor: vendor._id,
      isVerified: true
    });
    vendor.owner = vendorUser._id;
    await vendor.save();

    patient = await Patient.create({
      name: 'Mobile Patient',
      email: PATIENT_LOGIN.email,
      password: PATIENT_LOGIN.password,
      phone: `98${String(Date.now()).slice(-8)}`
    });
    medicine = await Medicine.create({ name: `Cetirizine ${RUN}`, slug: `cetirizine-${RUN}` });
    await VendorInventory.create({ vendor: vendor._id, medicine: medicine._id, mrp: 40, sellingPrice: 35, stockQty: 10 });
  });

  afterAll(async () => {
    if (!databaseAvailable) return;
    await new Promise((r) => setTimeout(r, 300)); // let fire-and-forget notifications settle
    const userIds = [vendorUser, patient].filter(Boolean).map((u) => u._id);
    await Promise.all([
      vendor && PharmacyVendor.deleteOne({ _id: vendor._id }),
      vendorUser && User.deleteOne({ _id: vendorUser._id }),
      patient && Patient.deleteOne({ _id: patient._id }),
      medicine && Medicine.deleteOne({ _id: medicine._id }),
      vendor && VendorInventory.deleteMany({ vendor: vendor._id }),
      vendor && PharmacyOrder.deleteMany({ vendor: vendor._id }),
      vendor && InventoryMovement.deleteMany({ vendor: vendor._id }),
      Notification.deleteMany({ user: { $in: userIds } }),
      MobileDevice.deleteMany({ owner: { $in: userIds } }),
      RefreshSession.deleteMany({ userId: { $in: userIds } })
    ]);
    await mongoose.disconnect();
  });

  const skipIfNoDb = () => {
    if (!databaseAvailable) {
      console.warn('MongoDB unavailable — test skipped');
      return true;
    }
    return false;
  };

  describe('login', () => {
    it('gives the native app bearer tokens and they authenticate /auth/me', async () => {
      if (skipIfNoDb()) return;
      const login = await request(app).post('/api/v1/auth/login').set(MOBILE).send(VENDOR_LOGIN);
      expect(login.status).toBe(200);
      expect(login.body.tokens.accessToken).toEqual(expect.any(String));
      expect(login.body.tokens.refreshToken).toEqual(expect.any(String));

      const me = await request(app).get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${login.body.tokens.accessToken}`);
      expect(me.status).toBe(200);
      const profile = me.body.user || me.body.data;
      expect(profile.role).toBe('pharmacy_vendor');
    });

    it('never returns tokens to a browser (cookies only), even with the mobile header', async () => {
      if (skipIfNoDb()) return;
      const login = await request(app).post('/api/v1/auth/login')
        .set(MOBILE).set('Origin', 'http://localhost:3000').send(VENDOR_LOGIN);
      expect(login.status).toBe(200);
      expect(login.body.tokens).toBeUndefined();
      expect(String(login.headers['set-cookie'])).toMatch(/HttpOnly/i);
    });

    it('rejects a wrong password', async () => {
      if (skipIfNoDb()) return;
      const login = await request(app).post('/api/v1/auth/login').set(MOBILE)
        .send({ ...VENDOR_LOGIN, password: 'Wrong@12345' });
      expect(login.status).toBe(401);
      expect(login.body.tokens).toBeUndefined();
    });

    it('separates logins by portal: a pharmacy account opens only the pharmacy portal', async () => {
      if (skipIfNoDb()) return;
      const ok = await request(app).post('/api/v1/auth/login').set(MOBILE).send({ ...VENDOR_LOGIN, portal: 'pharmacy' });
      expect(ok.status).toBe(200);
      expect(ok.body.tokens.accessToken).toEqual(expect.any(String));

      const wrong = await request(app).post('/api/v1/auth/login').set(MOBILE).send({ ...VENDOR_LOGIN, portal: 'staff' });
      expect(wrong.status).toBe(403);
      expect(wrong.body.tokens).toBeUndefined();
      expect(wrong.headers['set-cookie']).toBeUndefined();
      expect(wrong.body.message).toContain('Pharmacy partner login');

      const unknown = await request(app).post('/api/v1/auth/login').set(MOBILE).send({ ...VENDOR_LOGIN, portal: 'doctor' });
      expect(unknown.status).toBe(400);
    });

    it('gives the patient app bearer tokens', async () => {
      if (skipIfNoDb()) return;
      const login = await request(app).post('/api/v1/patients/login').set(MOBILE).send(PATIENT_LOGIN);
      expect(login.status).toBe(200);
      expect(login.body.tokens.accessToken).toEqual(expect.any(String));
    });
  });

  describe('CORS', () => {
    it('allows the web origin with credentials and the mobile header', async () => {
      if (skipIfNoDb()) return;
      const res = await request(app).options('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type,x-nocturnal-mobile');
      expect(res.status).toBeLessThan(300);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-allow-headers'].toLowerCase()).toContain('x-nocturnal-mobile');
    });

    it('does not allow an unknown origin', async () => {
      if (skipIfNoDb()) return;
      const res = await request(app).options('/api/v1/auth/login')
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'POST');
      expect(res.status).toBe(403);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('serves native requests without an Origin header', async () => {
      if (skipIfNoDb()) return;
      const res = await request(app).get('/api/v1/pharmacy/vendors/nearby').query(HOME);
      expect(res.status).toBe(200);
      expect(res.body.vendors.map((v) => String(v._id))).toContain(String(vendor._id));
    });
  });

  describe('vendor ("medical") notification', () => {
    it('notifies the store when a COD order is placed from the app', async () => {
      if (skipIfNoDb()) return;
      const pushSpy = jest.spyOn(pushNotificationService, 'sendToOwner');

      const vendorLogin = await request(app).post('/api/v1/auth/login').set(MOBILE).send(VENDOR_LOGIN);
      const vendorToken = vendorLogin.body.tokens.accessToken;
      const device = await request(app).post('/api/v1/mobile-devices')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ token: `fcm-test-token-${RUN}-0123456789`, platform: 'android' });
      expect(device.status).toBe(201);

      const patientLogin = await request(app).post('/api/v1/patients/login').set(MOBILE).send(PATIENT_LOGIN);
      const order = await request(app).post('/api/v1/pharmacy/orders')
        .set('Authorization', `Bearer ${patientLogin.body.tokens.accessToken}`)
        .send({
          vendorId: String(vendor._id),
          items: [{ medicineId: String(medicine._id), quantity: 2 }],
          paymentMode: 'COD',
          deliveryAddress: { line1: '1 Test Road', city: 'Bengaluru', pincode: '560034' },
          deliveryLocation: { coordinates: [HOME.lng, HOME.lat] }
        });
      expect(order.status).toBe(201);
      const orderId = String(order.body.order._id);

      const notification = await waitFor(() => Notification.findOne({
        user: vendorUser._id, type: 'PHARMACY_ORDER_NEW', 'metadata.orderId': orderId
      }).lean());
      expect(notification).toBeTruthy();
      expect(notification.title).toContain(order.body.order.orderNumber);
      expect(notification.message).toContain('Cash on delivery');

      // Push was attempted for the vendor's account; FCM itself is off in tests.
      expect(pushSpy).toHaveBeenCalledWith(expect.objectContaining({
        owner: String(vendorUser._id),
        userType: 'provider',
        data: expect.objectContaining({ orderId })
      }));
      const settled = await waitFor(() => Notification.findOne({
        _id: notification._id, 'deliveryStatus.push.error': { $exists: true }
      }).lean());
      expect(settled.deliveryStatus.push.error).toBe('Firebase push is disabled');

      // The vendor app sees the order in its queue.
      const queue = await request(app).get('/api/v1/pharmacy/vendor/orders')
        .set('Authorization', `Bearer ${vendorToken}`);
      expect(queue.status).toBe(200);
      expect(queue.body.orders.map((o) => String(o._id))).toContain(orderId);
      pushSpy.mockRestore();
    });
  });
});
