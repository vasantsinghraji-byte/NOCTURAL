/**
 * Partner onboarding: apply → platform admin reviews → approve/reject.
 * Approval records the decision; ops then create the partner login (roles are
 * never self-assigned).
 */

const PartnerApplication = require('../models/partnerApplication');
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

async function review(id, adminId, { status, note }) {
  if (!['APPROVED', 'REJECTED'].includes(status)) throw new ValidationError('status must be APPROVED or REJECTED');
  const app = await PartnerApplication.findOneAndUpdate(
    { _id: id, status: 'PENDING' },
    { $set: { status, review: { by: adminId, at: new Date(), note: clean(note, 300) } } },
    { new: true }
  );
  if (!app) throw new NotFoundError('Pending application');
  logger.info('Partner application reviewed', { id: String(app._id), status });
  return app;
}

module.exports = { apply, list, review };
