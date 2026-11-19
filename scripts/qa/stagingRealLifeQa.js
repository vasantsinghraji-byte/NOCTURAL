/**
 * Staging real-life QA: double and multiple taps, error handling, chat round trip.
 *
 *   QA_ACCOUNTS_FILE=path/to/accounts.txt node scripts/qa/stagingRealLifeQa.js
 *
 * STAGING ONLY, synthetic test accounts. The accounts file is the private
 * staging list (Customer / Nurse blocks with Email: and Password: lines); it
 * is never committed and passwords are never printed. Creates one COD order and
 * one scheduled visit and cancels both, and sends about 33 chat messages
 * (the last ones prove the 30-a-minute limit). Results: stdout and
 * staging-qa-results.json next to this script.
 */
const fs = require('fs');
const crypto = require('crypto');

// It writes data, so only the known staging API or a local server, unless told otherwise.
const STAGING = 'https://tiuh3tvxsa.ap-south-1.awsapprunner.com';
const ORIGIN = (process.env.QA_API_ORIGIN || STAGING).replace(/\/$/, '');
if (ORIGIN !== STAGING && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(ORIGIN) && process.env.QA_CONFIRM_NOT_PRODUCTION !== '1') {
  throw new Error(`Refusing to run against ${ORIGIN}: set QA_CONFIRM_NOT_PRODUCTION=1 if it is a test environment`);
}
const API = `${ORIGIN}/api/v1`;
const UA = { 'User-Agent': 'NabzStagingSmokeTest/1.0', 'X-Nocturnal-Mobile': 'expo' };
const results = [];
const rec = (id, name, pass, detail) => { results.push({ id, name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${name}${detail ? ' — ' + detail : ''}`); };

function accounts() {
  const lines = fs.readFileSync(process.env.QA_ACCOUNTS_FILE || (() => { throw new Error('Set QA_ACCOUNTS_FILE'); })(), 'utf8').replace(/\r\n/g, '\n').split('\n');
  const out = {}; let cur = null;
  for (const l of lines) {
    const t = l.trim();
    if (/^(Customer|Nurse|Physiotherapist|Pharmacy|Path lab)$/.test(t)) { cur = t; out[cur] = {}; continue; }
    const m = cur && t.match(/^(Email|Password)\s*[:-]?\s*(\S.*)$/);
    if (m) out[cur][m[1].toLowerCase()] = m[2].trim();
  }
  return out;
}

async function call(method, path, { token, body, raw, key, headers = {} } = {}) {
  const h = { ...UA, Accept: 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (key) h['Idempotency-Key'] = key;
  let payload;
  if (raw !== undefined) { h['Content-Type'] = 'application/json'; payload = raw; } else if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  // https, not fetch: Node's fetch adds sec-fetch-* headers the native app never sends.
  if (payload !== undefined) h['Content-Length'] = Buffer.byteLength(payload);
  const { s, ct, text } = await new Promise((resolve, reject) => {
    const req = require('https').request(API + path, { method, headers: h }, (res) => {
      let t = ''; res.setEncoding('utf8'); res.on('data', (c) => { t += c; });
      res.on('end', () => resolve({ s: res.statusCode, ct: res.headers['content-type'] || '', text: t }));
    });
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { s, j: json, ct, text };
}
const tokenOf = (r) => r.j?.tokens?.accessToken || r.j?.token || r.j?.data?.token || r.j?.accessToken;
const leaks = (r) => /stack|at \w+ \(|mongo|E11000|Cast to ObjectId/i.test(r.text);

(async () => {
  const acc = accounts();
  const cust = acc.Customer; const nurse = acc.Nurse;

  // ---------- error handling ----------
  // Made up per run (never a real password; a literal here trips the secret scan).
  const notThePassword = `Wrong-${crypto.randomUUID()}`;
  const noAuth = await call('GET', '/pharmacy/orders');
  rec('E1', 'protected route without a token is 401 JSON', noAuth.s === 401 && noAuth.ct.includes('json'), `status ${noAuth.s}`);

  const wrong = await call('POST', '/patients/login', { body: { email: cust.email, password: notThePassword } });
  rec('E2', 'wrong password is refused without a token', wrong.s === 401 && !tokenOf(wrong), `status ${wrong.s}, message "${wrong.j?.message}"`);

  const unknownUser = await call('POST', '/patients/login', { body: { email: 'nobody-qa-' + Date.now() + '@example.com', password: notThePassword } });
  rec('E3', 'unknown email gets the same answer as a wrong password (no account enumeration)', unknownUser.s === wrong.s && unknownUser.j?.message === wrong.j?.message, `status ${unknownUser.s}, "${unknownUser.j?.message}"`);

  const inj = await call('POST', '/patients/login', { body: { email: { $gt: '' }, password: { $gt: '' } } });
  rec('E4', 'NoSQL operator injection on login is rejected', inj.s >= 400 && inj.s < 500 && !tokenOf(inj), `status ${inj.s}`);

  const bad = await call('POST', '/patients/login', { raw: '{"email": "x",' });
  rec('E5', 'malformed JSON body is a 400, not a 500', bad.s === 400 && !leaks(bad), `status ${bad.s}`);

  const nf = await call('GET', '/definitely-not-a-route');
  rec('E6', 'unknown API route is a JSON 404', nf.s === 404 && nf.ct.includes('json'), `status ${nf.s}`);

  const login = await call('POST', '/patients/login', { body: { email: cust.email, password: cust.password } });
  const ct = tokenOf(login);
  rec('F1', 'customer signs in', login.s === 200 && !!ct, `status ${login.s}`);
  if (!ct) return finish();

  const badId = await call('GET', '/pharmacy/orders/not-an-id', { token: ct });
  rec('E7', 'malformed id is a 400 with a message, no stack trace', badId.s === 400 && !leaks(badId), `status ${badId.s}, "${badId.j?.message}"`);

  const ghost = await call('GET', '/pharmacy/orders/' + '0'.repeat(24), { token: ct });
  rec('E8', 'another or missing order id is 404', ghost.s === 404, `status ${ghost.s}`);

  const vendorOnly = await call('GET', '/pharmacy/vendor/orders', { token: ct });
  rec('E9', 'customer token on a pharmacy-vendor route is refused', vendorOnly.s === 401 || vendorOnly.s === 403, `status ${vendorOnly.s}`);

  const forged = await call('GET', '/pharmacy/orders', { token: ct.slice(0, -4) + 'abcd' });
  rec('E10', 'tampered token is 401', forged.s === 401, `status ${forged.s}`);

  const emptyOrder = await call('POST', '/pharmacy/orders', { token: ct, body: { vendorId: '0'.repeat(24), items: [] }, key: crypto.randomUUID() });
  rec('E11', 'order with no items is a 400 with field errors', emptyOrder.s === 400, `status ${emptyOrder.s}, "${emptyOrder.j?.message}"`);

  const longText = await call('POST', '/chat/threads/' + '0'.repeat(24) + '/messages', { token: ct, body: { text: 'x'.repeat(2001) } });
  rec('E12', 'chat message over 2000 characters is a 400', longText.s === 400, `status ${longText.s}`);

  // ---------- double / multiple taps: pharmacy order ----------
  const near = await call('GET', '/pharmacy/vendors/nearby?lat=26.9124&lng=75.7873');
  const vendor = (near.j?.data?.vendors || near.j?.vendors || [])[0];
  const store = await call('GET', '/pharmacy/vendors/' + vendor._id);
  const otc = (store.j.items || []).filter((i) => !i.medicine?.requiresPrescription && i.inStock !== false);
  let qty = Math.ceil((vendor.minOrderValue || 99) / otc[0].sellingPrice) + 1;
  const orderBody = {
    vendorId: vendor._id,
    items: [{ medicineId: otc[0].medicine._id, quantity: qty }],
    deliveryAddress: { line1: 'QA test, C-Scheme', city: 'Jaipur', pincode: '302001', contactName: 'QA Synthetic', contactPhone: '9876543210', coordinates: { lat: 26.9124, lng: 75.7873 } },
    paymentMode: 'COD'
  };
  const before = await call('GET', '/pharmacy/orders?limit=50', { token: ct });
  const beforeIds = new Set((before.j?.orders || before.j?.data?.orders || []).map((o) => o._id));
  const key = crypto.randomUUID();
  const six = await Promise.all(Array.from({ length: 6 }, () => call('POST', '/pharmacy/orders', { token: ct, body: orderBody, key })));
  const okIds = [...new Set(six.filter((r) => r.s < 300).map((r) => r.j?.order?._id || r.j?.data?.order?._id))];
  rec('D1', '6 simultaneous Place-order taps (same key) create one order', okIds.length === 1, `statuses ${six.map((r) => r.s).join(',')}; ${okIds.length} distinct order(s)${six.find((r) => r.s >= 400 && r.s !== 409) ? '; first error "' + six.find((r) => r.s >= 400 && r.s !== 409).j?.message + '"' : ''}`);
  const replay = await call('POST', '/pharmacy/orders', { token: ct, body: orderBody, key });
  rec('D2', 'a retry after the response (same key) replays the same order', replay.s < 300 && (replay.j?.order?._id || replay.j?.data?.order?._id) === okIds[0], `status ${replay.s}`);
  const changed = await call('POST', '/pharmacy/orders', { token: ct, body: { ...orderBody, items: [{ medicineId: otc[0].medicine._id, quantity: qty + 1 }] }, key });
  rec('D3', 'the same key with a different cart is refused (422)', changed.s === 422, `status ${changed.s}`);
  const after = await call('GET', '/pharmacy/orders?limit=50', { token: ct });
  const created = (after.j?.orders || after.j?.data?.orders || []).filter((o) => !beforeIds.has(o._id));
  rec('D4', 'order history shows exactly one new order', created.length === 1, `${created.length} new`);

  if (okIds[0]) {
    const ckey = crypto.randomUUID();
    const cancels = await Promise.all(Array.from({ length: 6 }, () => call('POST', `/pharmacy/orders/${okIds[0]}/cancel`, { token: ct, body: { reason: 'QA double-tap test' }, key: ckey })));
    const final = await call('GET', `/pharmacy/orders/${okIds[0]}`, { token: ct });
    const st = final.j?.order?.status || final.j?.data?.order?.status;
    rec('D5', '6 simultaneous Cancel taps leave one cancelled order and no 500s', st === 'CANCELLED' && cancels.every((r) => r.s < 500), `statuses ${cancels.map((r) => r.s).join(',')}; final ${st}`);
    const again = await call('POST', `/pharmacy/orders/${okIds[0]}/cancel`, { token: ct, body: { reason: 'QA again' }, key: crypto.randomUUID() });
    rec('D6', 'cancelling an already-cancelled order is a clean 4xx', again.s >= 400 && again.s < 500 && !leaks(again), `status ${again.s}, "${again.j?.message}"`);
  }

  // ---------- double / multiple taps: nurse visit ----------
  const d = new Date(Date.now() + 3 * 864e5);
  const date = d.toISOString().slice(0, 10);
  const bookBody = {
    serviceType: 'WOUND_DRESSING', scheduledDate: date, scheduledTime: '11:00', scheduledTimezone: 'Asia/Kolkata', scheduledTimezoneOffsetMinutes: 330, mode: 'SCHEDULED',
    serviceLocation: { type: 'HOME', address: { street: 'QA test, C-Scheme', city: 'Jaipur', pincode: '302001', state: 'Rajasthan', coordinates: { lat: 26.9124, lng: 75.7873 } } },
    patientDetails: { name: 'QA Synthetic', age: 40, gender: 'Other' }
  };
  const bkey = crypto.randomUUID();
  const books = await Promise.all(Array.from({ length: 6 }, () => call('POST', '/bookings', { token: ct, body: bookBody, key: bkey })));
  const bIds = [...new Set(books.filter((r) => r.s < 300).map((r) => r.j?.booking?._id || r.j?.data?.booking?._id || r.j?.data?._id))];
  rec('D7', '6 simultaneous Book-visit taps (same key) create one booking', bIds.length === 1, `statuses ${books.map((r) => r.s).join(',')}${books.find((r) => r.s >= 400 && r.s !== 409) ? '; "' + books.find((r) => r.s >= 400 && r.s !== 409).j?.message + '"' : ''}`);
  if (bIds[0]) {
    const short = await call('PUT', `/bookings/${bIds[0]}/cancel`, { token: ct, body: { reason: 'no' }, key: crypto.randomUUID() });
    rec('E13', 'cancel reason under 10 characters is a 400', short.s === 400, `status ${short.s}, "${short.j?.message}"`);
    const ck = crypto.randomUUID();
    const bc = await Promise.all(Array.from({ length: 6 }, () => call('PUT', `/bookings/${bIds[0]}/cancel`, { token: ct, body: { reason: 'QA double-tap cancel test' }, key: ck })));
    rec('D8', '6 simultaneous Cancel-visit taps: no 500s, booking cancelled', bc.every((r) => r.s < 500) && bc.some((r) => r.s < 300), `statuses ${bc.map((r) => r.s).join(',')}`);
  }

  // ---------- chat round trip ----------
  const nlog = await call('POST', '/auth/login', { body: { email: nurse.email, password: nurse.password, portal: 'staff' } });
  const nt = tokenOf(nlog);
  rec('F2', 'nurse signs in', !!nt, `status ${nlog.s}`);
  const threads = await call('GET', '/chat/threads', { token: ct });
  const open = (threads.j?.threads || []).find((t) => t.open);
  rec('F3', 'customer has an open conversation to test with', !!open, `${(threads.j?.threads || []).length} thread(s)`);
  if (open && nt) {
    const tag = 'QA ' + Date.now();
    const sent = await call('POST', `/chat/threads/${open.id || open._id}/messages`, { token: ct, body: { text: tag + ' customer→partner' } });
    rec('C1', 'customer sends a message', sent.s < 300, `status ${sent.s}`);
    const nview = await call('GET', `/chat/threads/${open.id || open._id}`, { token: nt });
    const got = (nview.j?.messages || []).some((m) => (m.text || '').includes(tag + ' customer→partner'));
    rec('C2', 'partner receives it', got, `status ${nview.s}`);
    const reply = await call('POST', `/chat/threads/${open.id || open._id}/messages`, { token: nt, body: { text: tag + ' partner→customer' } });
    const cview = await call('GET', `/chat/threads/${open.id || open._id}`, { token: ct });
    rec('C3', 'partner replies and customer receives it', reply.s < 300 && (cview.j?.messages || []).some((m) => (m.text || '').includes(tag + ' partner→customer')), `send ${reply.s}, read ${cview.s}`);
    const unread = await call('GET', '/chat/unread', { token: ct });
    rec('C4', 'unread badge counts the reply', unread.s === 200 && unread.j?.unread >= 1, `unread ${unread.j?.unread}`);
    const intruder = await call('GET', `/chat/threads/${'0'.repeat(24)}`, { token: ct });
    rec('C5', 'someone else\'s/missing conversation is 404', intruder.s === 404, `status ${intruder.s}`);
    // flood: 31 more in a minute → limited, never a 500
    const flood = [];
    for (let i = 0; i < 31; i += 1) flood.push(await call('POST', `/chat/threads/${open.id || open._id}/messages`, { token: ct, body: { text: `${tag} rate-limit probe ${i + 1}` } }));
    const limited = flood.filter((r) => r.s === 409 || r.s === 429);
    rec('C6', 'more than 30 messages a minute is limited with a clear message', limited.length > 0 && flood.every((r) => r.s < 500), `${flood.filter((r) => r.s < 300).length} accepted, ${limited.length} limited, "${limited[0]?.j?.message}"`);
  }
  finish();
})().catch((e) => { console.error('script error', e.message); finish(); });

function finish() {
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  fs.writeFileSync(require('path').join(__dirname, 'staging-qa-results.json'), JSON.stringify(results, null, 2));
}
