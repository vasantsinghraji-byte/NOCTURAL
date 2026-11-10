/**
 * Discount coupons made in the admin panel and used on medicine orders,
 * nurse visits and Nabz Plus (labs and care plans: nabz-care-marketplace-2):
 * the rules (dates, minimum order, service, limits, first order), a cancelled
 * order giving its use back, the discount coming off the customer's bill
 * only, and the ledger recording what Nabz paid for it.
 * Real app + real MongoDB; skips when MONGODB_URI is unreachable.
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
const SettlementEntry = require('../../models/settlementEntry');
const Coupon = require('../../models/coupon');
const CouponRedemption = require('../../models/couponRedemption');
const pricing = require('../../services/pricingService');
const NurseBooking = require('../../models/nurseBooking');
const ServiceCatalog = require('../../models/serviceCatalog');
const Membership = require('../../models/membership');
const gateway = require('../../utils/razorpayGateway');

const RUN = `cp${Date.now().toString(36)}`;
const TAG = RUN.toUpperCase();
const HOME = { lat: 26.9110, lng: 75.8010 };
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };
const PASSWORD = 'Strong@12345';
const phone = (n) => `9${String(Date.now() + n).slice(-9)}`;
const DAY = 24 * 3600 * 1000;

describe('Discount coupons on medicine orders (real MongoDB)', () => {
  let app;
  let db = false;
  let vendor;
  let medicine;
  const patients = {};
  const tokens = {};
  const coupons = {};
  let ivDrip = null; // catalog entry created here (removed afterwards)
  const auth = (t) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping coupon tests: MongoDB unavailable (${error.message})`);
      return;
    }
    for (const Model of [User, Patient, PharmacyVendor, VendorInventory, PharmacyOrder, Coupon, CouponRedemption, SettlementEntry]) await Model.createIndexes();
    app = require('../../app');

    vendor = await PharmacyVendor.create({
      name: `Coupon Store ${RUN}`, slug: `coupon-store-${RUN}`,
      location: { type: 'Point', coordinates: [HOME.lng, HOME.lat + 0.5 / 111.2] },
      serviceRadiusKm: 5, status: 'APPROVED', isActive: true, isOpen: true, deliveryFee: 25
    });
    const [storeUser, money, other] = await User.create([
      { name: 'Store', email: `store.${RUN}@nabz.test`, password: PASSWORD, phone: phone(1), role: 'pharmacy_vendor', pharmacyVendor: vendor._id, isVerified: true },
      { name: 'Offers Person', email: `offers.${RUN}@nabz.test`, password: PASSWORD, phone: phone(2), role: 'ops_admin', isVerified: true, adminAccess: { sections: ['plans'], partnerKinds: [] } },
      { name: 'Rider Checker', email: `riders.${RUN}@nabz.test`, password: PASSWORD, phone: phone(3), role: 'ops_admin', isVerified: true, adminAccess: { sections: ['partners'], partnerKinds: ['DELIVERY'] } }
    ]);
    vendor.owner = storeUser._id;
    await vendor.save();
    medicine = await Medicine.create({ name: `Cetirizine ${RUN}`, slug: `cetirizine-${RUN}` });
    await VendorInventory.create({ vendor: vendor._id, medicine: medicine._id, mrp: 120, sellingPrice: 100, stockQty: 200 });

    const staff = async (email) => (await request(app).post('/api/v1/auth/login').set(MOBILE).send({ email, password: PASSWORD, portal: 'admin' })).body.tokens.accessToken;
    tokens.money = await staff(money.email);
    tokens.other = await staff(other.email);
    for (const [i, key] of ['a', 'b', 'c'].entries()) {
      patients[key] = await Patient.create({ name: `Buyer ${key}`, email: `${key}.${RUN}@nabz.test`, password: PASSWORD, phone: phone(10 + i) });
      tokens[key] = (await request(app).post('/api/v1/patients/login').set(MOBILE).send({ email: patients[key].email, password: PASSWORD })).body.tokens.accessToken;
    }
  }, 90000); // index builds + five sign-ins can pass 30 s on a busy machine

  afterAll(async () => {
    if (!db) return;
    const orderIds = (await PharmacyOrder.find({ vendor: vendor._id }).select('_id')).map((o) => o._id);
    await Promise.all([
      PharmacyVendor.deleteOne({ _id: vendor._id }),
      User.deleteMany({ email: new RegExp(`${RUN}@nabz\\.test$`) }),
      Patient.deleteMany({ email: new RegExp(`${RUN}@nabz\\.test$`) }),
      Medicine.deleteOne({ _id: medicine._id }),
      VendorInventory.deleteMany({ vendor: vendor._id }),
      PharmacyOrder.deleteMany({ vendor: vendor._id }),
      InventoryMovement.deleteMany({ vendor: vendor._id }),
      SettlementEntry.deleteMany({ 'source.id': { $in: orderIds } }),
      Coupon.deleteMany({ code: new RegExp(`${TAG}$`) }),
      CouponRedemption.deleteMany({ code: new RegExp(`${TAG}$`) }),
      NurseBooking.deleteMany({ patient: { $in: Object.values(patients).map((p) => p._id) } }),
      Membership.deleteMany({ patient: { $in: Object.values(patients).map((p) => p._id) } }),
      ivDrip ? ServiceCatalog.deleteOne({ _id: ivDrip._id }) : Promise.resolve()
    ]);
    jest.restoreAllMocks();
    await mongoose.disconnect();
  });

  const order = (who, couponCode, qty = 3, extra = {}) => request(app).post('/api/v1/pharmacy/orders').set(auth(tokens[who])).send({
    vendorId: String(vendor._id),
    items: [{ medicineId: String(medicine._id), quantity: qty }],
    paymentMode: 'COD',
    deliveryAddress: { line1: 'Ashok Marg', city: 'Jaipur', pincode: '302001' },
    deliveryLocation: { coordinates: [HOME.lng, HOME.lat] },
    ...(couponCode ? { couponCode } : {}),
    ...extra
  });
  const make = (body) => request(app).post('/api/v1/coupons/admin').set(auth(tokens.money)).send({
    startsAt: new Date(Date.now() - DAY).toISOString(), endsAt: new Date(Date.now() + 7 * DAY).toISOString(), ...body
  });

  it('only admins with the plans section manage coupons, and bad values are refused', async () => {
    if (!db) return;
    expect((await request(app).get('/api/v1/coupons/admin').set(auth(tokens.other))).status).toBe(403);
    expect((await request(app).get('/api/v1/coupons/admin').set(auth(tokens.a))).status).toBe(401);
    expect((await make({ code: `P${TAG}`, description: 'Too much', kind: 'PERCENT', value: 150, services: ['PHARMACY'] })).status).toBe(400);
    expect((await make({ code: `E${TAG}`, description: 'Ends first', kind: 'FLAT', value: 10, services: ['PHARMACY'], endsAt: new Date(Date.now() - 2 * DAY).toISOString() })).status).toBe(400);

    const res = await make({ code: `f50${TAG}`.toLowerCase(), description: '₹50 off medicines over ₹200', kind: 'FLAT', value: 50, minOrder: 200, services: ['PHARMACY'], totalLimit: 2, perCustomerLimit: 1 });
    expect(res.status).toBe(201);
    expect(res.body.coupon).toMatchObject({ code: `F50${TAG}`, kind: 'FLAT', value: 50, usedCount: 0 });
    coupons.flat = res.body.coupon;
    expect((await make({ code: `F50${TAG}`, description: 'Duplicate', kind: 'FLAT', value: 5, services: ['PHARMACY'] })).status).toBe(409);
  });

  it('checkout previews the discount and explains why a code does not apply', async () => {
    if (!db) return;
    const check = (code, amount, service = 'PHARMACY') => request(app).post('/api/v1/coupons/check').set(auth(tokens.a)).send({ code, service, amount });
    const short = await check(coupons.flat.code, 150);
    expect(short.status).toBe(400);
    expect(short.body.message).toMatch(/₹50 more/);
    expect((await check(coupons.flat.code, 300, 'LAB')).body.message).toMatch(/medicine orders/);
    expect((await check('NOSUCHCODE', 300)).body.message).toMatch(/not valid/);
    const ok = await check(` ${coupons.flat.code.toLowerCase()} `, 300);
    expect(ok.status).toBe(200);
    expect(ok.body.coupon).toMatchObject({ discount: 50, payable: 250, offer: '₹50 off' });
  });

  it('the discount comes off the bill, the store still earns on the full items, and a code is used once', async () => {
    if (!db) return;
    const res = await order('a', coupons.flat.code);
    expect(res.status).toBe(201);
    const o = res.body.order;
    expect(o.amounts).toMatchObject({ itemsSubtotal: 300, discount: 50 });
    expect(o.amounts.total).toBe(300 + o.amounts.deliveryFee - 50);
    expect(o.coupon).toMatchObject({ code: coupons.flat.code });
    expect((await Coupon.findById(coupons.flat._id)).usedCount).toBe(1);

    const again = await order('a', coupons.flat.code);
    expect(again.status).toBe(400);
    expect(again.body.message).toMatch(/already used/);

    // Delivered: the ledger pays the store on ₹300 and books the ₹50 as Nabz's cost.
    const settlement = require('../../services/settlementService');
    await settlement.recordPharmacyOrder(await PharmacyOrder.findById(o._id));
    const rows = await SettlementEntry.find({ 'source.id': o._id }).lean();
    expect(rows.find((r) => r.type === 'COUPON_DISCOUNT')).toMatchObject({ amount: 50, party: { kind: 'PLATFORM' } });
    expect(rows.find((r) => r.type === 'VENDOR_PAYOUT').basis).toBe(300);
  });

  it('a cancelled order gives its use back; the total limit holds across customers', async () => {
    if (!db) return;
    const first = await PharmacyOrder.findOne({ patient: patients.a._id, 'coupon.code': coupons.flat.code });
    const cancel = await request(app).post(`/api/v1/pharmacy/orders/${first._id}/cancel`).set(auth(tokens.a)).send({ reason: 'Ordered by mistake' });
    expect(cancel.status).toBeLessThan(300);
    expect((await order('a', coupons.flat.code)).status).toBe(201); // usable again

    expect((await order('b', coupons.flat.code)).status).toBe(201); // second and last use
    const late = await order('c', coupons.flat.code);
    expect(late.status).toBeGreaterThanOrEqual(400);
    expect(late.body.message).toMatch(/fully used/);
    expect((await Coupon.findById(coupons.flat._id)).usedCount).toBe(2);
  });

  it('a percent code is capped; first-order codes skip returning customers; split carts are refused', async () => {
    if (!db) return;
    const pct = await make({ code: `PCT${TAG}`, description: '20% off, up to ₹30', kind: 'PERCENT', value: 20, maxDiscount: 30, services: ['PHARMACY'], perCustomerLimit: 5 });
    expect(pct.status).toBe(201);
    const capped = await order('b', pct.body.coupon.code, 3);
    expect(capped.status).toBe(201);
    expect(capped.body.order.amounts.discount).toBe(30);

    const first = await make({ code: `NEW${TAG}`, description: 'First medicine order', kind: 'FLAT', value: 40, services: ['PHARMACY'], firstOrderOnly: true });
    expect(first.status).toBe(201);
    const returning = await order('b', first.body.coupon.code);
    expect(returning.status).toBe(400);
    expect(returning.body.message).toMatch(/first/);
    expect((await order('c', first.body.coupon.code)).status).toBe(201); // c has no orders yet

    const split = await request(app).post('/api/v1/pharmacy/checkouts').set(auth(tokens.c)).send({
      groups: [{ vendorId: String(vendor._id), items: [{ medicineId: String(medicine._id), quantity: 1 }] }, { vendorId: String(new mongoose.Types.ObjectId()), items: [{ medicineId: String(new mongoose.Types.ObjectId()), quantity: 1 }] }],
      deliveryAddress: { line1: 'Ashok Marg', city: 'Jaipur', pincode: '302001' }, couponCode: pct.body.coupon.code
    });
    expect(split.status).toBe(400);
  });

  it('a switched-off code stops working, and the admin list shows uses and discount given', async () => {
    if (!db) return;
    const off = await request(app).put(`/api/v1/coupons/admin/${coupons.flat._id}`).set(auth(tokens.money)).send({ active: false });
    expect(off.status).toBe(200);
    expect((await request(app).post('/api/v1/coupons/check').set(auth(tokens.c)).send({ code: coupons.flat.code, service: 'PHARMACY', amount: 500 })).body.message).toMatch(/not valid/);

    const list = await request(app).get('/api/v1/coupons/admin').set(auth(tokens.money));
    const row = list.body.coupons.find((c) => c.code === coupons.flat.code);
    expect(row).toMatchObject({ status: 'OFF', uses: 2, discountGiven: 100 });
  });

  it('a nurse visit takes the code off the service price; the nurse is still paid on the full price', async () => {
    if (!db) return;
    if (!(await ServiceCatalog.exists({ name: 'IV_DRIP' }))) {
      ivDrip = await ServiceCatalog.create({
        name: 'IV_DRIP', slug: `ivDrip-${RUN}`, category: 'NURSING', displayName: 'IV drip',
        pricing: { basePrice: 400, currency: 'INR' }, availability: { isActive: true, availableCities: ['Jaipur'] }
      });
    }
    const base = (await ServiceCatalog.findOne({ name: 'IV_DRIP' })).pricing.basePrice;
    const code = await make({ code: `NV${TAG}`, description: '₹75 off a nurse visit', kind: 'FLAT', value: 75, services: ['CARE_VISIT'] });
    expect(code.status).toBe(201);
    const ist = new Date(Date.now() + 330 * 60000 + 26 * 3600000);
    const visit = (couponCode) => request(app).post('/api/v1/bookings').set(auth(tokens.c)).send({
      serviceType: 'IV_DRIP', mode: 'SCHEDULED', scheduledDate: ist.toISOString().slice(0, 10), scheduledTime: '11:00',
      scheduledTimezone: 'Asia/Kolkata', scheduledTimezoneOffsetMinutes: 330,
      serviceLocation: { type: 'HOME', address: { street: 'Ashok Marg', city: 'Jaipur', pincode: '302001', coordinates: HOME } },
      patientDetails: { name: `Kamla ${Math.random().toString(36).slice(2, 7)}`, age: 70, gender: 'Female' },
      prescriptionLater: true,
      ...(couponCode ? { couponCode } : {})
    });
    const wrong = await visit(`PCT${TAG}`); // a medicines-only code
    expect(wrong.status).toBe(400);
    expect(wrong.body.message).toMatch(/medicine orders/);
    const res = await visit(code.body.coupon.code);
    expect(res.status).toBe(201);
    const b = await NurseBooking.findById(res.body.booking?._id || res.body.data?._id || res.body._id).lean();
    expect(b.pricing).toMatchObject({ basePrice: base, couponDiscount: 75 });
    expect(b.pricing.payableAmount).toBe(Math.round((b.pricing.totalAmount - 75) * 100) / 100);
    const split = pricing.splitCareBooking(b);
    expect(split.basePrice).toBe(base); // payout basis untouched by the code
  });

  it('Nabz Plus checkout charges the discounted price and books the full fee plus the discount', async () => {
    if (!db) return;
    const code = await make({ code: `PL${TAG}`, description: '₹50 off Nabz Plus', kind: 'FLAT', value: 50, services: ['MEMBERSHIP'] });
    expect(code.status).toBe(201);
    const orders = [];
    jest.spyOn(gateway, 'getClient').mockReturnValue({
      orders: { create: jest.fn(async (o) => { orders.push(o); return { id: `order_pl_${RUN}` }; }) },
      payments: { fetch: jest.fn(async (id) => ({ id, order_id: `order_pl_${RUN}`, currency: 'INR', amount: orders[orders.length - 1].amount, status: 'captured' })) }
    });
    jest.spyOn(gateway, 'verifyPaymentSignature').mockReturnValue(true);
    const plan = (await request(app).get('/api/v1/membership/plans')).body.plans[0];
    const checkout = await request(app).post('/api/v1/membership/checkout').set(auth(tokens.c)).send({ plan: plan.code, couponCode: code.body.coupon.code });
    expect(checkout.status).toBe(201);
    expect(orders[0].amount).toBe((plan.price - 50) * 100);
    const verify = await request(app).post('/api/v1/membership/verify').set(auth(tokens.c))
      .send({ razorpay_order_id: `order_pl_${RUN}`, razorpay_payment_id: `pay_pl_${RUN}`, razorpay_signature: 'sig' });
    expect(verify.status).toBe(200);
    const rows = await SettlementEntry.find({ 'source.id': verify.body.membership._id }).lean();
    expect(rows.find((r) => r.type === 'MEMBERSHIP_FEE').amount).toBe(plan.price);
    expect(rows.find((r) => r.type === 'COUPON_DISCOUNT').amount).toBe(50);
    await SettlementEntry.deleteMany({ 'source.id': verify.body.membership._id });
    jest.restoreAllMocks();
  });

  it('a discount never exceeds the items left after some are removed', () => {
    expect(pricing.pharmacyTotals({ itemsSubtotal: 30, deliveryFee: 25, discount: 50 })).toEqual({ discount: 30, total: 25 });
    expect(pricing.pharmacyTotals({ itemsSubtotal: 300, deliveryFee: 25, discount: 50 })).toEqual({ discount: 50, total: 275 });
  });
});
