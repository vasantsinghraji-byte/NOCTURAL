/**
 * Regression guard for the mongoose 9 async pre-save hook bug (issue #97).
 *
 * mongoose 9 stopped passing `next` to async hook functions, so an
 * `async function(next) { ... next(); }` pre-save hook threw
 * "TypeError: next is not a function" on .create()/.save(). This was a latent
 * production bug on main (no test exercised model saves), which is exactly why
 * it shipped silently. These tests fail fast if any model's save hook regresses
 * to the callback style under a mongoose major bump.
 *
 * Models whose async pre-save hooks were migrated: user, patient, payment,
 * healthRecord, investigationReport. For the non-User models we save with
 * `validateBeforeSave: false` so the hook runs without needing full (deep,
 * ref-heavy) valid fixtures — the point is that the hook executes and computes
 * its field, not that the document is business-valid.
 */
const mongoose = require('mongoose');
const User = require('../../models/user');
const Patient = require('../../models/patient');
const Payment = require('../../models/payment');
const HealthRecord = require('../../models/healthRecord');
const InvestigationReport = require('../../models/investigationReport');

describe('Model save hooks — mongoose 9 async-hook regression (#97)', () => {
  let databaseAvailable = false;
  const created = []; // { model, id } for cleanup
  const userEmailPattern = /save-hooks-regression/;

  const track = (doc) => { created.push({ model: doc.constructor, id: doc._id }); return doc; };

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      try {
        await mongoose.connect(process.env.MONGODB_URI, {
          serverSelectionTimeoutMS: Number(process.env.TEST_MONGO_SERVER_SELECTION_TIMEOUT_MS) || 3000
        });
        databaseAvailable = true;
      } catch (error) {
        databaseAvailable = false;
        console.warn(`Skipping save-hooks regression: MongoDB unavailable (${error.message})`);
      }
    } else {
      databaseAvailable = true;
    }
  });

  afterAll(async () => {
    if (databaseAvailable) {
      await User.deleteMany({ email: userEmailPattern });
      await Patient.deleteMany({ email: userEmailPattern });
      await Promise.all(created.map(({ model, id }) => model.deleteOne({ _id: id })));
      await mongoose.connection.close();
    }
  });

  it('User: create runs the password-hashing hook (no "next is not a function")', async () => {
    if (!databaseAvailable) return;
    const plain = 'RegressPass123!';
    const user = track(await User.create({
      name: 'Save Hooks Regression',
      email: `save-hooks-regression-${Date.now()}@integration.test`,
      password: plain,
      role: 'doctor',
      phone: '9999999999',
      specialty: 'General Medicine'
    }));
    expect(user._id).toBeTruthy();
    expect(user.password).not.toBe(plain);
    expect(await user.comparePassword(plain)).toBe(true);
  });

  it('User: re-save (login lastActive path) does not throw', async () => {
    if (!databaseAvailable) return;
    const plain = 'RegressPass123!';
    const user = track(await User.create({
      name: 'Save Hooks Regression Login',
      email: `save-hooks-regression-login-${Date.now()}@integration.test`,
      password: plain,
      role: 'doctor',
      phone: '9999999999',
      specialty: 'General Medicine'
    }));
    user.lastActive = new Date();
    await expect(user.save()).resolves.toBeTruthy();
    expect(await user.comparePassword(plain)).toBe(true);
  });

  it('Patient: pre-save hook hashes the password', async () => {
    if (!databaseAvailable) return;
    const plain = 'RegressPass123!';
    const patient = new Patient({
      name: 'Save Hooks Regression Patient',
      email: `save-hooks-regression-patient-${Date.now()}@integration.test`,
      password: plain,
      phone: '9999999999'
    });
    await patient.save({ validateBeforeSave: false });
    track(patient);
    expect(patient.password).not.toBe(plain);
  });

  it('Payment: pre-save hook generates an invoice number', async () => {
    if (!databaseAvailable) return;
    const payment = new Payment({});
    await payment.save({ validateBeforeSave: false });
    track(payment);
    expect(payment.invoiceNumber).toMatch(/^INV-\d{6}-\d{6}$/);
  });

  it('HealthRecord: pre-save hook sets the initial version', async () => {
    if (!databaseAvailable) return;
    const record = new HealthRecord({ patient: new mongoose.Types.ObjectId() });
    await record.save({ validateBeforeSave: false });
    track(record);
    expect(record.version).toBe(1);
  });

  it('InvestigationReport: pre-save hook generates a report number', async () => {
    if (!databaseAvailable) return;
    const report = new InvestigationReport({});
    await report.save({ validateBeforeSave: false });
    track(report);
    expect(report.reportNumber).toMatch(/^INV\d{6}\d{6}$/);
  });
});
