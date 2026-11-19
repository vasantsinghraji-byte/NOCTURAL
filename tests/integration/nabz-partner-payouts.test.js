/**
 * Partner withdrawals: payout details (encrypted bank account), 24-hour
 * cooldown after a change, balance net of cash held, one open request,
 * admin marks paid → ledger entries settled.
 */
const mongoose = require('mongoose');
const User = require('../../models/user');
const SettlementEntry = require('../../models/settlementEntry');
const WithdrawalRequest = require('../../models/withdrawalRequest');

const RUN = Date.now();
// Test-only key: bank account numbers are encrypted at rest.
if (!/^[a-f0-9]{64}$/i.test(process.env.ENCRYPTION_KEY || '')) process.env.ENCRYPTION_KEY = require('crypto').randomBytes(32).toString('hex');

describe('Partner payouts (real MongoDB)', () => {
  let db = false;
  let nurse;
  let admin;
  const payouts = () => require('../../services/payoutService');

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping payout tests: MongoDB unavailable (${error.message})`);
      return;
    }
    await WithdrawalRequest.createIndexes();
    [nurse, admin] = await User.create([
      { name: 'Payout Nurse', email: `pay.${RUN}@nabz.test`, password: 'Strong@12345', phone: '9876507001', role: 'nurse', isVerified: true },
      { name: 'Ops', email: `payops.${RUN}@nabz.test`, password: 'Strong@12345', phone: '9876507002', role: 'platform_admin', isVerified: true }
    ]);
    const source = (n) => ({ kind: 'CARE_BOOKING', id: new mongoose.Types.ObjectId(), ref: `visit-${n}` });
    await SettlementEntry.create([
      { source: source(1), party: { kind: 'PROVIDER', id: nurse._id }, type: 'PROVIDER_PAYOUT', amount: 800, occurredAt: new Date() },
      { source: source(2), party: { kind: 'PROVIDER', id: nurse._id }, type: 'PROVIDER_PAYOUT', amount: 400, occurredAt: new Date() },
      { source: source(2), party: { kind: 'PROVIDER', id: nurse._id }, type: 'CASH_COLLECTED', amount: 500, occurredAt: new Date() }
    ]);
  });

  afterAll(async () => {
    if (!db) return;
    await SettlementEntry.deleteMany({ 'party.id': nurse._id });
    await WithdrawalRequest.deleteMany({ user: nurse._id });
    await User.deleteMany({ _id: { $in: [nurse._id, admin._id] } });
    await mongoose.disconnect();
  });

  it('keeps the bank account encrypted and masked', async () => {
    if (!db) return;
    await expect(payouts().savePayoutDetails(nurse._id, { method: 'BANK', accountNumber: '12', ifsc: 'HDFC0001234', accountName: 'A' })).rejects.toThrow(/account number/);
    const details = await payouts().savePayoutDetails(nurse._id, { method: 'BANK', accountNumber: '50100123454321', ifsc: 'hdfc0001234', accountName: 'Payout Nurse', bankName: 'HDFC' });
    expect(details).toMatchObject({ method: 'BANK', display: 'HDFC ••••4321', ifsc: 'HDFC0001234' });
    const raw = await User.findById(nurse._id).select('+payout.accountNumberEnc').lean();
    expect(raw.payout.accountNumberEnc).toBeTruthy();
    expect(raw.payout.accountNumberEnc).not.toContain('50100123454321');
    expect(JSON.stringify(await User.findById(nurse._id).lean())).not.toContain('50100123454321');
  });

  it('waits 24 hours after a details change, then withdraws earnings minus cash held', async () => {
    if (!db) return;
    const summary = await payouts().getPayoutSummary(nurse._id);
    expect(summary).toMatchObject({ available: 700, earned: 1200, cashHeld: 500, canWithdraw: false });
    await expect(payouts().requestWithdrawal(nurse._id)).rejects.toThrow(/24 hours/);

    await User.updateOne({ _id: nurse._id }, { $set: { 'payout.updatedAt': new Date(Date.now() - 25 * 3600 * 1000) } });
    const req = await payouts().requestWithdrawal(nurse._id);
    expect(req).toMatchObject({ amount: 700, status: 'REQUESTED', destination: { method: 'BANK', display: 'HDFC ••••4321' } });
    await expect(payouts().requestWithdrawal(nurse._id)).rejects.toThrow(/already have a withdrawal/);
    expect((await payouts().getPayoutSummary(nurse._id)).available).toBe(0); // held by the open request

    const dest = await payouts().revealDestination(req._id, admin._id);
    expect(dest).toMatchObject({ method: 'BANK', accountNumber: '50100123454321', ifsc: 'HDFC0001234' });

    await expect(payouts().markPaid(req._id, admin._id, { utr: '12' })).rejects.toThrow(/UTR/);
    const paid = await payouts().markPaid(req._id, admin._id, { utr: 'UTR123456789' });
    expect(paid.status).toBe('PAID');
    await expect(payouts().markPaid(req._id, admin._id, { utr: 'UTR123456789' })).rejects.toThrow(/already processed/);
    expect(await SettlementEntry.countDocuments({ 'party.id': nurse._id, status: 'PENDING' })).toBe(0);
    expect((await payouts().getPayoutSummary(nurse._id)).history[0]).toMatchObject({ status: 'PAID', utr: 'UTR123456789' });
  });
});
