/**
 * Customer account deletion (DPDP right to erasure): refused while something
 * is in progress; otherwise personal data is erased, sessions die, and legal
 * records stay linked to the anonymous account.
 */
const request = require('supertest');
const mongoose = require('mongoose');
const Patient = require('../../models/patient');
const PharmacyOrder = require('../../models/pharmacyOrder');

const MOBILE = { 'X-Nocturnal-Mobile': 'expo' };
const PASSWORD = 'Strong@12345';
const RUN = Date.now();

describe('Customer account deletion (real MongoDB)', () => {
  let app;
  let db = false;
  let patient;
  let token;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping account deletion: MongoDB unavailable (${error.message})`);
      return;
    }
    await Patient.createIndexes();
    app = require('../../app');
    patient = await Patient.create({
      name: 'Riya Sharma', email: `riya.${RUN}@nabz.test`, password: PASSWORD, phone: `8${String(RUN).slice(-9)}`,
      savedAddresses: [{ label: 'Home', line1: '12 Ashok Marg', city: 'Jaipur', pincode: '302001' }],
      medicalHistory: { allergies: [{ allergen: 'Penicillin', reaction: 'Rash', severity: 'Moderate' }] },
      bloodGroup: 'B+'
    });
    const login = await request(app).post('/api/v1/patients/login').set(MOBILE).send({ email: patient.email, password: PASSWORD });
    token = login.body.tokens.accessToken;
  });

  afterAll(async () => {
    if (!db) return;
    await PharmacyOrder.deleteMany({ patient: patient._id });
    await Patient.deleteOne({ _id: patient._id });
    await mongoose.disconnect();
  });

  it('needs a typed confirmation', async () => {
    if (!db) return;
    expect((await request(app).delete('/api/v1/patients/me').set(auth()).send({})).status).toBe(400);
  });

  it('is refused while a medicine order is still on its way', async () => {
    if (!db) return;
    const order = await PharmacyOrder.collection.insertOne({
      orderNumber: `DEL-${RUN}`, patient: patient._id, vendor: new mongoose.Types.ObjectId(), status: 'OUT_FOR_DELIVERY', items: []
    });
    const res = await request(app).delete('/api/v1/patients/me').set(auth()).send({ confirm: 'DELETE' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/in progress/);
    await PharmacyOrder.collection.updateOne({ _id: order.insertedId }, { $set: { status: 'DELIVERED' } });
  });

  it('erases personal data, kills the session and keeps the order history', async () => {
    if (!db) return;
    const res = await request(app).delete('/api/v1/patients/me').set(auth()).send({ confirm: 'DELETE' });
    expect(res.status).toBe(200);

    const gone = await Patient.findById(patient._id).select('+password').lean();
    expect(gone).toMatchObject({ name: 'Deleted user', isActive: false });
    expect(gone.deletedAt).toBeTruthy();
    expect(gone.email).not.toContain('riya');
    expect(gone.phone).not.toBe(patient.phone);
    expect(gone.savedAddresses).toEqual([]);
    expect(JSON.stringify(gone)).not.toMatch(/Ashok Marg|Riya/);
    // Health history stays with the (now anonymous) account.
    expect(gone.medicalHistory.allergies[0]).toMatchObject({ allergen: 'Penicillin' });
    expect(gone.bloodGroup).toBe('B+');

    // Old token is dead; the old password doesn't sign in; order history is still linked.
    expect((await request(app).get('/api/v1/patients/me').set(auth())).status).toBe(401);
    expect((await request(app).post('/api/v1/patients/login').set(MOBILE).send({ email: patient.email, password: PASSWORD })).status).toBeGreaterThanOrEqual(400);
    expect(await PharmacyOrder.countDocuments({ patient: patient._id })).toBe(1);

    // The phone number is free for a new account.
    const again = await Patient.create({ name: 'New Riya', email: `riya2.${RUN}@nabz.test`, password: PASSWORD, phone: patient.phone });
    await Patient.deleteOne({ _id: again._id });
  });
});
