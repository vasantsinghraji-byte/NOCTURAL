/**
 * Home-care booking ↔ pharmacy link — real app + real MongoDB.
 *
 * A patient books a nurse visit and, per supply item, chooses "I have it" or
 * "staff brings it". Staff-brings items become a STAFF_PICKUP pharmacy order
 * linked to the booking (no rider fee, no basket minimum), the store is
 * notified, and cancelling the visit cancels the order and restocks.
 *
 * Skips when MONGODB_URI is unreachable.
 */

process.env.ENCRYPTION_KEY = 'a'.repeat(64);

const request = require('supertest');
const mongoose = require('mongoose');
const Patient = require('../../models/patient');
const PharmacyVendor = require('../../models/pharmacyVendor');
const Medicine = require('../../models/medicine');
const VendorInventory = require('../../models/vendorInventory');
const PharmacyOrder = require('../../models/pharmacyOrder');
const NurseBooking = require('../../models/nurseBooking');
const ServiceCatalog = require('../../models/serviceCatalog');
const InventoryMovement = require('../../models/inventoryMovement');
const Notification = require('../../models/notification');
const User = require('../../models/user');

const RUN = `cb${Date.now().toString(36)}`;
const HOME = { lat: 12.9352, lng: 77.6245 };
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };
const PATIENT_LOGIN = { email: `care.${RUN}@medrush.test`, password: 'Patient@12345' };

const waitFor = async (fn, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value || Date.now() > deadline) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
};

describe('Home-care booking with pharmacy supplies (real MongoDB)', () => {
  let app;
  let databaseAvailable = false;
  let vendor;
  let vendorUser;
  let patient;
  let syringe;
  let swabs;
  let token;
  let service;
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);

  const bookingBody = (supplies) => ({
    serviceType: 'INJECTION',
    scheduledDate: tomorrow,
    scheduledTime: '10:30',
    scheduledTimezone: 'Asia/Kolkata',
    scheduledTimezoneOffsetMinutes: 330,
    serviceLocation: {
      type: 'HOME',
      address: { street: '12 Care Street', city: 'Bengaluru', pincode: '560034', coordinates: HOME }
    },
    patientDetails: { name: 'Care Patient', age: 60, gender: 'Female' },
    supplies
  });

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: Number(process.env.TEST_MONGO_SERVER_SELECTION_TIMEOUT_MS) || 3000,
        autoIndex: false
      });
      databaseAvailable = true;
    } catch (error) {
      console.warn(`Skipping care booking flow: MongoDB unavailable (${error.message})`);
      return;
    }
    for (const Model of [PharmacyVendor, VendorInventory, PharmacyOrder, Patient, Medicine, ServiceCatalog]) {
      await Model.createIndexes();
    }
    app = require('../../app');

    vendor = await PharmacyVendor.create({
      name: `Care Pharmacy ${RUN}`,
      slug: `care-pharmacy-${RUN}`,
      location: { type: 'Point', coordinates: [HOME.lng, HOME.lat + 1 / 111.2] },
      serviceRadiusKm: 5,
      status: 'APPROVED',
      isActive: true,
      isOpen: true,
      deliveryFee: 25,
      minOrderValue: 199 // staff-pickup supplies must bypass this
    });
    vendorUser = await User.create({
      name: 'Care Store', email: `store.${RUN}@medrush.test`, password: 'Vendor@12345',
      phone: '9876502345', role: 'pharmacy_vendor', pharmacyVendor: vendor._id, isVerified: true
    });
    vendor.owner = vendorUser._id;
    await vendor.save();

    [syringe, swabs] = await Medicine.create([
      { name: `Syringe ${RUN}`, slug: `syringe-${RUN}`, form: 'DEVICE', category: 'DEVICES', scheduleType: 'OTC' },
      { name: `Swabs ${RUN}`, slug: `swabs-${RUN}`, form: 'OTHER', category: 'FIRST_AID', scheduleType: 'OTC' }
    ]);
    await VendorInventory.create([
      { vendor: vendor._id, medicine: syringe._id, mrp: 12, sellingPrice: 10, stockQty: 20 },
      { vendor: vendor._id, medicine: swabs._id, mrp: 110, sellingPrice: 99, stockQty: 5 }
    ]);

    await ServiceCatalog.deleteMany({ name: 'INJECTION_IM' });
    service = await ServiceCatalog.create({
      name: 'INJECTION_IM',
      slug: `injection-${RUN}`,
      category: 'NURSING',
      displayName: 'IM Injection',
      pricing: { basePrice: 299, currency: 'INR' },
      availability: { isActive: true, availableCities: ['Bengaluru'] },
      requirements: { prescriptionRequired: false },
      supplies: [
        { key: 'medicine', name: 'Prescribed injection', kind: 'MEDICINE', defaultSource: 'PATIENT_HAS' },
        { key: 'syringe', name: 'Syringe', medicineSlug: syringe.slug, quantity: 2 },
        { key: 'swabs', name: 'Alcohol swabs', medicineSlug: swabs.slug }
      ]
    });

    patient = await Patient.create({
      name: 'Care Patient', email: PATIENT_LOGIN.email, password: PATIENT_LOGIN.password,
      phone: `97${String(Date.now()).slice(-8)}`
    });
    const login = await request(app).post('/api/v1/patients/login').set(MOBILE).send(PATIENT_LOGIN);
    token = login.body.tokens.accessToken;
  });

  afterAll(async () => {
    if (!databaseAvailable) return;
    await new Promise((r) => setTimeout(r, 300));
    await Promise.all([
      vendor && PharmacyVendor.deleteOne({ _id: vendor._id }),
      vendorUser && User.deleteOne({ _id: vendorUser._id }),
      vendorUser && Notification.deleteMany({ user: vendorUser._id }),
      patient && Patient.deleteOne({ _id: patient._id }),
      patient && NurseBooking.deleteMany({ patient: patient._id }),
      Medicine.deleteMany({ _id: { $in: [syringe, swabs].filter(Boolean).map((m) => m._id) } }),
      vendor && VendorInventory.deleteMany({ vendor: vendor._id }),
      vendor && PharmacyOrder.deleteMany({ vendor: vendor._id }),
      vendor && InventoryMovement.deleteMany({ vendor: vendor._id }),
      service && ServiceCatalog.deleteOne({ _id: service._id })
    ]);
    await mongoose.disconnect();
  });

  const skip = () => !databaseAvailable;

  it('lists bookable services with their supplies', async () => {
    if (skip()) return;
    const res = await request(app).get('/api/v1/care/services');
    expect(res.status).toBe(200);
    const injection = res.body.services.find((s) => s.serviceType === 'INJECTION');
    expect(injection.supplies.map((s) => s.key)).toEqual(['medicine', 'syringe', 'swabs']);
  });

  it('quotes supplies from the nearest pharmacy that stocks them', async () => {
    if (skip()) return;
    const res = await request(app).get('/api/v1/care/supplies/quote')
      .query({ serviceType: 'INJECTION', ...HOME });
    expect(res.status).toBe(200);
    expect(res.body.quote.vendor._id).toBe(String(vendor._id));
    const byKey = Object.fromEntries(res.body.quote.items.map((i) => [i.key, i]));
    expect(byKey.syringe).toMatchObject({ available: true, unitPrice: 10, quantity: 2 });
    expect(byKey.medicine).toMatchObject({ medicineId: null, defaultSource: 'PATIENT_HAS' });
  });

  it('rejects "staff brings" for a medicine only the patient can provide, leaving no booking', async () => {
    if (skip()) return;
    const before = await NurseBooking.countDocuments({ patient: patient._id });
    const res = await request(app).post('/api/v1/bookings').set('Authorization', `Bearer ${token}`)
      .send(bookingBody([{ key: 'medicine', source: 'STAFF_BRINGS' }]));
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('must be provided by you');
    expect(await NurseBooking.countDocuments({ patient: patient._id })).toBe(before);
  });

  it('books the visit, orders the staff-brings items for nurse pickup, notifies the store, and cancels cleanly', async () => {
    if (skip()) return;
    const res = await request(app).post('/api/v1/bookings').set('Authorization', `Bearer ${token}`)
      .send(bookingBody([
        { key: 'medicine', source: 'PATIENT_HAS' },
        { key: 'syringe', source: 'STAFF_BRINGS' },
        { key: 'swabs', source: 'PATIENT_HAS' }
      ]));
    expect(res.status).toBe(201);
    const booking = res.body.booking;
    expect(booking.supplies.status).toBe('ORDERED');
    expect(booking.supplies.amount).toBe(20); // 2 × ₹10, no delivery fee
    expect(booking.supplies.items.find((i) => i.key === 'syringe')).toMatchObject({ source: 'STAFF_BRINGS', lineTotal: 20 });

    const order = await PharmacyOrder.findById(booking.supplies.pharmacyOrder).lean();
    expect(order.fulfilment).toBe('STAFF_PICKUP');
    expect(String(order.careVisit.booking)).toBe(String(booking._id));
    expect(order.amounts.deliveryFee).toBe(0); // below the ₹199 minimum, still accepted
    expect(order.items.map((i) => String(i.medicine))).toEqual([String(syringe._id)]);
    expect((await VendorInventory.findOne({ vendor: vendor._id, medicine: syringe._id })).stockQty).toBe(18);

    const notification = await waitFor(() => Notification.findOne({
      user: vendorUser._id, 'metadata.orderId': String(order._id)
    }).lean());
    expect(notification.message).toContain('Nurse pickup');

    const cancel = await request(app).put(`/api/v1/bookings/${booking._id}/cancel`)
      .set('Authorization', `Bearer ${token}`).send({ reason: 'Feeling better' });
    expect(cancel.status).toBe(200);
    expect((await PharmacyOrder.findById(order._id).lean()).status).toBe('CANCELLED');
    expect((await VendorInventory.findOne({ vendor: vendor._id, medicine: syringe._id })).stockQty).toBe(20);
    expect((await NurseBooking.findById(booking._id).lean()).supplies.status).toBe('CANCELLED');
  });
});
