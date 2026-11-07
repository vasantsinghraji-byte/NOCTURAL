/**
 * Quick-commerce dispatch (real MongoDB):
 *   just in time   a rider is lined up while the store packs, but only sent
 *                  once their ride takes about as long as the packing left
 *   safety         no pickup before the store marks it ready; a cancelled
 *                  order frees its rider and tells them
 *   heat map       orders waiting vs free riders per ~1 km cell; riders see
 *                  the busy areas near them
 *   auto surge     a zone's stress rises when orders pile up and riders are
 *                  short, and never overrides a level ops set by hand
 *   learned ETA    each store's real packing time replaces its own guess
 */
const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../models/user');
const Patient = require('../../models/patient');
const Medicine = require('../../models/medicine');
const PharmacyVendor = require('../../models/pharmacyVendor');
const VendorInventory = require('../../models/vendorInventory');
const PharmacyOrder = require('../../models/pharmacyOrder');
const ServiceZone = require('../../models/serviceZone');
const SettlementEntry = require('../../models/settlementEntry');
const InventoryMovement = require('../../models/inventoryMovement');
const MedicineRefill = require('../../models/medicineRefill');
const Notification = require('../../models/notification');

const RUN = Date.now();
const PASSWORD = 'Strong@12345';
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };
// Away from the other suites' Jaipur stores so zones and riders don't mix.
const STORE = { lat: 23.0225, lng: 72.5714 };
const north = (km) => STORE.lat + km / 111.2;

describe('Dispatch: just in time, heat map, auto surge, learned ETA (real MongoDB)', () => {
  let app;
  let db = false;
  let vendor;
  let vendorUser;
  let patient;
  let medicine;
  let zone;
  let rider;
  let heatmapService;
  let riderService;
  const tokens = {};
  const orders = {};

  const login = async (path, email, extra = {}) => (await request(app).post(`/api/v1${path}`).set(MOBILE).send({ email, password: PASSWORD, ...extra })).body.tokens?.accessToken;
  const auth = (t) => ({ ...MOBILE, Authorization: `Bearer ${t}` });
  const settle = () => new Promise((r) => setTimeout(r, 400));
  const place = async (dropKm) => {
    const r = await request(app).post('/api/v1/pharmacy/orders').set(auth(tokens.patient)).send({
      vendorId: String(vendor._id), items: [{ medicineId: String(medicine._id), quantity: 1 }], paymentMode: 'COD',
      deliveryAddress: { line1: 'CG Road', city: 'Ahmedabad', pincode: '380009' }, deliveryLocation: { coordinates: [STORE.lng, north(dropKm)] }
    });
    expect(r.status).toBe(201);
    return r.body.order;
  };
  const moveTo = async (id, status) => {
    const r = await request(app).patch(`/api/v1/pharmacy/vendor/orders/${id}/status`).set(auth(tokens.vendor)).send({ status });
    expect(r.status).toBe(200);
    await settle();
  };

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping dispatch tests: MongoDB unavailable (${error.message})`);
      return;
    }
    for (const M of [PharmacyVendor, VendorInventory, PharmacyOrder, Patient, SettlementEntry, User, ServiceZone]) await M.createIndexes();
    app = require('../../app');
    heatmapService = require('../../services/heatmapService');
    riderService = require('../../services/riderService');
    const d = 0.05; // ~5 km box around the store
    zone = await ServiceZone.create({
      code: `AHM-${String(RUN).slice(-6)}`, name: 'Navrangpura test', city: 'Ahmedabad',
      boundary: { type: 'Polygon', coordinates: [[[STORE.lng - d, STORE.lat - d], [STORE.lng + d, STORE.lat - d], [STORE.lng + d, STORE.lat + d], [STORE.lng - d, STORE.lat + d], [STORE.lng - d, STORE.lat - d]]] }
    });
    vendor = await PharmacyVendor.create({
      name: `JIT Store ${RUN}`, slug: `jit-store-${RUN}`, location: { type: 'Point', coordinates: [STORE.lng, STORE.lat] },
      serviceRadiusKm: 6, status: 'APPROVED', isActive: true, isOpen: true, deliveryFee: 25, avgPreparationMinutes: 20, zone: zone._id
    });
    vendorUser = await User.create({ name: 'Store', email: `jstore.${RUN}@nabz.test`, password: PASSWORD, phone: '9876571001', role: 'pharmacy_vendor', pharmacyVendor: vendor._id, isVerified: true });
    vendor.owner = vendorUser._id;
    await vendor.save();
    medicine = await Medicine.create({ name: `Cetirizine J${RUN}`, slug: `cetirizine-j-${RUN}` });
    await VendorInventory.create({ vendor: vendor._id, medicine: medicine._id, mrp: 150, sellingPrice: 140, stockQty: 50 });
    patient = await Patient.create({ name: 'Meera', email: `jp.${RUN}@nabz.test`, password: PASSWORD, phone: `94${String(RUN).slice(-8)}` });
    tokens.patient = await login('/patients/login', patient.email);
    tokens.vendor = await login('/auth/login', vendorUser.email, { portal: 'pharmacy' });
    rider = await User.create({ name: 'Rider Kiran', email: `jrider.${RUN}@nabz.test`, password: PASSWORD, phone: `98765730${String(RUN).slice(-2)}`, role: 'delivery_partner', isVerified: true });
    tokens.rider = await login('/auth/login', rider.email, { portal: 'rider' });
    const on = await request(app).post('/api/v1/rider/online').set(auth(tokens.rider)).send({ online: true, lat: north(0.5), lng: STORE.lng });
    expect(on.status).toBe(200);
  }, 90000);

  afterAll(async () => {
    if (!db) return;
    const ids = (await PharmacyOrder.find({ vendor: vendor._id }).select('_id')).map((o) => o._id);
    await Promise.all([
      PharmacyOrder.deleteMany({ vendor: vendor._id }),
      MedicineRefill.deleteMany({ patient: patient._id }),
      Notification.deleteMany({ user: { $in: [patient._id, rider._id] } }),
      SettlementEntry.deleteMany({ 'source.id': { $in: ids } }),
      VendorInventory.deleteMany({ vendor: vendor._id }),
      InventoryMovement.deleteMany({ vendor: vendor._id }),
      Medicine.deleteOne({ _id: medicine._id }),
      PharmacyVendor.deleteOne({ _id: vendor._id }),
      ServiceZone.deleteOne({ _id: zone._id }),
      Patient.deleteOne({ _id: patient._id }),
      User.deleteMany({ _id: { $in: [vendorUser._id, rider._id] } })
    ]);
    await mongoose.disconnect();
  });

  it('accepted with 20 minutes of packing left: the rider 3 minutes away is not sent yet', async () => {
    if (!db) return;
    orders.a = await place(2);
    expect(String(orders.a.zone)).toBe(String(zone._id));
    await moveTo(orders.a._id, 'ACCEPTED');
    expect((await PharmacyOrder.findById(orders.a._id).lean()).rider).toBeFalsy();
    const r = await riderService.assign(orders.a._id);
    expect(r).toMatchObject({ deferred: true, riderId: String(rider._id) });
    expect(r.remainingPrepMinutes).toBeGreaterThan(15);
  });

  it('once packing is nearly done, the tick sends the rider (timed to arrive as it is packed)', async () => {
    if (!db) return;
    await moveTo(orders.a._id, 'PREPARING');
    // 18 of the 20 packing minutes have gone by.
    await PharmacyOrder.updateOne({ _id: orders.a._id }, { $set: { 'milestones.acceptedAt': new Date(Date.now() - 18 * 60000) } });
    const swept = await riderService.sweep();
    expect(swept.assigned).toBeGreaterThanOrEqual(1);
    const a = await PharmacyOrder.findById(orders.a._id).lean();
    expect(String(a.rider)).toBe(String(rider._id));
    expect(a.status).toBe('PREPARING');
    const jobs = await request(app).get('/api/v1/rider/jobs').set(auth(tokens.rider));
    expect(jobs.body.batches[0].drops[0]).toMatchObject({ orderStatus: 'PREPARING', readyForPickup: false });
  });

  it('the rider can’t pick up before the store marks it ready; afterwards they can', async () => {
    if (!db) return;
    const early = await request(app).post(`/api/v1/rider/jobs/${orders.a._id}/picked-up`).set(auth(tokens.rider)).send({});
    expect(early.status).toBe(409);
    expect(early.body.message || early.body.error).toMatch(/still packing/i);
    await moveTo(orders.a._id, 'READY_FOR_PICKUP');
    const ok = await request(app).post(`/api/v1/rider/jobs/${orders.a._id}/picked-up`).set(auth(tokens.rider)).send({});
    expect(ok.status).toBe(200);
  });

  it('an order cancelled while its rider heads to the store frees the rider and tells them', async () => {
    if (!db) return;
    orders.b = await place(1.5);
    await moveTo(orders.b._id, 'ACCEPTED');
    await PharmacyOrder.updateOne({ _id: orders.b._id }, { $set: { 'milestones.acceptedAt': new Date(Date.now() - 19 * 60000) } });
    // The rider still carries order A, so put them on B directly (as a batch would).
    await PharmacyOrder.updateOne({ _id: orders.b._id }, { $set: { rider: rider._id, deliveryStatus: 'ASSIGNED' } });
    await moveTo(orders.b._id, 'CANCELLED');
    const swept = await riderService.sweep();
    expect(swept.freed).toBeGreaterThanOrEqual(1);
    expect((await PharmacyOrder.findById(orders.b._id).lean()).deliveryStatus).toBe('CANCELLED');
    const jobs = await request(app).get('/api/v1/rider/jobs').set(auth(tokens.rider));
    const listed = jobs.body.batches.flatMap((b) => b.drops.map((x) => String(x.orderId)));
    expect(listed).not.toContain(String(orders.b._id));
    expect(await Notification.countDocuments({ user: rider._id, title: 'Pickup cancelled' })).toBe(1);
  });

  it('heat map: waiting orders show up as a hot cell; the rider sees it as a busy area', async () => {
    if (!db) return;
    orders.c = await place(3);
    orders.d = await place(3.05);
    orders.e = await place(3.1);
    const map = await heatmapService.heatmap({ layer: 'pharmacy' });
    const hot = map.cells.find((c) => c.demand >= 3 && Math.abs(c.lat - north(3)) < 0.01 && Math.abs(c.lng - STORE.lng) < 0.01);
    expect(hot).toBeTruthy();
    expect(hot.heat).toBeGreaterThan(0);
    const busy = await request(app).get('/api/v1/rider/busy-areas').set(auth(tokens.rider));
    expect(busy.status).toBe(200);
    expect(busy.body.layer).toBe('pharmacy');
    expect(busy.body.areas.length).toBeGreaterThanOrEqual(1);
    expect(busy.body.areas[0]).toEqual(expect.objectContaining({ heat: expect.any(Number), distanceKm: expect.any(Number) }));
    expect(JSON.stringify(busy.body)).not.toMatch(/CG Road|Meera|orderNumber/); // cells only, no customer data
  });

  it('auto surge: orders piling up with no free rider raises the zone, and it never overrides ops', async () => {
    if (!db) return;
    // Our rider is busy with order A, so no one in the zone is free.
    const first = await heatmapService.autoSurge();
    expect(first.changed).toBeGreaterThanOrEqual(1);
    let z = await ServiceZone.findById(zone._id).lean();
    expect(z.stress).toMatchObject({ level: 'SEVERE', auto: true });
    expect(z.stress.reason).toMatch(/orders waiting/);
    expect(new Date(z.stress.until).getTime()).toBeGreaterThan(Date.now());

    // Ops set HIGH by hand for an hour: the automatic surge leaves it alone.
    await require('../../services/pharmacyAdminService').updateZone(zone._id, { stress: { level: 'HIGH', reason: 'Heavy rain', until: new Date(Date.now() + 3600000) } }, vendorUser._id);
    await heatmapService.autoSurge();
    z = await ServiceZone.findById(zone._id).lean();
    expect(z.stress).toMatchObject({ level: 'HIGH', reason: 'Heavy rain', auto: false });

    const zones = await heatmapService.zonesSummary();
    expect(zones.find((x) => String(x.id) === String(zone._id)).stress).toMatchObject({ level: 'HIGH', auto: false });
    await require('../../services/pharmacyAdminService').updateZone(zone._id, { stress: { level: 'NORMAL' } }, vendorUser._id);
  });

  it('learned ETA: the store’s real packing time replaces its own 20-minute guess', async () => {
    if (!db) return;
    const now = Date.now();
    const base = await PharmacyOrder.findById(orders.c._id).lean();
    const done = [6, 7, 8, 9, 10].map((min, i) => {
      return {
        ...base, _id: new mongoose.Types.ObjectId(), orderNumber: `${base.orderNumber}-L${i}`, status: 'DELIVERED',
        milestones: { acceptedAt: new Date(now - 3600000), readyAt: new Date(now - 3600000 + min * 60000), deliveredAt: new Date(now - 1800000) }
      };
    });
    await PharmacyOrder.collection.insertMany(done);
    const learned = await heatmapService.learnEta({ force: true });
    expect(learned.stores).toBeGreaterThanOrEqual(1);
    const v = await PharmacyVendor.findById(vendor._id).lean();
    expect(v.learned).toMatchObject({ prepMinutes: 8, prepSamples: 5 });
    const eta = require('../../services/serviceabilityService').estimateEta(v, 2);
    expect(eta.prepMinutes).toBe(8);
  });
});
