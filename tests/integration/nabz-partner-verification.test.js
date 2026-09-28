/**
 * Partner verification: document checklist per partner type, masked Aadhaar
 * only, admin review keeps the go-online badges in step, renewals don't take
 * anyone offline, expiry does, pharmacies lose their store with the licence,
 * DigiLocker Aadhaar (state is one-use, name must match), two-person rule.
 */
const mongoose = require('mongoose');
const User = require('../../models/user');
const PharmacyVendor = require('../../models/pharmacyVendor');
const PartnerDocument = require('../../models/partnerDocument');
const DigilockerSession = require('../../models/digilockerSession');

const RUN = Date.now();
const DAY = 86400000;
const file = (n = 1) => ({ key: `partner-documents/test/${RUN}-${n}.pdf`, mimeType: 'application/pdf', size: 1000, originalName: 'doc.pdf' });
const inDays = (d) => new Date(Date.now() + d * DAY).toISOString();

describe('DigiLocker helpers (no DB)', () => {
  const dl = require('../../services/digilockerService');
  const { namesMatch } = require('../../services/partnerVerificationService');
  it('reads name, DOB and the last 4 digits from eAadhaar, nothing more', () => {
    const xml = '<Certificate><CertificateData><KycRes><UidData uid="xxxxxxxx4821"><Poi name="Asha Kumari Sharma" dob="12-03-1994" gender="F"/><Pht>BASE64</Pht></UidData></KycRes></CertificateData></Certificate>';
    expect(dl.parseEaadhaar(xml)).toEqual({ name: 'Asha Kumari Sharma', dob: '12-03-1994', gender: 'F', last4: '4821' });
  });
  it('matches names leniently but not different people', () => {
    expect(namesMatch('Asha Sharma', 'Asha Kumari Sharma')).toBe(true);
    expect(namesMatch('ASHA  sharma', 'asha sharma')).toBe(true);
    expect(namesMatch('Asha Sharma', 'Rekha Verma')).toBe(false);
  });
});

describe('Partner verification (real MongoDB)', () => {
  let db = false;
  let nurse;
  let admin;
  let admin2;
  let vendorUser;
  let store;
  const svc = () => require('../../services/partnerVerificationService');

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping verification tests: MongoDB unavailable (${error.message})`);
      return;
    }
    await DigilockerSession.createIndexes();
    [nurse, admin, admin2] = await User.create([
      { name: 'Asha Sharma', email: `v.nurse.${RUN}@nabz.test`, password: 'Strong@12345', phone: '9876509001', role: 'nurse', isVerified: true, isOnline: true },
      { name: 'Ops One', email: `v.ops1.${RUN}@nabz.test`, password: 'Strong@12345', phone: '9876509002', role: 'platform_admin', isVerified: true },
      { name: 'Ops Two', email: `v.ops2.${RUN}@nabz.test`, password: 'Strong@12345', phone: '9876509003', role: 'platform_admin', isVerified: true }
    ]);
    store = await PharmacyVendor.collection.insertOne({ name: `Store ${RUN}`, status: 'APPROVED', isOpen: true, isActive: true, createdAt: new Date() });
    vendorUser = await User.create({ name: 'Store Owner', email: `v.store.${RUN}@nabz.test`, password: 'Strong@12345', phone: '9876509004', role: 'pharmacy_vendor', isVerified: true, pharmacyVendor: store.insertedId });
  });

  afterAll(async () => {
    if (!db) return;
    delete process.env.VERIFICATION_TWO_PERSON;
    for (const k of ['DIGILOCKER_CLIENT_ID', 'DIGILOCKER_CLIENT_SECRET', 'DIGILOCKER_REDIRECT_URI']) delete process.env[k];
    await PartnerDocument.deleteMany({ user: { $in: [nurse._id, vendorUser._id] } });
    await DigilockerSession.deleteMany({ user: nurse._id });
    await PharmacyVendor.collection.deleteOne({ _id: store.insertedId });
    await User.deleteMany({ _id: { $in: [nurse._id, admin._id, admin2._id, vendorUser._id] } });
    await mongoose.disconnect();
  });

  it('lists the documents each partner type needs', async () => {
    if (!db) return;
    const status = await svc().getStatus(nurse._id);
    expect(status.items.map((i) => i.kind)).toEqual(['AADHAAR', 'NURSING_REGISTRATION', 'NURSING_QUALIFICATION', 'POLICE_CHECK', 'VACCINATION']);
    expect(status).toMatchObject({ complete: false, missing: 4, digilocker: { available: false } });
    expect(svc().requirementsFor('pharmacy_vendor')).toContain('DRUG_LICENCE');
    expect(svc().requirementsFor('delivery_partner')).toEqual(['AADHAAR', 'DRIVING_LICENCE', 'VEHICLE_RC', 'POLICE_CHECK']);
  });

  it('never takes a full Aadhaar number and needs expiry dates for licences', async () => {
    if (!db) return;
    await expect(svc().submitDocument(nurse._id, { kind: 'AADHAAR', number: '1234 5678 4821' }, file())).rejects.toThrow(/last 4 digits/);
    await expect(svc().submitDocument(nurse._id, { kind: 'AADHAAR', number: '4821' }, null)).rejects.toThrow(/Attach/);
    await expect(svc().submitDocument(nurse._id, { kind: 'NURSING_REGISTRATION', number: 'RNC-1' }, file())).rejects.toThrow(/expires/);
    await expect(svc().submitDocument(nurse._id, { kind: 'NURSING_REGISTRATION', number: 'RNC-1', expiresAt: inDays(-1) }, file())).rejects.toThrow(/already expired/);
    await expect(svc().submitDocument(nurse._id, { kind: 'DRUG_LICENCE', number: 'X', expiresAt: inDays(100) }, file())).rejects.toThrow(/isn’t needed/);
    const doc = await svc().submitDocument(nurse._id, { kind: 'AADHAAR', number: '4821' }, file());
    expect(doc).toMatchObject({ kind: 'AADHAAR', status: 'PENDING', number: '4821' });
  });

  it('approving documents turns the badges on; rejecting needs a reason', async () => {
    if (!db) return;
    const aadhaar = await PartnerDocument.findOne({ user: nurse._id, kind: 'AADHAAR', superseded: false });
    await expect(svc().review(aadhaar._id, admin._id, { decision: 'REJECTED' })).rejects.toThrow(/why/);
    await svc().review(aadhaar._id, admin._id, { decision: 'APPROVED' });
    expect((await User.findById(nurse._id).lean()).careProfile.verification.idVerified).toBe(true);
    await expect(svc().review(aadhaar._id, admin._id, { decision: 'APPROVED' })).rejects.toThrow(/already reviewed/);

    const police = await svc().submitDocument(nurse._id, { kind: 'POLICE_CHECK', expiresAt: inDays(200) }, file(2));
    await svc().review(police._id, admin._id, { decision: 'APPROVED' });
    for (const kind of ['NURSING_REGISTRATION', 'NURSING_QUALIFICATION']) {
      const d = await svc().submitDocument(nurse._id, { kind, number: kind === 'NURSING_REGISTRATION' ? 'RNC-44821' : undefined, expiresAt: kind === 'NURSING_REGISTRATION' ? inDays(10) : undefined }, file(3));
      await svc().review(d._id, admin._id, { decision: 'APPROVED' });
    }
    const v = (await User.findById(nurse._id).lean()).careProfile.verification;
    expect(v).toMatchObject({ idVerified: true, policeVerified: true, councilVerified: true });
    const status = await svc().getStatus(nurse._id);
    expect(status.complete).toBe(true);
    expect(status.items.find((i) => i.kind === 'NURSING_REGISTRATION').state).toBe('EXPIRING'); // 10 days left
  });

  it('keeps the old licence valid while a renewal is reviewed, then expires on time', async () => {
    if (!db) return;
    const renewal = await svc().submitDocument(nurse._id, { kind: 'NURSING_REGISTRATION', number: 'RNC-44821', expiresAt: inDays(1000) }, file(4));
    expect((await svc().getStatus(nurse._id)).complete).toBe(true); // still verified
    // Reminder goes out once, then the old one expires (renewal not yet approved).
    const r1 = await svc().sweepExpiry(new Date());
    expect(r1.reminded).toBeGreaterThanOrEqual(1);
    const later = new Date(Date.now() + 11 * DAY);
    const r2 = await svc().sweepExpiry(later);
    expect(r2.expired).toBeGreaterThanOrEqual(1);
    const u = await User.findById(nurse._id).lean();
    expect(u.careProfile.verification.councilVerified).toBe(false);
    expect(u.isOnline).toBe(false);
    await svc().review(renewal._id, admin._id, { decision: 'APPROVED' });
    expect((await User.findById(nurse._id).lean()).careProfile.verification.councilVerified).toBe(true);
  });

  it('suspends a pharmacy whose drug licence expires', async () => {
    if (!db) return;
    const lic = await svc().submitDocument(vendorUser._id, { kind: 'DRUG_LICENCE', number: 'RJ-20B-1', expiresAt: inDays(5) }, file(5));
    await svc().review(lic._id, admin._id, { decision: 'APPROVED' });
    await svc().sweepExpiry(new Date(Date.now() + 6 * DAY));
    expect(await PharmacyVendor.collection.findOne({ _id: store.insertedId })).toMatchObject({ status: 'SUSPENDED', isOpen: false });
  });

  it('needs two different admins for home-access documents when the rule is on', async () => {
    if (!db) return;
    process.env.VERIFICATION_TWO_PERSON = 'true';
    const police = await svc().submitDocument(nurse._id, { kind: 'POLICE_CHECK', expiresAt: inDays(300) }, file(6));
    const first = await svc().review(police._id, admin._id, { decision: 'APPROVED' });
    expect(first.awaitingSecondApproval).toBe(true);
    await expect(svc().review(police._id, admin._id, { decision: 'APPROVED' })).rejects.toThrow(/second admin/);
    const second = await svc().review(police._id, admin2._id, { decision: 'APPROVED' });
    expect(second.document.status).toBe('APPROVED');
    delete process.env.VERIFICATION_TWO_PERSON;
  });

  it('takes Aadhaar from DigiLocker once per sign-in and checks the name', async () => {
    if (!db) return;
    Object.assign(process.env, { DIGILOCKER_CLIENT_ID: 'cid', DIGILOCKER_CLIENT_SECRET: 'secret', DIGILOCKER_REDIRECT_URI: 'https://api.test/cb' });
    const dl = require('../../services/digilockerService');
    const url = new URL(await dl.startUrl(nurse._id, 'web'));
    const state = url.searchParams.get('state');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    const calls = [];
    const fetchStub = async (u, opts) => {
      calls.push(String(u));
      if (String(u).endsWith('/token')) return { ok: true, json: async () => ({ access_token: 'tok', name: 'Asha Sharma' }) };
      return { ok: true, text: async () => '<UidData uid="xxxxxxxx4821"><Poi name="Asha Kumari Sharma" dob="12-03-1994" gender="F"/></UidData>' };
    };
    const ok = await dl.handleCallback({ code: 'c1', state }, { fetch: fetchStub });
    expect(ok).toEqual({ ok: true, returnTo: 'web' });
    expect(await dl.handleCallback({ code: 'c1', state }, { fetch: fetchStub })).toMatchObject({ ok: false, reason: 'expired' }); // one use
    const doc = await PartnerDocument.findOne({ user: nurse._id, kind: 'AADHAAR', superseded: false }).lean();
    expect(doc).toMatchObject({ source: 'DIGILOCKER', status: 'APPROVED', number: '4821', digilocker: { nameMatches: true } });
    expect(JSON.stringify(doc)).not.toMatch(/xxxxxxxx|BASE64/);
    expect(calls).toHaveLength(2);
  });
});
