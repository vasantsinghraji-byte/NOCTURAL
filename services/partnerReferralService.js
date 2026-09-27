/**
 * Partner referral programme.
 *
 * Every partner (nurse, physio, pharmacy owner) has a referral code.
 * - A customer who signs up with it and completes a first order or visit
 *   worth at least REFERRAL_MIN_ORDER_INR (default ₹199), or
 * - a partner who applies with it and completes their first job,
 * earns the referrer REWARD_CREDITS (2) credits. Each credit makes one of
 * the referrer's next jobs carry only REFERRAL_COMMISSION_RATE (5%) Nabz
 * commission instead of the normal rate.
 *
 * Every step is a compare-and-set, so a reward is granted once and a credit
 * is spent once even when completions race.
 */

const crypto = require('crypto');
const User = require('../models/user');
const Patient = require('../models/patient');
const logger = require('../utils/logger');
const { ValidationError, ConflictError, NotFoundError } = require('../utils/errors');

const PARTNER_ROLES = ['nurse', 'physiotherapist', 'medical_staff', 'pharmacy_vendor', 'phlebotomist', 'delivery_partner', 'lab_partner'];
const REWARD_CREDITS = 2;

const policy = () => ({
  rate: Number(process.env.REFERRAL_COMMISSION_RATE) || 0.05,
  minOrder: Number(process.env.REFERRAL_MIN_ORDER_INR) || 199
});

const normalizeCode = (code) => String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

/** The partner's code, created on first use (NZ + 6 characters, no look-alikes). */
async function ensureCode(userId) {
  const user = await User.findById(userId).select('referral role').lean();
  if (!user) throw new NotFoundError('Partner');
  if (user.referral && user.referral.code) return user.referral.code;
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = `NZ${Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join('')}`;
    try {
      const res = await User.updateOne({ _id: userId, 'referral.code': { $exists: false } }, { $set: { 'referral.code': code } });
      if (res.modifiedCount) return code;
      const again = await User.findById(userId).select('referral.code').lean();
      if (again.referral && again.referral.code) return again.referral.code;
    } catch (err) {
      if (err.code !== 11000) throw err; // code taken: try another
    }
  }
  throw new ConflictError('Could not create a referral code. Try again');
}

async function findReferrer(code) {
  const clean = normalizeCode(code);
  if (!clean) throw new ValidationError('Enter a referral code');
  const referrer = await User.findOne({ 'referral.code': clean, role: { $in: PARTNER_ROLES }, isActive: { $ne: false } })
    .select('_id phone name').lean();
  if (!referrer) throw new ValidationError('That referral code isn’t valid');
  return referrer;
}

/** A customer adds a partner's code (before their first completed order). */
async function attachPatient(patientId, code) {
  const referrer = await findReferrer(code);
  const patient = await Patient.findById(patientId).select('phone referredByPartner partnerReferralRewardedAt').lean();
  if (!patient) throw new NotFoundError('Account');
  if (patient.referredByPartner) throw new ConflictError('You already used a referral code');
  if (referrer.phone && patient.phone && referrer.phone === patient.phone) throw new ValidationError('You can’t use your own referral code');
  const NurseBooking = require('../models/nurseBooking');
  const PharmacyOrder = require('../models/pharmacyOrder');
  const [visits, orders] = await Promise.all([
    NurseBooking.countDocuments({ patient: patient._id, status: 'COMPLETED' }),
    PharmacyOrder.countDocuments({ patient: patient._id, status: 'DELIVERED' })
  ]);
  if (visits || orders) throw new ConflictError('Referral codes work only before your first order');
  const res = await Patient.updateOne({ _id: patient._id, referredByPartner: { $exists: false } }, { $set: { referredByPartner: referrer._id } });
  if (!res.modifiedCount) throw new ConflictError('You already used a referral code');
  return { referredBy: referrer.name };
}

async function grant(referrerId, reason) {
  await User.updateOne({ _id: referrerId }, { $inc: { 'referral.credits': REWARD_CREDITS, 'referral.successful': 1 } });
  logger.info('Referral reward granted', { referrerId: String(referrerId), reason, credits: REWARD_CREDITS });
  try {
    const notificationService = require('./bookingService');
    await notificationService.notifyUser(referrerId, 'User', 'Referral reward unlocked',
      `Your next ${REWARD_CREDITS} jobs carry only ${Math.round(policy().rate * 100)}% Nabz commission.`);
  } catch { /* notification is best effort */ }
}

/** A referred customer completed an order or visit: reward the referrer once. */
async function onPatientCompletion(patientId, amount) {
  if (!patientId || !(Number(amount) >= policy().minOrder)) return false;
  const patient = await Patient.findOneAndUpdate(
    { _id: patientId, referredByPartner: { $exists: true }, partnerReferralRewardedAt: { $exists: false } },
    { $set: { partnerReferralRewardedAt: new Date() } },
    { new: true }
  ).select('referredByPartner').lean();
  if (!patient) return false;
  await grant(patient.referredByPartner, 'CUSTOMER_FIRST_ORDER');
  return true;
}

/** A referred partner completed their first job: reward the referrer once. */
async function onPartnerCompletion(partnerUserId) {
  if (!partnerUserId) return false;
  const partner = await User.findOneAndUpdate(
    { _id: partnerUserId, 'referral.referredBy': { $exists: true }, 'referral.rewardedAt': { $exists: false } },
    { $set: { 'referral.rewardedAt': new Date() } },
    { new: true }
  ).select('referral.referredBy').lean();
  if (!partner) return false;
  await grant(partner.referral.referredBy, 'PARTNER_FIRST_JOB');
  return true;
}

/**
 * Spend one credit on this job: stamp the reduced rate on the booking/order
 * (once), then take the credit. Returns the rate to use, or null.
 */
async function claimReducedCommission(partnerUserId, Model, docId) {
  if (!partnerUserId) return null;
  const has = await User.exists({ _id: partnerUserId, 'referral.credits': { $gt: 0 } });
  if (!has) return null;
  const { rate } = policy();
  const stamped = await Model.updateOne(
    { _id: docId, 'commissionOverride.rate': { $exists: false } },
    { $set: { commissionOverride: { rate, reason: 'REFERRAL', at: new Date() } } }
  );
  if (!stamped.modifiedCount) return null; // already decided for this job
  const spent = await User.updateOne({ _id: partnerUserId, 'referral.credits': { $gt: 0 } }, { $inc: { 'referral.credits': -1 } });
  if (!spent.modifiedCount) {
    await Model.updateOne({ _id: docId }, { $unset: { commissionOverride: 1 } });
    return null;
  }
  return rate;
}

/** Apply a partner code from an application to the newly created partner. */
async function attachPartner(newUserId, code) {
  if (!code) return null;
  let referrer;
  try {
    referrer = await findReferrer(code);
  } catch {
    return null; // an invalid code shouldn't block onboarding
  }
  if (String(referrer._id) === String(newUserId)) return null;
  await User.updateOne({ _id: newUserId, 'referral.referredBy': { $exists: false } }, { $set: { 'referral.referredBy': referrer._id } });
  return referrer._id;
}

module.exports = {
  ensureCode, attachPatient, attachPartner, onPatientCompletion, onPartnerCompletion, claimReducedCommission,
  normalizeCode, policy, REWARD_CREDITS
};
