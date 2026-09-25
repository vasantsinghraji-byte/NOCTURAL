/**
 * Customer account deletion (India's DPDP Act 2023: right to erasure).
 *
 * What happens:
 * - Refused while a visit or medicine order is still in progress, or money is
 *   owed, so nobody is left mid-service or with an unsettled bill.
 * - Personal data on the account is erased: name, email, phone, addresses,
 *   medical history, emergency contacts, insurance, saved payment methods,
 *   passkeys and the Google link. Every session is revoked.
 * - Records the law requires us to keep (invoices, settlements, the Schedule
 *   H1 register, visit and order history) stay, pointing at the now-anonymous
 *   account.
 *
 * Health records and metrics are kept as-is pending a legal decision on
 * medical-record retention periods; see docs/AUDIT_2026-09-24_ALL_ROLES.md (M5).
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Patient = require('../models/patient');
const NurseBooking = require('../models/nurseBooking');
const PharmacyOrder = require('../models/pharmacyOrder');
const refreshSessionService = require('./refreshSessionService');
const logger = require('../utils/logger');
const { ConflictError, NotFoundError } = require('../utils/errors');

const ACTIVE_VISIT = ['REQUESTED', 'ASSIGNED', 'CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS'];
const ACTIVE_ORDER = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];

async function deletePatientAccount(patientId) {
  const patient = await Patient.findById(patientId).select('_id isActive deletedAt pendingDues').lean();
  if (!patient || patient.deletedAt) throw new NotFoundError('Account');

  const [visits, orders] = await Promise.all([
    NurseBooking.countDocuments({ patient: patient._id, status: { $in: ACTIVE_VISIT } }),
    PharmacyOrder.countDocuments({ patient: patient._id, status: { $in: ACTIVE_ORDER } })
  ]);
  if (visits || orders) {
    throw new ConflictError('You have a visit or medicine order in progress. Cancel it or wait for it to finish, then delete your account.');
  }
  if ((patient.pendingDues || 0) > 0) {
    throw new ConflictError(`You have ₹${patient.pendingDues} in unpaid cancellation fees. Settle them with your next booking or contact support, then delete your account.`);
  }

  const tag = String(patient._id);
  // updateOne without validators: the placeholders only need to be unique and
  // never match a real sign-in (the phone isn't a valid Indian number on purpose).
  const res = await Patient.updateOne(
    { _id: patient._id, deletedAt: { $exists: false } },
    {
      $set: {
        name: 'Deleted user',
        email: `deleted+${tag}@deleted.nabz.invalid`,
        phone: `deleted:${tag}`,
        // A hash of a random secret nobody knows: password sign-in can never succeed.
        password: await bcrypt.hash(crypto.randomBytes(32).toString('base64url'), 12),
        isActive: false,
        phoneVerified: false,
        emailVerified: false,
        deletedAt: new Date(),
        savedAddresses: [],
        emergencyContacts: [],
        savedPaymentMethods: [],
        webAuthnCredentials: []
      },
      $unset: {
        dateOfBirth: 1, gender: 1, bloodGroup: 1, profilePhoto: 1, address: 1, medicalHistory: 1,
        emergencyContact: 1, insurance: 1, googleId: 1, referralCode: 1, preferences: 1
      },
      $inc: { sessionVersion: 1 } // every access token stops working
    },
    { runValidators: false, strict: false }
  );
  if (!res.modifiedCount) throw new NotFoundError('Account');

  await refreshSessionService.revokeAllForUser({ userId: patient._id, userType: 'patient', reason: 'ACCOUNT_DELETED' })
    .catch((err) => logger.error('Session revoke after deletion failed', { patientId: tag, error: err.message }));
  logger.logSecurity('patient_account_deleted', { patientId: tag });
  return { deleted: true };
}

module.exports = { deletePatientAccount };
