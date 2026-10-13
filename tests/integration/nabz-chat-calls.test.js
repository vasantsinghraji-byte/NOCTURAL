/**
 * Chat and in-app voice calls (real MongoDB): only the customer and the
 * provider a booking connects can talk, only while it's active (+24 h after),
 * messages and calls are pushed to the right live channels, the live tokens
 * pass the Lambda authorizer only for their own channels, and the call goes
 * ringing → answered → ended (or declined / missed).
 */
const request = require('supertest');
const mongoose = require('mongoose');
const Patient = require('../../models/patient');
const User = require('../../models/user');
const NurseBooking = require('../../models/nurseBooking');
const PharmacyVendor = require('../../models/pharmacyVendor');
const PharmacyOrder = require('../../models/pharmacyOrder');
const ChatThread = require('../../models/chatThread');
const ChatMessage = require('../../models/chatMessage');

const PASSWORD = 'Strong@12345';
const RUN = Date.now();
const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };
const HOME = { lat: 26.9124, lng: 75.7873 };
const phone = (n) => `7${String(RUN + n).slice(-9)}`;
const SECRET = 'test-realtime-secret-0123456789abcdef0123456789';

describe('Chat and calls (real MongoDB)', () => {
  let app;
  let db = false;
  let realtime;
  let authorizer;
  let published = [];
  const tokens = {};
  const people = {};
  let visit;
  let order;
  let vendor;

  const login = async (path, email, extra = {}) => (await request(app).post(`/api/v1${path}`).set(MOBILE).send({ email, password: PASSWORD, ...extra })).body.tokens?.accessToken;
  const api = (method, path, who, body) => {
    const r = request(app)[method](`/api/v1/chat${path}`).set({ ...MOBILE, Authorization: `Bearer ${tokens[who]}` });
    return body ? r.send(body) : r;
  };
  const booking = (patient, status, extra = {}) => NurseBooking.create({
    patient, serviceProvider: people.nurse._id, serviceType: 'WOUND_DRESSING',
    scheduledDate: new Date(), scheduledTime: '10:00', scheduledTimezone: 'Asia/Kolkata', scheduledTimezoneOffsetMinutes: 330,
    serviceLocation: { type: 'HOME', address: { street: 'Ashok Marg', city: 'Jaipur', pincode: '302001', coordinates: HOME } },
    pricing: { basePrice: 600, platformFee: 90, gst: 124.2, totalAmount: 814.2, payableAmount: 814.2 },
    status, ...extra
  });

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping chat tests: MongoDB unavailable (${error.message})`);
      return;
    }
    // Live delivery "configured", but publishing is captured instead of sent.
    process.env.REALTIME_HTTP_DOMAIN = 'example.appsync-api.ap-south-1.amazonaws.com';
    process.env.REALTIME_WS_DOMAIN = 'example.appsync-realtime-api.ap-south-1.amazonaws.com';
    process.env.REALTIME_TOKEN_SECRET = SECRET;
    process.env.TURN_HOST = '203.0.113.10';
    process.env.TURN_SECRET = 'turn-secret-for-tests';
    process.env.TOKEN_SECRET_FOR_TESTS = SECRET;
    realtime = require('../../services/realtimeService');
    jest.spyOn(realtime, 'publish').mockImplementation(async (channel, events) => { published.push({ channel, events }); return true; });
    authorizer = require('../../infra/realtime-authorizer');

    await Promise.all([Patient, User, NurseBooking, ChatThread, ChatMessage, PharmacyOrder, PharmacyVendor].map((M) => M.createIndexes()));
    app = require('../../app');
    for (const [k, name, i] of [['kamla', 'Kamla Devi', 1], ['stranger', 'Anil Kumar', 2]]) {
      people[k] = await Patient.create({ name, email: `chat${k}.${RUN}@nabz.test`, password: PASSWORD, phone: phone(i) });
      tokens[k] = await login('/patients/login', people[k].email);
    }
    people.nurse = await User.create({ name: 'Sunita Nurse', email: `chatnurse.${RUN}@nabz.test`, password: PASSWORD, phone: phone(3), role: 'nurse', isVerified: true });
    people.vendorOwner = await User.create({ name: 'Store Owner', email: `chatstore.${RUN}@nabz.test`, password: PASSWORD, phone: phone(4), role: 'pharmacy_vendor', isVerified: true });
    tokens.nurse = await login('/auth/login', people.nurse.email, { portal: 'staff' });
    vendor = await PharmacyVendor.create({ name: `Chat Store ${RUN}`, slug: `chat-store-${RUN}`, location: { type: 'Point', coordinates: [HOME.lng, HOME.lat] }, status: 'APPROVED', isActive: true, owner: people.vendorOwner._id });
    await User.updateOne({ _id: people.vendorOwner._id }, { $set: { pharmacyVendor: vendor._id } });
    tokens.store = await login('/auth/login', people.vendorOwner.email, { portal: 'pharmacy' });
    visit = await booking(people.kamla._id, 'CONFIRMED');
    order = await PharmacyOrder.collection.insertOne({
      orderNumber: `CHAT-${RUN}`, patient: people.kamla._id, vendor: vendor._id, status: 'ACCEPTED', items: [],
      amounts: { itemsSubtotal: 100, total: 100 }, paymentMode: 'COD', createdAt: new Date(), updatedAt: new Date()
    });
  }, 90000);

  afterAll(async () => {
    if (!db) return;
    const threads = await ChatThread.find({ patient: { $in: [people.kamla._id, people.stranger._id] } }).select('_id').lean();
    await Promise.all([
      ChatMessage.deleteMany({ thread: { $in: threads.map((t) => t._id) } }),
      ChatThread.deleteMany({ _id: { $in: threads.map((t) => t._id) } }),
      NurseBooking.deleteMany({ patient: { $in: [people.kamla._id, people.stranger._id] } }),
      PharmacyOrder.collection.deleteOne({ _id: order.insertedId }),
      PharmacyVendor.deleteOne({ _id: vendor._id }),
      Patient.deleteMany({ _id: { $in: [people.kamla._id, people.stranger._id] } }),
      User.deleteMany({ _id: { $in: [people.nurse._id, people.vendorOwner._id] } })
    ]);
    jest.restoreAllMocks();
    await mongoose.disconnect();
  });

  let thread;

  it('only the customer and the provider on a booking can open the chat', async () => {
    if (!db) return;
    const res = await api('post', '/threads', 'kamla', { kind: 'CARE', ref: String(visit._id) });
    expect(res.status).toBe(200);
    thread = res.body.thread;
    expect(thread).toMatchObject({ kind: 'CARE', me: 'patient', open: true, with: { name: 'Sunita Nurse' } });
    // The nurse gets the same conversation (one per booking).
    const nurseSide = await api('post', '/threads', 'nurse', { kind: 'CARE', ref: String(visit._id) });
    expect(nurseSide.body.thread).toMatchObject({ _id: thread._id, me: 'provider', with: { name: 'Kamla Devi' } });
    expect((await api('post', '/threads', 'stranger', { kind: 'CARE', ref: String(visit._id) })).status).toBe(404);
    expect((await api('get', `/threads/${thread._id}`, 'stranger')).status).toBe(404);
    // No provider assigned yet → no chat.
    const unassigned = await booking(people.kamla._id, 'REQUESTED');
    await NurseBooking.updateOne({ _id: unassigned._id }, { $unset: { serviceProvider: 1 } });
    expect((await api('post', '/threads', 'kamla', { kind: 'CARE', ref: String(unassigned._id) })).status).toBe(409);
  });

  it('messages are saved, counted as unread, pushed live, and marked read', async () => {
    if (!db) return;
    published = [];
    const sent = await api('post', `/threads/${thread._id}/messages`, 'kamla', { text: 'Please bring extra gauze' });
    expect(sent.status).toBe(201);
    expect(published.map((p) => p.channel)).toEqual(expect.arrayContaining([`/nabz/thread/${thread._id}`, `/nabz/inbox/u-${people.nurse._id}`]));
    expect((await api('get', '/unread', 'nurse')).body.unread).toBe(1);
    const view = await api('get', `/threads/${thread._id}`, 'nurse');
    expect(view.body.messages.map((m) => m.text)).toEqual(['Please bring extra gauze']);
    await api('post', `/threads/${thread._id}/messages`, 'nurse', { text: 'Sure, reaching by 10' });
    expect((await api('post', `/threads/${thread._id}/read`, 'nurse')).status).toBe(200);
    expect((await api('get', '/unread', 'nurse')).body.unread).toBe(0);
    const list = await api('get', '/threads', 'kamla');
    expect(list.body.threads[0]).toMatchObject({ unread: 1, lastMessage: { text: 'Sure, reaching by 10', by: 'provider' } });
    expect((await api('post', `/threads/${thread._id}/messages`, 'kamla', { text: '' })).status).toBe(400);
  });

  it('live tokens open only your own channels (checked by the Lambda authorizer)', async () => {
    if (!db) return;
    const live = (await api('get', `/realtime?thread=${thread._id}`, 'kamla')).body.realtime;
    expect(live).toMatchObject({ enabled: true, realtimeUrl: expect.stringMatching(/^wss:\/\/.+\/event\/realtime$/) });
    const auth = (operation, channel, token = live.token) => authorizer.handler({ authorizationToken: token, requestContext: { operation, channel } });
    expect((await auth('EVENT_CONNECT')).isAuthorized).toBe(true);
    expect((await auth('EVENT_SUBSCRIBE', `/nabz/inbox/p-${people.kamla._id}`)).isAuthorized).toBe(true);
    expect((await auth('EVENT_SUBSCRIBE', `/nabz/thread/${thread._id}`)).isAuthorized).toBe(true);
    expect((await auth('EVENT_SUBSCRIBE', `/nabz/inbox/u-${people.nurse._id}`)).isAuthorized).toBe(false); // someone else's
    expect((await auth('EVENT_SUBSCRIBE', '/nabz/inbox/*')).isAuthorized).toBe(false); // wildcards never
    expect((await auth('EVENT_PUBLISH', `/nabz/thread/${thread._id}`)).isAuthorized).toBe(false); // messages only via the API
    const forged = `${live.token.split('.')[0]}.AAAA`;
    expect((await auth('EVENT_CONNECT', null, forged)).isAuthorized).toBe(false);
  });

  it('a call rings the other person, is answered, and ends with its length', async () => {
    if (!db) return;
    published = [];
    const start = await api('post', `/threads/${thread._id}/calls`, 'kamla');
    expect(start.status).toBe(201);
    const callId = start.body.call._id;
    expect(start.body.call.call.status).toBe('RINGING');
    expect(start.body.iceServers[1]).toMatchObject({ urls: expect.arrayContaining(['turn:203.0.113.10:3478?transport=udp']), username: expect.stringMatching(/^\d+:p-/), credential: expect.any(String) });
    const ring = published.find((p) => p.channel === `/nabz/inbox/u-${people.nurse._id}`);
    expect(ring.events).toMatchObject({ type: 'call.incoming', call: { _id: callId, from: { name: 'Kamla Devi' } } });
    // Signalling channel: both may publish there, nobody else.
    const callChannel = start.body.realtime.channel;
    expect((await authorizer.handler({ authorizationToken: start.body.realtime.token, requestContext: { operation: 'EVENT_PUBLISH', channel: callChannel } })).isAuthorized).toBe(true);
    expect((await api('post', `/threads/${thread._id}/calls`, 'nurse')).status).toBe(409); // already ringing
    expect((await api('post', `/calls/${callId}/accept`, 'kamla')).status).toBe(400); // can't answer your own call
    expect((await api('post', `/calls/${callId}/accept`, 'stranger')).status).toBe(404);
    const answer = await api('post', `/calls/${callId}/accept`, 'nurse');
    expect(answer.status).toBe(200);
    expect(answer.body.call.call.status).toBe('ACTIVE');
    expect((await authorizer.handler({ authorizationToken: answer.body.realtime.token, requestContext: { operation: 'EVENT_SUBSCRIBE', channel: callChannel } })).isAuthorized).toBe(true);
    await ChatMessage.updateOne({ _id: callId }, { $set: { 'call.answeredAt': new Date(Date.now() - 95000) } });
    const end = await api('post', `/calls/${callId}/end`, 'nurse');
    expect(end.body.call.call).toMatchObject({ status: 'ENDED', endedBy: 'provider' });
    expect(end.body.call.call.seconds).toBeGreaterThanOrEqual(94);
    expect(published.filter((p) => p.events.type === 'call.ended').length).toBeGreaterThanOrEqual(2);
  });

  it('a call can be declined, and one nobody answers becomes missed', async () => {
    if (!db) return;
    const a = (await api('post', `/threads/${thread._id}/calls`, 'nurse')).body.call._id;
    expect((await api('post', `/calls/${a}/end`, 'kamla')).body.call.call.status).toBe('DECLINED');
    const b = (await api('post', `/threads/${thread._id}/calls`, 'nurse')).body.call._id;
    await ChatMessage.updateOne({ _id: b }, { $set: { createdAt: new Date(Date.now() - 120000) } });
    expect(await require('../../services/chatService').sweep()).toBeGreaterThanOrEqual(1);
    expect((await ChatMessage.findById(b).lean()).call.status).toBe('MISSED');
    expect((await api('post', `/calls/${b}/accept`, 'kamla')).status).toBe(409);
  });

  it('pharmacy orders connect the customer with the store; chats close with the booking', async () => {
    if (!db) return;
    const shop = await api('post', '/threads', 'store', { kind: 'PHARMACY', ref: String(order.insertedId) });
    expect(shop.status).toBe(200);
    expect(shop.body.thread).toMatchObject({ me: 'provider', open: true, with: { name: 'Kamla Devi' } });
    // Cancelled visit → read-only, no new messages or calls.
    await NurseBooking.updateOne({ _id: visit._id }, { $set: { status: 'CANCELLED' } });
    expect((await api('post', `/threads/${thread._id}/messages`, 'kamla', { text: 'hello?' })).status).toBe(409);
    expect((await api('post', `/threads/${thread._id}/calls`, 'kamla')).status).toBe(409);
    expect((await api('get', `/threads/${thread._id}`, 'kamla')).body.thread.open).toBe(false);
    // Completed today → still open for follow-up; completed 2 days ago → closed.
    await NurseBooking.updateOne({ _id: visit._id }, { $set: { status: 'COMPLETED', 'statusTimestamps.completedAt': new Date() } });
    expect((await api('post', `/threads/${thread._id}/messages`, 'kamla', { text: 'Thank you!' })).status).toBe(201);
    await NurseBooking.updateOne({ _id: visit._id }, { $set: { 'statusTimestamps.completedAt': new Date(Date.now() - 2 * 24 * 3600 * 1000) } });
    expect((await api('post', `/threads/${thread._id}/messages`, 'kamla', { text: 'one more' })).status).toBe(409);
  });
});
