/**
 * Shared set-up for bot tests: a real app on a real MongoDB with verified
 * nurses, customers, an admin and two pharmacies, plus small helpers.
 * Each suite gets its own RUN id so fixtures never mix.
 */

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'b'.repeat(64);

const request = require('supertest');
const mongoose = require('mongoose');
const Patient = require('../../models/patient');
const User = require('../../models/user');
const NurseBooking = require('../../models/nurseBooking');
const ServiceCatalog = require('../../models/serviceCatalog');
const PharmacyVendor = require('../../models/pharmacyVendor');
const Medicine = require('../../models/medicine');
const VendorInventory = require('../../models/vendorInventory');
const PharmacyOrder = require('../../models/pharmacyOrder');
const SettlementEntry = require('../../models/settlementEntry');
const WithdrawalRequest = require('../../models/withdrawalRequest');

const HOME = { lat: 26.9110, lng: 75.8010 };
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };
// Throwaway bot accounts get a random password each run.
const PASSWORD = `${require('crypto').randomBytes(9).toString('base64url')}Aa1!`;
const ist = (days = 0) => new Date(Date.now() + 330 * 60000 + days * 86400000).toISOString().slice(0, 10);
const bodyOf = (res) => res.body?.data || res.body || {};

function createHarness(tag) {
  const RUN = `${tag}${Date.now().toString(36)}`;
  const h = { RUN, t: {}, u: {}, findings: [], app: null, db: false };
  const phone = (n) => `98${String(Date.now()).slice(-5)}${String(n).padStart(3, '0')}`;
  h.note = (bot, expected, got) => h.findings.push({ bot, expected, got: typeof got === 'string' ? got : JSON.stringify(got).slice(0, 300) });
  h.auth = (tok) => ({ Authorization: `Bearer ${tok}`, ...MOBILE });
  h.req = () => request(h.app);
  h.bookBody = (extra = {}) => ({
    serviceType: 'INJECTION', mode: 'SCHEDULED', scheduledDate: ist(1), scheduledTime: '11:00',
    scheduledTimezone: 'Asia/Kolkata', scheduledTimezoneOffsetMinutes: 330,
    serviceLocation: { type: 'HOME', address: { street: 'Ashok Marg', city: 'Jaipur', pincode: '302001', coordinates: HOME } },
    patientDetails: { name: 'Kamla Devi', age: 70, gender: 'Female' },
    ...extra
  });
  h.book = (tok, extra) => request(h.app).post('/api/v1/bookings').set(h.auth(tok)).send(h.bookBody(extra));
  h.bookingOf = (res) => res.body?.booking || bodyOf(res).booking;
  h.order = (tok, store, qty, extra = {}) => request(h.app).post('/api/v1/pharmacy/orders').set(h.auth(tok)).send({
    vendorId: String(store._id), items: [{ medicineId: String(h.u.med._id), quantity: qty }],
    deliveryAddress: { line1: '1 Test Road', city: 'Jaipur', pincode: '302001', contactPhone: '9876500000' },
    deliveryLocation: { coordinates: [HOME.lng, HOME.lat] }, paymentMode: 'COD', ...extra
  });
  h.orderOf = (res) => bodyOf(res).order || res.body.order;
  h.expectRefused = (bot, label, res) => {
    if (res.status < 400) h.note(bot, `${label} is refused`, `${res.status}`);
    if (res.status >= 500) h.note(bot, `${label} fails cleanly (4xx)`, `${res.status} ${JSON.stringify(res.body).slice(0, 150)}`);
  };
  h.expectOk = (bot, label, res) => {
    if (res.status >= 400) h.note(bot, `${label} works`, `${res.status} ${JSON.stringify(res.body).slice(0, 180)}`);
  };

  h.setup = async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
      h.db = true;
    } catch (error) {
      console.warn(`Skipping bots: MongoDB unavailable (${error.message})`);
      return;
    }
    for (const M of [User, Patient, NurseBooking, ServiceCatalog, PharmacyVendor, Medicine, VendorInventory, PharmacyOrder, SettlementEntry, WithdrawalRequest]) await M.createIndexes();
    h.app = require('../../app');
    const { u, t } = h;
    u.service = await ServiceCatalog.findOneAndUpdate({ name: 'INJECTION_IM' }, {
      $setOnInsert: {
        name: 'INJECTION_IM', slug: `inj-${RUN}`, category: 'NURSING', displayName: 'IM Injection',
        pricing: { basePrice: 299, currency: 'INR' }, availability: { isActive: true, availableCities: ['Jaipur'] },
        requirements: { prescriptionRequired: false }
      }
    }, { upsert: true, new: true });
    const verified = { idVerified: true, policeVerified: true, councilVerified: true };
    [u.n1, u.n2, u.admin] = await User.create([
      { name: 'Asha Bot', email: `n1.${RUN}@nabz.test`, password: PASSWORD, phone: phone(1), role: 'nurse', isVerified: true, careProfile: { gender: 'FEMALE', verification: verified } },
      { name: 'Ravi Bot', email: `n2.${RUN}@nabz.test`, password: PASSWORD, phone: phone(2), role: 'nurse', isVerified: true, careProfile: { gender: 'MALE', verification: verified } },
      { name: 'Ops Bot', email: `ops.${RUN}@nabz.test`, password: PASSWORD, phone: phone(3), role: 'platform_admin', isVerified: true }
    ]);
    [u.p1, u.p2] = await Patient.create([
      { name: 'Priya Bot', email: `p1.${RUN}@nabz.test`, password: PASSWORD, phone: phone(4) },
      { name: 'Rohan Bot', email: `p2.${RUN}@nabz.test`, password: PASSWORD, phone: phone(5) }
    ]);
    const northOf = (km) => [HOME.lng, HOME.lat + km / 111.2];
    [u.storeA, u.storeB] = await PharmacyVendor.create([
      { name: `Store A ${RUN}`, slug: `sa-${RUN}`, location: { type: 'Point', coordinates: northOf(1) }, serviceRadiusKm: 5, status: 'APPROVED', isActive: true, isOpen: true, deliveryFee: 20 },
      { name: `Store B ${RUN}`, slug: `sb-${RUN}`, location: { type: 'Point', coordinates: northOf(2) }, serviceRadiusKm: 5, status: 'APPROVED', isActive: true, isOpen: true, deliveryFee: 20 }
    ]);
    u.med = await Medicine.create({ name: `Paracetamol ${RUN}`, slug: `para-${RUN}`, form: 'TABLET' });
    u.rxMed = await Medicine.create({ name: `Azithromycin ${RUN}`, slug: `azi-${RUN}`, form: 'TABLET', requiresPrescription: true });
    await VendorInventory.create([
      { vendor: u.storeA._id, medicine: u.med._id, mrp: 30, sellingPrice: 25, stockQty: 40, stockUpdatedAt: new Date() },
      { vendor: u.storeB._id, medicine: u.med._id, mrp: 30, sellingPrice: 25, stockQty: 40, stockUpdatedAt: new Date() },
      { vendor: u.storeA._id, medicine: u.rxMed._id, mrp: 120, sellingPrice: 110, stockQty: 10, stockUpdatedAt: new Date() }
    ]);
    [u.vendorA, u.vendorB] = await User.create([
      { name: 'Vendor A', email: `va.${RUN}@nabz.test`, password: PASSWORD, phone: phone(6), role: 'pharmacy_vendor', isVerified: true, pharmacyVendor: u.storeA._id },
      { name: 'Vendor B', email: `vb.${RUN}@nabz.test`, password: PASSWORD, phone: phone(7), role: 'pharmacy_vendor', isVerified: true, pharmacyVendor: u.storeB._id }
    ]);
    const staffLogin = async (email, portal = 'staff') => (await request(h.app).post('/api/v1/auth/login').set(MOBILE).send({ email, password: PASSWORD, portal })).body.tokens?.accessToken;
    const patientLogin = async (email) => {
      const res = await request(h.app).post('/api/v1/patients/login').set(MOBILE).send({ email, password: PASSWORD });
      return bodyOf(res).tokens?.accessToken || res.body.tokens?.accessToken;
    };
    t.n1 = await staffLogin(u.n1.email);
    t.n2 = await staffLogin(u.n2.email);
    t.admin = await staffLogin(u.admin.email, 'admin');
    t.vendorA = await staffLogin(u.vendorA.email, 'pharmacy');
    t.vendorB = await staffLogin(u.vendorB.email, 'pharmacy');
    t.p1 = await patientLogin(u.p1.email);
    t.p2 = await patientLogin(u.p2.email);
    for (const [k, v] of Object.entries(t)) if (!v) h.note('setup', `token for ${k}`, 'no token');
  };

  h.teardown = async () => {
    if (!h.db) return;
    const { u } = h;
    const users = ['n1', 'n2', 'admin', 'vendorA', 'vendorB'].map((k) => u[k]?._id).filter(Boolean);
    const patients = [u.p1?._id, u.p2?._id].filter(Boolean);
    await Promise.all([
      NurseBooking.deleteMany({ patient: { $in: patients } }),
      PharmacyOrder.deleteMany({ patient: { $in: patients } }),
      SettlementEntry.deleteMany({ 'party.id': { $in: [...users, u.storeA?._id, u.storeB?._id] } }),
      WithdrawalRequest.deleteMany({ user: { $in: users } }),
      VendorInventory.deleteMany({ medicine: { $in: [u.med?._id, u.rxMed?._id] } }),
      Medicine.deleteMany({ _id: { $in: [u.med?._id, u.rxMed?._id] } }),
      PharmacyVendor.deleteMany({ _id: { $in: [u.storeA?._id, u.storeB?._id] } }),
      User.deleteMany({ _id: { $in: users } }),
      Patient.deleteMany({ _id: { $in: patients } })
    ]);
    await mongoose.disconnect();
  };

  h.report = () => {
    if (h.findings.length) console.log(`\n${h.findings.length} bot finding(s):\n${h.findings.map((f, i) => `${i + 1}. [${f.bot}] expected: ${f.expected}\n   got: ${f.got}`).join('\n')}`);
    return h.findings;
  };
  return h;
}

module.exports = { createHarness, HOME, MOBILE, PASSWORD, ist, bodyOf };
