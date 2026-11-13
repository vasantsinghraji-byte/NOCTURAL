/**
 * Bot testing, round 2: time zones, rescheduling, pharmacy order lifecycle,
 * tampered quantities, prescription rules, disguised uploads, what the public
 * tracking link reveals, and a nurse double-booked at the same time.
 */

const PharmacyOrder = require('../../models/pharmacyOrder');
const NurseBooking = require('../../models/nurseBooking');
const PharmacyVendor = require('../../models/pharmacyVendor');
const VendorInventory = require('../../models/vendorInventory');
const { createHarness, HOME, ist, bodyOf } = require('./harness');

const h = createHarness('bot2');
const { u, t } = h;

describe('Nabz bots round 2 (real API, real MongoDB)', () => {
  beforeAll(h.setup);
  afterAll(h.teardown);

  it('time-zone bot: a booking from abroad is still at India time', async () => {
    if (!h.db) return;
    const res = await h.book(t.p1, { scheduledDate: ist(2), scheduledTime: '10:00', scheduledTimezone: 'America/New_York', scheduledTimezoneOffsetMinutes: -300 });
    const b = h.bookingOf(res);
    if (!b) { h.note('timezone', 'booking from a US phone works', `${res.status} ${JSON.stringify(res.body).slice(0, 150)}`); return; }
    const stored = await NurseBooking.findById(b._id).lean();
    if (stored.scheduledTimezoneOffsetMinutes !== 330) h.note('timezone', 'visit time is kept in India time (offset 330)', { offset: stored.scheduledTimezoneOffsetMinutes });
    if (stored.scheduledTime !== '10:00') h.note('timezone', 'the time the family picked is kept', { time: stored.scheduledTime });
  });

  it('reschedule bot: slots move with the visit', async () => {
    if (!h.db) return;
    const a = h.bookingOf(await h.book(t.p2, { scheduledDate: ist(3), scheduledTime: '09:00' }));
    const b = h.bookingOf(await h.book(t.p2, { scheduledDate: ist(3), scheduledTime: '12:00' }));
    if (!a || !b) { h.note('reschedule', 'two bookings at different times', 'booking failed'); return; }
    const clash = await h.req().put(`/api/v1/bookings/${b._id}/reschedule`).set(h.auth(t.p2)).send({ scheduledDate: ist(3), scheduledTime: '09:00' });
    h.expectRefused('reschedule', 'moving a visit onto another booked visit', clash);
    const move = await h.req().put(`/api/v1/bookings/${b._id}/reschedule`).set(h.auth(t.p2)).send({ scheduledDate: ist(3), scheduledTime: '15:00' });
    h.expectOk('reschedule', 'moving a visit to a free time', move);
    const reuse = await h.book(t.p2, { scheduledDate: ist(3), scheduledTime: '12:00' });
    if (reuse.status !== 201) h.note('reschedule', 'the old time is free to book after moving', `${reuse.status} ${JSON.stringify(reuse.body).slice(0, 150)}`);
    const past = await h.req().put(`/api/v1/bookings/${a._id}/reschedule`).set(h.auth(t.p2)).send({ scheduledDate: ist(-1), scheduledTime: '09:00' });
    h.expectRefused('reschedule', 'moving a visit into the past', past);
  });

  it('pharmacy bot: order steps out of order, codes and cancellations', async () => {
    if (!h.db) return;
    const res = await h.order(t.p1, u.storeB, 2);
    const order = h.orderOf(res);
    if (!order) { h.note('pharmacy', 'COD order works', `${res.status} ${JSON.stringify(res.body).slice(0, 150)}`); return; }
    const step = (status, extra = {}) => h.req().patch(`/api/v1/pharmacy/vendor/orders/${order._id}/status`).set(h.auth(t.vendorB)).send({ status, ...extra });
    h.expectRefused('pharmacy', 'delivering an order the store has not accepted', await step('DELIVERED', { deliveryCode: '0000' }));
    h.expectRefused('pharmacy', 'sending out an order that is not ready', await step('OUT_FOR_DELIVERY'));
    h.expectOk('pharmacy', 'store accepts the order', await step('ACCEPTED'));
    h.expectOk('pharmacy', 'store prepares the order', await step('PREPARING'));
    h.expectOk('pharmacy', 'order ready', await step('READY_FOR_PICKUP'));
    h.expectOk('pharmacy', 'order out for delivery', await step('OUT_FOR_DELIVERY'));
    const custCancel = await h.req().post(`/api/v1/pharmacy/orders/${order._id}/cancel`).set(h.auth(t.p1)).send({ reason: 'changed mind' });
    h.expectRefused('pharmacy', 'customer cancelling an order already on its way', custCancel);
    h.expectRefused('pharmacy', 'delivering with the wrong code', await step('DELIVERED', { deliveryCode: '99999' }));
    const view = bodyOf(await h.req().get(`/api/v1/pharmacy/orders/${order._id}`).set(h.auth(t.p1)));
    const code = (view.order || view).deliveryOtp?.code;
    if (!code) { h.note('pharmacy', 'customer sees their delivery code', JSON.stringify(view).slice(0, 150)); return; }
    const vendorView = bodyOf(await h.req().get(`/api/v1/pharmacy/vendor/orders/${order._id}`).set(h.auth(t.vendorB)));
    if (JSON.stringify(vendorView).includes(`"code":"${code}"`)) h.note('pharmacy', 'the store never sees the delivery code', 'code visible to store');
    h.expectOk('pharmacy', 'delivering with the right code', await step('DELIVERED', { deliveryCode: code }));
    h.expectRefused('pharmacy', 'delivering twice', await step('DELIVERED', { deliveryCode: code }));
    h.expectRefused('pharmacy', 'customer cancelling a delivered order', await h.req().post(`/api/v1/pharmacy/orders/${order._id}/cancel`).set(h.auth(t.p1)).send({ reason: 'x' }));
    h.expectRefused('pharmacy', 'removing an item after delivery', await h.req().post(`/api/v1/pharmacy/vendor/orders/${order._id}/items/unavailable`).set(h.auth(t.vendorB)).send({ medicineIds: [String(u.med._id)] }));
  });

  it('pharmacy bot: tampered quantities, prices and prescriptions', async () => {
    if (!h.db) return;
    for (const [label, qty] of [['zero units', 0], ['negative units', -3], ['a fraction of a unit', 1.5], ['100,000 units', 100000]]) {
      h.expectRefused('pharmacy-input', `ordering ${label}`, await h.order(t.p2, u.storeA, qty));
    }
    const stock = (await VendorInventory.findOne({ vendor: u.storeA._id, medicine: u.med._id }).lean()).stockQty;
    if (stock < 0) h.note('pharmacy-input', 'stock never negative', stock);
    // Price shown to the customer was lower than the real price.
    const cheap = await h.order(t.p2, u.storeA, 1, { quotedSubtotal: 1 });
    if (cheap.status < 400) {
      const o = h.orderOf(cheap);
      if (o && o.amounts && o.amounts.itemsSubtotal < 25) h.note('pharmacy-input', 'a tampered price is never charged', o.amounts);
    }
    // Prescription medicine without a prescription.
    const rx = await h.req().post('/api/v1/pharmacy/orders').set(h.auth(t.p2)).send({
      vendorId: String(u.storeA._id), items: [{ medicineId: String(u.rxMed._id), quantity: 1 }],
      deliveryAddress: { line1: '1 Test Road', city: 'Jaipur', pincode: '302001', contactPhone: '9876500000' },
      deliveryLocation: { coordinates: [HOME.lng, HOME.lat] }, paymentMode: 'COD'
    });
    h.expectRefused('pharmacy-input', 'ordering a prescription medicine without a prescription', rx);
    // Someone else's prescription file.
    const stolen = await h.req().post('/api/v1/pharmacy/orders').set(h.auth(t.p2)).send({
      vendorId: String(u.storeA._id), items: [{ medicineId: String(u.rxMed._id), quantity: 1 }], prescriptionKey: `prescriptions/${u.p1._id}/2026-01-01/rx-1.pdf`,
      deliveryAddress: { line1: '1 Test Road', city: 'Jaipur', pincode: '302001', contactPhone: '9876500000' },
      deliveryLocation: { coordinates: [HOME.lng, HOME.lat] }, paymentMode: 'COD'
    });
    h.expectRefused('pharmacy-input', 'using another customer’s prescription', stolen);
    // Far away: 60 km from the store.
    const far = await h.order(t.p2, u.storeA, 1, { deliveryLocation: { coordinates: [HOME.lng, HOME.lat + 0.55] } });
    h.expectRefused('pharmacy-input', 'delivery 60 km outside the store’s area', far);
    // A suspended store.
    await PharmacyVendor.updateOne({ _id: u.storeA._id }, { $set: { status: 'SUSPENDED' } });
    h.expectRefused('pharmacy-input', 'ordering from a suspended store', await h.order(t.p2, u.storeA, 1));
    await PharmacyVendor.updateOne({ _id: u.storeA._id }, { $set: { status: 'APPROVED' } });
  });

  it('upload bot: disguised files are refused', async () => {
    if (!h.db) return;
    const text = Buffer.from('this is not a picture, it is a script <script>alert(1)</script>');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    for (const [label, buf, name, type] of [
      ['a text file named .jpg as a profile photo', text, 'me.jpg', 'image/jpeg'],
      ['an SVG with a script as a profile photo', svg, 'me.svg', 'image/svg+xml'],
      ['a PNG header with junk as a profile photo', Buffer.concat([pngHeader, text]), 'me.png', 'image/png']
    ]) {
      const r = await h.req().post('/api/v1/profile-photo').set(h.auth(t.p1)).attach('profilePhoto', buf, { filename: name, contentType: type });
      if (label.includes('PNG header')) { if (r.status >= 500) h.note('upload', `${label} fails cleanly`, `${r.status}`); continue; }
      h.expectRefused('upload', `uploading ${label}`, r);
    }
    const doc = await h.req().post('/api/v1/partners/me/documents').set(h.auth(t.n1)).field('kind', 'POLICE_CHECK').field('expiresAt', `${ist(200)}`)
      .attach('partnerDocument', text, { filename: 'police.pdf', contentType: 'application/pdf' });
    h.expectRefused('upload', 'a text file named .pdf as a police certificate', doc);
    const empty = await h.req().post('/api/v1/partners/me/documents').set(h.auth(t.n1)).field('kind', 'POLICE_CHECK').field('expiresAt', `${ist(200)}`)
      .attach('partnerDocument', Buffer.alloc(0), { filename: 'empty.pdf', contentType: 'application/pdf' });
    h.expectRefused('upload', 'an empty file', empty);
  });

  it('privacy bot: the family tracking link shows only what family needs', async () => {
    if (!h.db) return;
    const b = h.bookingOf(await h.book(t.p1, { scheduledDate: ist(5), scheduledTime: '16:00', serviceLocation: { type: 'HOME', contactPerson: 'Kamla Devi', contactPhone: '9812345678', address: { street: 'Flat 4B, Ashok Marg', city: 'Jaipur', pincode: '302001', coordinates: HOME } } }));
    if (!b) return;
    const tracking = bodyOf(await h.req().get(`/api/v1/bookings/${b._id}/tracking`).set(h.auth(t.p1)));
    const token = tracking.shareToken || tracking.tracking?.shareToken;
    if (!token) { h.note('privacy', 'customer gets a family tracking link', JSON.stringify(tracking).slice(0, 150)); return; }
    const pub = await h.req().get(`/api/v1/care/track/${token}`);
    const text = JSON.stringify(pub.body);
    for (const [label, secret] of [['on-site phone', '9812345678'], ['flat number', 'Flat 4B'], ['customer email', u.p1.email], ['customer phone', u.p1.phone]]) {
      if (text.includes(secret)) h.note('privacy', `the public tracking link hides the ${label}`, 'visible');
    }
    const guess = await h.req().get(`/api/v1/care/track/${'0'.repeat(32)}`);
    if (guess.status !== 404) h.note('privacy', 'a guessed tracking link finds nothing', `${guess.status}`);
  });

  it('overlap bot: one nurse cannot be in two homes at once', async () => {
    if (!h.db) return;
    const x = h.bookingOf(await h.book(t.p1, { scheduledDate: ist(6), scheduledTime: '10:00' }));
    const y = h.bookingOf(await h.book(t.p2, { scheduledDate: ist(6), scheduledTime: '10:30' }));
    if (!x || !y) return;
    const a1 = await h.req().put(`/api/v1/bookings/${x._id}/assign`).set(h.auth(t.admin)).send({ providerId: String(u.n1._id) });
    h.expectOk('overlap', 'admin assigns the first visit', a1);
    const a2 = await h.req().put(`/api/v1/bookings/${y._id}/assign`).set(h.auth(t.admin)).send({ providerId: String(u.n1._id) });
    h.expectRefused('overlap', 'assigning the same nurse to an overlapping visit', a2);
  });

  it('sign-in bot: double-tapping "Sign in" signs in both times', async () => {
    if (!h.db) return;
    const { MOBILE, PASSWORD } = require('./harness');
    const staff = await Promise.all([1, 2, 3].map(() => h.req().post('/api/v1/auth/login').set(MOBILE).send({ email: u.n2.email, password: PASSWORD, portal: 'staff' })));
    staff.forEach((r, i) => { if (r.status !== 200) h.note('sign-in', `nurse sign-in ${i + 1} of 3 at once works`, `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`); });
    const cust = await Promise.all([1, 2, 3].map(() => h.req().post('/api/v1/patients/login').set(MOBILE).send({ email: u.p2.email, password: PASSWORD })));
    cust.forEach((r, i) => { if (r.status !== 200) h.note('sign-in', `customer sign-in ${i + 1} of 3 at once works`, `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`); });
  });

  it('reports every finding', () => {
    expect(h.report()).toEqual([]);
  });
});
