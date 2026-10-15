/**
 * Partner onboarding for every partner the app supports:
 * - approving a delivery rider, path lab or phlebotomist creates their login
 *   with the right role (as nurses and pharmacies already did);
 * - waitlist kinds (PRP technician, hospital) still create no login;
 * - riders, labs and phlebotomists become verified once every required
 *   document is valid, and lose it (riders go offline) when one lapses.
 */

jest.mock('../../../models/user');
jest.mock('../../../models/partnerDocument');
jest.mock('../../../models/partnerApplication', () => {
  const model = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
    create: jest.fn()
  };
  model.PARTNER_KINDS = ['MEDICAL_STAFF', 'PHARMACY', 'PATH_LAB', 'DELIVERY', 'PHLEBOTOMIST', 'PRP_TECHNICIAN', 'HOSPITAL'];
  return model;
});
jest.mock('../../../models/pharmacyVendor');
jest.mock('../../../services/passwordResetService', () => ({ invite: jest.fn() }));
jest.mock('../../../services/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue({}) }));
jest.mock('../../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const User = require('../../../models/user');
const PartnerDocument = require('../../../models/partnerDocument');
const PartnerApplication = require('../../../models/partnerApplication');
const passwordResetService = require('../../../services/passwordResetService');
const verification = require('../../../services/partnerVerificationService');
const applications = require('../../../services/partnerApplicationService');

const USER_ID = '000000000000000000000011';
const ADMIN_ID = '000000000000000000000099';
const NOW = new Date('2026-10-14T06:00:00Z');
const FUTURE = new Date('2027-10-14T00:00:00Z');
const PAST = new Date('2026-10-01T00:00:00Z');

const chain = (value) => {
  const q = { select: () => q, sort: () => q, lean: () => Promise.resolve(value) };
  return q;
};
const doc = (kind, extra = {}) => ({ kind, status: 'APPROVED', superseded: false, expiresAt: FUTURE, ...extra });

describe('rider / lab account verification follows documents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
  });

  it('verifies a rider once Aadhaar, licence, RC and police check are all approved', async () => {
    User.findById = jest.fn(() => chain({ _id: USER_ID, role: 'delivery_partner', isVerified: false }));
    PartnerDocument.find = jest.fn(() => chain([doc('AADHAAR'), doc('DRIVING_LICENCE'), doc('VEHICLE_RC'), doc('POLICE_CHECK')]));

    const out = await verification.syncFlags(USER_ID, ADMIN_ID, NOW);

    expect(out).toEqual({ changed: true, verified: true });
    expect(User.updateOne).toHaveBeenCalledWith({ _id: USER_ID }, { $set: { isVerified: true } });
  });

  it('keeps a rider unverified while a document is missing', async () => {
    User.findById = jest.fn(() => chain({ _id: USER_ID, role: 'delivery_partner', isVerified: false }));
    PartnerDocument.find = jest.fn(() => chain([doc('AADHAAR'), doc('DRIVING_LICENCE'), doc('VEHICLE_RC')]));

    expect(await verification.syncFlags(USER_ID, ADMIN_ID, NOW)).toEqual({ changed: false });
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  it('takes a rider offline when a document expires', async () => {
    User.findById = jest.fn(() => chain({ _id: USER_ID, role: 'delivery_partner', isVerified: true }));
    PartnerDocument.find = jest.fn(() => chain([doc('AADHAAR'), doc('DRIVING_LICENCE', { expiresAt: PAST }), doc('VEHICLE_RC'), doc('POLICE_CHECK')]));

    const out = await verification.syncFlags(USER_ID, null, NOW);

    expect(out).toEqual({ changed: true, verified: false });
    expect(User.updateOne).toHaveBeenCalledWith({ _id: USER_ID }, { $set: { isVerified: false, isOnline: false } });
  });

  it('verifies a path lab on its NABL and establishment certificates', async () => {
    User.findById = jest.fn(() => chain({ _id: USER_ID, role: 'lab_partner', isVerified: false }));
    PartnerDocument.find = jest.fn(() => chain([doc('AADHAAR'), doc('NABL_CERTIFICATE'), doc('CLINICAL_ESTABLISHMENT')]));

    expect(await verification.syncFlags(USER_ID, ADMIN_ID, NOW)).toEqual({ changed: true, verified: true });
  });
});

describe('approving an application creates the right login', () => {
  const pending = (kind, extra = {}) => ({
    _id: '000000000000000000000021', kind, status: 'PENDING', name: 'Ravi Kumar', phone: '9876500021', email: 'ravi@example.com', details: {}, ...extra
  });

  beforeEach(() => {
    jest.clearAllMocks();
    User.findOne = jest.fn(() => chain(null));
    User.create = jest.fn(async (u) => ({ _id: USER_ID, ...u }));
    passwordResetService.invite.mockResolvedValue({ sent: true });
    PartnerApplication.updateOne.mockResolvedValue({});
  });

  const approve = async (app) => {
    PartnerApplication.findOne.mockReturnValue(chain(app));
    PartnerApplication.findOneAndUpdate.mockResolvedValue({ ...app, status: 'APPROVED', toObject: () => ({ ...app, status: 'APPROVED' }) });
    return applications.review(app._id, ADMIN_ID, { status: 'APPROVED' });
  };

  it.each([
    ['DELIVERY', 'delivery_partner'],
    ['PATH_LAB', 'lab_partner'],
    ['PHLEBOTOMIST', 'phlebotomist']
  ])('%s → %s, unverified, with a set-password invite', async (kind, role) => {
    const out = await approve(pending(kind));

    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ role, isVerified: false, email: 'ravi@example.com' }));
    expect(passwordResetService.invite).toHaveBeenCalledTimes(1);
    expect(out.invite).toEqual({ sent: true });
  });

  it('asks for an email before approving a rider without one', async () => {
    PartnerApplication.findOne.mockReturnValue(chain(pending('DELIVERY', { email: undefined })));
    await expect(applications.review('000000000000000000000021', ADMIN_ID, { status: 'APPROVED' })).rejects.toThrow(/email/i);
    expect(User.create).not.toHaveBeenCalled();
  });

  it.each(['PRP_TECHNICIAN', 'HOSPITAL'])('%s stays a waitlist: no login is created', async (kind) => {
    await approve(pending(kind));
    expect(User.create).not.toHaveBeenCalled();
    expect(passwordResetService.invite).not.toHaveBeenCalled();
  });
});
