/**
 * Partner onboarding: apply → platform admin reviews → approve/reject.
 * Approving a nurse/physio or pharmacy creates their login (role from the
 * application, never self-assigned) with verification pending, and emails a
 * set-password invite. Lab and delivery partners stay a waitlist for now.
 */

const crypto = require('crypto');
const PartnerApplication = require('../models/partnerApplication');
const User = require('../models/user');
const PharmacyVendor = require('../models/pharmacyVendor');
const passwordResetService = require('./passwordResetService');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError, ConflictError } = require('../utils/errors');

const clean = (v, max = 120) => (v === undefined || v === null ? undefined : String(v).trim().slice(0, max));

async function apply(input, applicant = { kind: 'ANONYMOUS' }) {
  const kind = String(input.kind || '');
  if (!PartnerApplication.PARTNER_KINDS.includes(kind)) throw new ValidationError('Choose how you want to partner with us');
  const phone = String(input.phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  const open = await PartnerApplication.findOne({ phone, kind, status: 'PENDING' }).select('_id');
  if (open) throw new ConflictError('You already have an application under review. We will call you soon.');

  const app = await PartnerApplication.create({
    kind,
    name: clean(input.name),
    phone,
    email: clean(input.email, 160),
    city: clean(input.city, 80) || 'Jaipur',
    details: {
      qualification: clean(input.qualification, 80),
      registrationNumber: clean(input.registrationNumber, 60),
      experienceYears: Number.isFinite(Number(input.experienceYears)) ? Number(input.experienceYears) : undefined,
      businessName: clean(input.businessName),
      gstin: clean(input.gstin, 20),
      address: clean(input.address, 300),
      vehicle: clean(input.vehicle, 40)
    },
    applicant
  });
  logger.info('Partner application received', { id: String(app._id), kind });
  return { id: app._id, status: app.status, createdAt: app.createdAt };
}

async function list({ status = 'PENDING', kind, limit = 50 } = {}) {
  const q = {};
  if (status) q.status = status;
  if (kind) q.kind = kind;
  return PartnerApplication.find(q).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 50, 200)).lean();
}

const PROVISIONED_KINDS = ['MEDICAL_STAFF', 'PHARMACY'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function staffRole(details = {}) {
  return /\b(bpt|mpt|physio)/i.test(details.qualification || '') ? 'physiotherapist' : 'nurse';
}

/** Create the partner's login (and a pending store for pharmacies). Returns ids + invite outcome. */
async function provision(app, email, adminId) {
  const existing = await User.findOne({ email }).select('_id').lean();
  if (existing) throw new ConflictError('An account with this email already exists. Link it manually or use another email.');

  let vendor = null;
  if (app.kind === 'PHARMACY') {
    // Not discoverable until ops add the location and approve the store.
    vendor = await PharmacyVendor.create({
      name: app.details?.businessName || `${app.name} pharmacy`,
      slug: `store-${app._id}`,
      status: 'PENDING',
      isActive: false,
      contactPhone: app.phone,
      drugLicenseNumber: app.details?.registrationNumber
    });
  }
  let user;
  try {
    user = await User.create({
      name: app.name,
      email,
      phone: app.phone,
      // Unusable until the partner sets their own through the invite link.
      password: `${crypto.randomBytes(24).toString('base64url')}Aa1!`,
      role: app.kind === 'PHARMACY' ? 'pharmacy_vendor' : staffRole(app.details),
      isVerified: false,
      ...(vendor ? { pharmacyVendor: vendor._id } : {}),
      ...(app.kind === 'MEDICAL_STAFF' ? {
        careProfile: {
          qualification: app.details?.qualification,
          registrationNumber: app.details?.registrationNumber
          // verification flags default to false: they can't go online until ops verify.
        }
      } : {})
    });
  } catch (err) {
    if (vendor) await PharmacyVendor.deleteOne({ _id: vendor._id }).catch(() => undefined);
    throw err;
  }
  const invite = await passwordResetService.invite(user);
  logger.info('Partner account provisioned', { applicationId: String(app._id), userId: String(user._id), by: String(adminId) });
  return { user, vendor, invite };
}

async function review(id, adminId, { status, note, email }) {
  if (!['APPROVED', 'REJECTED'].includes(status)) throw new ValidationError('status must be APPROVED or REJECTED');
  const pending = await PartnerApplication.findOne({ _id: id, status: 'PENDING' }).lean();
  if (!pending) throw new NotFoundError('Pending application');

  const provisionNeeded = status === 'APPROVED' && PROVISIONED_KINDS.includes(pending.kind);
  const loginEmail = String(email || pending.email || '').trim().toLowerCase();
  if (provisionNeeded && !EMAIL_RE.test(loginEmail)) {
    throw new ValidationError('Add the partner’s email: their sign-in invite is sent there');
  }

  // Claim the decision first so two admins can't both approve.
  const app = await PartnerApplication.findOneAndUpdate(
    { _id: id, status: 'PENDING' },
    { $set: { status, review: { by: adminId, at: new Date(), note: clean(note, 300) } } },
    { new: true }
  );
  if (!app) throw new NotFoundError('Pending application');

  let invite = null;
  if (provisionNeeded) {
    try {
      const made = await provision(app, loginEmail, adminId);
      invite = made.invite;
      app.provisioned = { user: made.user._id, vendor: made.vendor?._id, inviteEmailed: made.invite.sent, at: new Date() };
      await PartnerApplication.updateOne({ _id: app._id }, { $set: { provisioned: app.provisioned, ...(email ? { email: loginEmail } : {}) } });
    } catch (err) {
      // Put it back so the admin can fix the problem and approve again.
      await PartnerApplication.updateOne({ _id: app._id }, { $set: { status: 'PENDING' }, $unset: { review: 1 } });
      throw err;
    }
  }
  logger.info('Partner application reviewed', { id: String(app._id), status });
  const out = app.toObject();
  if (invite) out.invite = invite;
  return out;
}

module.exports = { apply, list, review };
