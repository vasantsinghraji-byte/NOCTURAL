/**
 * Partner payouts: payout details, withdrawals and admin processing.
 *
 * - Payout details: a UPI ID or a bank account (account number encrypted at
 *   rest, only the last 4 digits are ever returned).
 * - Changing payout details blocks withdrawals for 24 hours, so a stolen
 *   session can't immediately redirect money.
 * - Withdraw: the whole available balance (pending earnings minus cash the
 *   partner holds), minimum ₹100, one open request at a time.
 * - Admin marks a request PAID (with the UTR) → its ledger entries are PAID;
 *   REJECTED → they become available again.
 * Automatic transfers (RazorpayX / Cashfree Payouts) can replace the manual
 * "mark paid" step once a payouts account exists.
 */

const User = require('../models/user');
const SettlementEntry = require('../models/settlementEntry');
const WithdrawalRequest = require('../models/withdrawalRequest');
const { encrypt } = require('../utils/encryption');
const logger = require('../utils/logger');
const { ValidationError, ConflictError, NotFoundError } = require('../utils/errors');

const MIN_WITHDRAWAL = Number(process.env.PAYOUT_MIN_WITHDRAWAL_INR) || 100;
const DETAILS_COOLDOWN_MS = 24 * 3600 * 1000;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const UPI_RE = /^[a-z0-9.\-_]{2,256}@[a-z]{2,64}$/i;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Which ledger party a partner is paid as. */
async function partyFor(user) {
  if (user.role === 'pharmacy_vendor') {
    if (!user.pharmacyVendor) throw new ValidationError('Your store isn’t set up for payouts yet');
    return { kind: 'VENDOR', id: user.pharmacyVendor, payoutType: 'VENDOR_PAYOUT' };
  }
  return { kind: 'PROVIDER', id: user._id, payoutType: 'PROVIDER_PAYOUT' };
}

function maskedDetails(payout) {
  if (!payout || !payout.method) return null;
  return {
    method: payout.method,
    display: payout.method === 'UPI' ? payout.upiId : `${payout.bankName || 'Bank'} ••••${payout.accountLast4}`,
    accountName: payout.accountName,
    ifsc: payout.ifsc,
    updatedAt: payout.updatedAt,
    withdrawalsFrom: payout.updatedAt ? new Date(new Date(payout.updatedAt).getTime() + DETAILS_COOLDOWN_MS) : null
  };
}

async function savePayoutDetails(userId, input) {
  const method = input.method === 'BANK' ? 'BANK' : 'UPI';
  const set = { 'payout.method': method, 'payout.updatedAt': new Date(), 'payout.accountName': String(input.accountName || '').trim().slice(0, 80) };
  if (method === 'UPI') {
    const upiId = String(input.upiId || '').trim().toLowerCase();
    if (!UPI_RE.test(upiId)) throw new ValidationError('Enter a valid UPI ID, like name@okicici');
    Object.assign(set, { 'payout.upiId': upiId });
  } else {
    const account = String(input.accountNumber || '').replace(/\s/g, '');
    const ifsc = String(input.ifsc || '').trim().toUpperCase();
    if (!/^\d{9,18}$/.test(account)) throw new ValidationError('Enter a valid bank account number');
    if (!IFSC_RE.test(ifsc)) throw new ValidationError('Enter a valid IFSC code, like HDFC0001234');
    if (!set['payout.accountName']) throw new ValidationError('Enter the account holder’s name');
    Object.assign(set, {
      'payout.accountNumberEnc': encrypt(account),
      'payout.accountLast4': account.slice(-4),
      'payout.ifsc': ifsc,
      'payout.bankName': String(input.bankName || '').trim().slice(0, 60) || undefined
    });
  }
  const unset = method === 'UPI'
    ? { 'payout.accountNumberEnc': 1, 'payout.accountLast4': 1, 'payout.ifsc': 1, 'payout.bankName': 1 }
    : { 'payout.upiId': 1 };
  await User.updateOne({ _id: userId }, { $set: set, $unset: unset });
  logger.logSecurity('payout_details_changed', { userId: String(userId), method });
  const user = await User.findById(userId).select('payout').lean();
  return maskedDetails(user.payout);
}

/** Ledger entries not yet paid or held by an open request. */
async function openEntries(party) {
  const held = await WithdrawalRequest.find({ 'party.id': party.id, status: 'REQUESTED' }).select('entries').lean();
  const heldIds = held.flatMap((r) => r.entries);
  return SettlementEntry.find({
    'party.kind': party.kind,
    'party.id': party.id,
    status: 'PENDING',
    type: { $in: [party.payoutType, 'CASH_COLLECTED'] },
    _id: { $nin: heldIds }
  }).select('_id type amount').lean();
}

async function getPayoutSummary(userId) {
  const user = await User.findById(userId).select('role pharmacyVendor payout').lean();
  if (!user) throw new NotFoundError('Account');
  const party = await partyFor(user);
  const entries = await openEntries(party);
  const earned = entries.filter((e) => e.type !== 'CASH_COLLECTED').reduce((s, e) => s + e.amount, 0);
  const cash = entries.filter((e) => e.type === 'CASH_COLLECTED').reduce((s, e) => s + e.amount, 0);
  const history = await WithdrawalRequest.find({ user: user._id }).sort({ createdAt: -1 }).limit(10)
    .select('amount status destination utr note createdAt processedAt').lean();
  const details = maskedDetails(user.payout);
  const available = round2(earned - cash);
  const coolingDown = details && details.withdrawalsFrom && details.withdrawalsFrom > new Date();
  return {
    available: Math.max(0, available),
    earned: round2(earned),
    cashHeld: round2(cash),
    owes: available < 0 ? round2(-available) : 0, // cash held exceeds earnings
    minimum: MIN_WITHDRAWAL,
    details,
    canWithdraw: !!details && !coolingDown && available >= MIN_WITHDRAWAL && !history.some((h) => h.status === 'REQUESTED'),
    history
  };
}

async function requestWithdrawal(userId) {
  const user = await User.findById(userId).select('role pharmacyVendor payout').lean();
  if (!user) throw new NotFoundError('Account');
  const details = maskedDetails(user.payout);
  if (!details) throw new ValidationError('Add your UPI ID or bank account first');
  if (details.withdrawalsFrom > new Date()) throw new ConflictError('You changed your payout details recently. Withdrawals open 24 hours after a change');
  if (await WithdrawalRequest.exists({ user: user._id, status: 'REQUESTED' })) throw new ConflictError('You already have a withdrawal being processed');
  const party = await partyFor(user);
  const entries = await openEntries(party);
  const amount = round2(entries.reduce((s, e) => s + (e.type === 'CASH_COLLECTED' ? -e.amount : e.amount), 0));
  if (amount < MIN_WITHDRAWAL) throw new ValidationError(`You can withdraw once your balance is ₹${MIN_WITHDRAWAL} or more`);
  try {
    const req = await WithdrawalRequest.create({
      user: user._id, party: { kind: party.kind, id: party.id }, amount, entries: entries.map((e) => e._id),
      destination: { method: details.method, display: details.display }
    });
    logger.info('Withdrawal requested', { userId: String(user._id), amount });
    return req.toObject();
  } catch (err) {
    if (err.code === 11000) throw new ConflictError('You already have a withdrawal being processed');
    throw err;
  }
}

/** Admin: open requests with full destination details for paying them. */
async function listRequests({ status = 'REQUESTED' } = {}) {
  const rows = await WithdrawalRequest.find({ status }).sort({ createdAt: 1 }).limit(200)
    .populate('user', 'name phone email role').lean();
  return rows;
}

/** Admin: bank details to make the transfer (decrypted only here, logged). */
async function revealDestination(requestId, adminId) {
  const req = await WithdrawalRequest.findById(requestId).lean();
  if (!req) throw new NotFoundError('Withdrawal');
  const user = await User.findById(req.user).select('+payout.accountNumberEnc').lean();
  const { decrypt } = require('../utils/encryption');
  logger.logSecurity('payout_details_revealed', { requestId: String(requestId), adminId: String(adminId) });
  const p = user.payout || {};
  return p.method === 'UPI'
    ? { method: 'UPI', upiId: p.upiId, accountName: p.accountName || user.name }
    : { method: 'BANK', accountName: p.accountName, accountNumber: p.accountNumberEnc ? decrypt(p.accountNumberEnc) : null, ifsc: p.ifsc, bankName: p.bankName };
}

async function markPaid(requestId, adminId, { utr, note } = {}) {
  const cleanUtr = String(utr || '').trim();
  if (cleanUtr.length < 6) throw new ValidationError('Enter the transfer reference (UTR)');
  const req = await WithdrawalRequest.findOneAndUpdate(
    { _id: requestId, status: 'REQUESTED' },
    { $set: { status: 'PAID', utr: cleanUtr.slice(0, 40), note: note ? String(note).slice(0, 300) : undefined, processedBy: adminId, processedAt: new Date() } },
    { new: true }
  );
  if (!req) throw new ConflictError('This withdrawal was already processed');
  await SettlementEntry.updateMany({ _id: { $in: req.entries }, status: 'PENDING' }, { $set: { status: 'PAID', paidAt: new Date(), payoutRef: req.utr } });
  logger.info('Withdrawal paid', { requestId: String(req._id), amount: req.amount });
  return req.toObject();
}

async function reject(requestId, adminId, { note } = {}) {
  const req = await WithdrawalRequest.findOneAndUpdate(
    { _id: requestId, status: 'REQUESTED' },
    { $set: { status: 'REJECTED', note: String(note || 'Rejected').slice(0, 300), processedBy: adminId, processedAt: new Date() } },
    { new: true }
  );
  if (!req) throw new ConflictError('This withdrawal was already processed');
  return req.toObject();
}

module.exports = { savePayoutDetails, getPayoutSummary, requestWithdrawal, listRequests, revealDestination, markPaid, reject, MIN_WITHDRAWAL };
