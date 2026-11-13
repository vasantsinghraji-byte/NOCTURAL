/**
 * Medicine order follow-up for customers (real MongoDB):
 *   - inside the change window a cash order takes extra items (stock reserved,
 *     bill and delivery fee re-worked, store told); not after the window, not
 *     once packing starts, not on someone else's order, not on paid orders;
 *     a prescription medicine needs a prescription;
 *   - the order shows the rider's name and number while the delivery is live
 *     (number hidden after the drop);
 *   - customer and store get the prescription as a link the app can open.
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

const RUN = Date.now();
const PASSWORD = 'Strong@12345';
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };
const STORE = { lat: 26.9124, lng: 75.7873 };

describe('Customer order changes, rider contact and prescription links (real MongoDB)', () => {
  let app;
  let db = false;
  let vendor;
  let vendorUser;
  let rider;
  let patient;
  let other;
  let otc;
  let otc2;
  let rxMed;
  const tokens = {};

  const login = async (path, email, extra = {}) => (await request(app).post(`/api/v1${path}`).set(MOBILE).send({ email, password: PASSWORD, ...extra })).body.tokens?.accessToken;
  const auth = (t) => ({ ...MOBILE, Authorization: `Bearer ${t}` });
  const place = (who = 'patient', extra = {}) => request(app).post('/api/v1/pharmacy/orders').set(auth(tokens[who])).send({
    vendorId: String(vendor._id), items: [{ medicineId: String(otc._id), quantity: 2 }], paymentMode: 'COD',
    deliveryAddress: { line1: 'Tonk Road', city: 'Jaipur', pincode: '302015' }, deliveryLocation: { coordinates: [STORE.lng, STORE.lat + 1.5 / 111.2] },
    ...extra
  });
  const addItems = (id, body, who = 'patient') => request(app).post(`/api/v1/pharmacy/orders/${id}/items`).set(auth(tokens[who])).send(body);
  const stock = async (med) => (await VendorInventory.findOne({ vendor: vendor._id, medicine: med._id }).lean()).stockQty;
  const setStatus = (id, status, extra = {}) => request(app).patch(`/api/v1/pharmacy/vendor/orders/${id}/status`).set(auth(tokens.vendor)).send({ status, ...extra });

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping order change tests: MongoDB unavailable (${error.message})`);
      return;
    }
    for (const M of [PharmacyVendor, VendorInventory, PharmacyOrder, Patient, User]) await M.createIndexes();
    app = require('../../app');
    vendor = await PharmacyVendor.create({
      name: `Change Store ${RUN}`, slug: `change-store-${RUN}`, location: { type: 'Point', coordinates: [STORE.lng, STORE.lat] },
      serviceRadiusKm: 8, status: 'APPROVED', isActive: true, isOpen: true, deliveryFee: 25
    });
    vendorUser = await User.create({ name: 'Store', email: `cstore.${RUN}@nabz.test`, password: PASSWORD, phone: '9876571001', role: 'pharmacy_vendor', pharmacyVendor: vendor._id, isVerified: true });
    vendor.owner = vendorUser._id;
    await vendor.save();
    otc = await Medicine.create({ name: `Paracetamol C${RUN}`, slug: `paracetamol-c-${RUN}` });
    otc2 = await Medicine.create({ name: `ORS C${RUN}`, slug: `ors-c-${RUN}` });
    rxMed = await Medicine.create({ name: `Azithro C${RUN}`, slug: `azithro-c-${RUN}`, scheduleType: 'PRESCRIPTION' });
    await VendorInventory.create([
      { vendor: vendor._id, medicine: otc._id, mrp: 60, sellingPrice: 50, stockQty: 40 },
      { vendor: vendor._id, medicine: otc2._id, mrp: 25, sellingPrice: 20, stockQty: 40 },
      { vendor: vendor._id, medicine: rxMed._id, mrp: 120, sellingPrice: 110, stockQty: 40 }
    ]);
    patient = await Patient.create({ name: 'Kamla', email: `cp.${RUN}@nabz.test`, password: PASSWORD, phone: `94${String(RUN).slice(-8)}` });
    other = await Patient.create({ name: 'Other', email: `co.${RUN}@nabz.test`, password: PASSWORD, phone: `95${String(RUN).slice(-8)}` });
    rider = await User.create({ name: 'Ravi Rider', email: `crider.${RUN}@nabz.test`, password: PASSWORD, phone: '9876572001', role: 'delivery_partner', isVerified: true });
    tokens.patient = await login('/patients/login', patient.email);
    tokens.other = await login('/patients/login', other.email);
    tokens.vendor = await login('/auth/login', vendorUser.email, { portal: 'pharmacy' });
    tokens.rider = await login('/auth/login', rider.email, { portal: 'rider' });
  }, 90000);

  afterAll(async () => {
    if (!db) return;
    const ids = (await PharmacyOrder.find({ vendor: vendor._id }).select('_id')).map((o) => o._id);
    await Promise.all([
      PharmacyOrder.deleteMany({ vendor: vendor._id }),
      Notification.deleteMany({ user: { $in: [vendorUser._id, patient._id, rider._id] } }),
      SettlementEntry.deleteMany({ 'source.id': { $in: ids } }),
      VendorInventory.deleteMany({ vendor: vendor._id }),
      InventoryMovement.deleteMany({ vendor: vendor._id }),
      Medicine.deleteMany({ _id: { $in: [otc._id, otc2._id, rxMed._id] } }),
      PharmacyVendor.deleteOne({ _id: vendor._id }),
      Patient.deleteMany({ _id: { $in: [patient._id, other._id] } }),
      User.deleteMany({ _id: { $in: [vendorUser._id, rider._id] } })
    ]);
    await mongoose.disconnect();
  });

  it('inside the window a cash order takes more items: stock, bill, timeline and the store are all updated', async () => {
    if (!db) return;
    const placed = await place();
    expect(placed.status).toBe(201);
    const id = placed.body.order._id;
    const view = await request(app).get(`/api/v1/pharmacy/orders/${id}`).set(auth(tokens.patient));
    const endsAt = new Date(view.body.order.changeWindowEndsAt).getTime();
    expect(endsAt - Date.now()).toBeGreaterThan(60 * 1000);
    expect(endsAt - Date.now()).toBeLessThanOrEqual(90 * 1000);

    const before = { otc: await stock(otc), otc2: await stock(otc2) };
    const res = await addItems(id, { items: [{ medicineId: String(otc2._id), quantity: 3 }, { medicineId: String(otc._id), quantity: 1 }] });
    expect(res.status).toBe(200);
    const o = res.body.order;
    // Same medicine again joins its line; a new one gets its own.
    expect(o.items).toHaveLength(2);
    expect(o.items.find((i) => i.name.startsWith('Paracetamol')).quantity).toBe(3);
    expect(o.items.find((i) => i.name.startsWith('ORS')).quantity).toBe(3);
    expect(o.amounts.itemsSubtotal).toBe(3 * 50 + 3 * 20);
    expect(o.amounts.total).toBe(o.amounts.itemsSubtotal + o.amounts.deliveryFee - o.amounts.discount);
    expect(o.timeline.some((t) => /Customer added 4 item/.test(t.note || ''))).toBe(true);
    expect(await stock(otc)).toBe(before.otc - 1);
    expect(await stock(otc2)).toBe(before.otc2 - 3);
    await new Promise((r) => setTimeout(r, 300)); // the store alert is sent after the reply
    expect(await Notification.exists({ user: vendorUser._id, type: 'PHARMACY_ORDER_UPDATE', title: new RegExp(o.orderNumber) })).toBeTruthy();
  });

  it('a prescription medicine needs a prescription; the customer’s own upload is accepted', async () => {
    if (!db) return;
    const id = (await place()).body.order._id;
    const without = await addItems(id, { items: [{ medicineId: String(rxMed._id), quantity: 1 }] });
    expect(without.status).toBe(400);
    expect(without.body.message).toMatch(/prescription/i);
    const notMine = await addItems(id, { items: [{ medicineId: String(rxMed._id), quantity: 1 }], prescriptionKey: `prescriptions/${other._id}/rx.jpg` });
    expect(notMine.status).toBe(403);
    const ok = await addItems(id, { items: [{ medicineId: String(rxMed._id), quantity: 1 }], prescriptionKey: `prescriptions/${patient._id}/rx-${RUN}.pdf` });
    expect(ok.status).toBe(200);
    expect(ok.body.order.requiresPrescription).toBe(true);
    expect(ok.body.order.prescription.key).toMatch(/\.pdf$/);
  });

  it('refused after the window, once packing starts, on another customer’s order and on paid orders; stock untouched', async () => {
    if (!db) return;
    const late = (await place()).body.order._id;
    await PharmacyOrder.updateOne({ _id: late }, { $set: { 'milestones.placedAt': new Date(Date.now() - 2 * 60 * 1000), createdAt: new Date(Date.now() - 2 * 60 * 1000) } });
    const before = await stock(otc2);
    expect((await addItems(late, { items: [{ medicineId: String(otc2._id), quantity: 1 }] })).status).toBe(409);

    const packing = (await place()).body.order._id;
    expect((await setStatus(packing, 'ACCEPTED')).status).toBe(200);
    expect((await setStatus(packing, 'PREPARING')).status).toBe(200);
    expect((await addItems(packing, { items: [{ medicineId: String(otc2._id), quantity: 1 }] })).status).toBe(409);

    const mine = (await place()).body.order._id;
    expect((await addItems(mine, { items: [{ medicineId: String(otc2._id), quantity: 1 }] }, 'other')).status).toBe(403);

    await PharmacyOrder.updateOne({ _id: mine }, { $set: { paymentMode: 'PREPAID', paymentStatus: 'PAID', 'milestones.paidAt': new Date() } });
    expect((await addItems(mine, { items: [{ medicineId: String(otc2._id), quantity: 1 }] })).status).toBe(409);
    expect(await stock(otc2)).toBe(before);
  });

  it('shows the rider’s name and number while the delivery is live, and hides the number after the drop', async () => {
    if (!db) return;
    expect((await request(app).post('/api/v1/rider/online').set(auth(tokens.rider)).send({ online: true, lat: STORE.lat + 0.5 / 111.2, lng: STORE.lng })).status).toBe(200);
    const id = (await place()).body.order._id;
    for (const s of ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP']) expect((await setStatus(id, s)).status).toBe(200);
    await new Promise((r) => setTimeout(r, 500)); // assignment runs just after the status change
    const live = await request(app).get(`/api/v1/pharmacy/orders/${id}`).set(auth(tokens.patient));
    expect(live.body.order.riderContact).toEqual({ name: 'Ravi Rider', phone: '9876572001' });

    await PharmacyOrder.updateOne({ _id: id }, { $set: { status: 'DELIVERED' } });
    const done = await request(app).get(`/api/v1/pharmacy/orders/${id}`).set(auth(tokens.patient));
    expect(done.body.order.riderContact.name).toBe('Ravi Rider');
    expect(done.body.order.riderContact.phone).toBeUndefined();
  });

  it('customer and store get the prescription as an openable link; others don’t', async () => {
    if (!db) return;
    const id = (await place('patient', {
      items: [{ medicineId: String(rxMed._id), quantity: 1 }], prescriptionKey: `prescriptions/${patient._id}/link-${RUN}.pdf`
    })).body.order._id;
    const mine = await request(app).get(`/api/v1/pharmacy/orders/${id}/prescription/link`).set(auth(tokens.patient));
    expect(mine.status).toBe(200);
    expect(mine.body.data || mine.body).toMatchObject({ kind: 'pdf' });
    const store = await request(app).get(`/api/v1/pharmacy/vendor/orders/${id}/prescription/link`).set(auth(tokens.vendor));
    expect(store.status).toBe(200);
    const body = store.body.data || store.body;
    // Tests use local storage: the app is told to fetch the file route with its sign-in.
    expect(body.needsAuth).toBe(true);
    expect(body.url).toBe(`/api/v1/pharmacy/vendor/orders/${id}/prescription`);
    expect((await request(app).get(`/api/v1/pharmacy/orders/${id}/prescription/link`).set(auth(tokens.other))).status).toBe(403);
  });
});
