/**
 * Onboarding team accounts (services/onboardingTeamService.js):
 * - login IDs limited to ONBOARDING_LOGIN_DOMAINS when it is set;
 * - the admin assigns the ID, the reviewer sets their own password via a link;
 * - suspending ends every session (sessionVersion bump);
 * - the role always needs the authenticator app (adminMfaService.ADMIN_ROLES).
 */

jest.mock('../../../models/user');
jest.mock('../../../services/passwordResetService', () => ({ invite: jest.fn() }));
jest.mock('../../../services/securityAuditService', () => ({ record: jest.fn().mockResolvedValue({}) }));
jest.mock('../../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), logSecurity: jest.fn() }));

const User = require('../../../models/user');
const passwordResetService = require('../../../services/passwordResetService');
const securityAuditService = require('../../../services/securityAuditService');
const team = require('../../../services/onboardingTeamService');
const adminMfa = require('../../../services/adminMfaService');
const { isRoleAllowedInPortal } = require('../../../constants/portals');

const ADMIN = { _id: '000000000000000000000001' };
const REVIEWER_ID = '000000000000000000000002';

describe('onboardingTeamService', () => {
  const ORIGINAL = process.env.ONBOARDING_LOGIN_DOMAINS;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.ONBOARDING_LOGIN_DOMAINS;
    else process.env.ONBOARDING_LOGIN_DOMAINS = ORIGINAL;
    jest.clearAllMocks();
  });

  describe('login-ID domains', () => {
    it('allows any domain until the Nabz domain is configured', () => {
      delete process.env.ONBOARDING_LOGIN_DOMAINS;
      expect(team.isAllowedLoginId('someone@gmail.com')).toBe(true);
    });

    it('allows only the listed domains once set (exact match, case-insensitive)', () => {
      process.env.ONBOARDING_LOGIN_DOMAINS = 'nabz.in, @nabzhealth.com';
      expect(team.allowedDomains()).toEqual(['nabz.in', 'nabzhealth.com']);
      expect(team.isAllowedLoginId('Asha@NABZ.in')).toBe(true);
      expect(team.isAllowedLoginId('asha@nabzhealth.com')).toBe(true);
      expect(team.isAllowedLoginId('asha@gmail.com')).toBe(false);
      expect(team.isAllowedLoginId('asha@evil.nabz.in')).toBe(false);
      expect(team.isAllowedLoginId('asha@nabz.in.evil.com')).toBe(false);
    });
  });

  describe('create', () => {
    beforeEach(() => {
      User.exists = jest.fn().mockResolvedValue(null);
      User.create = jest.fn(async (u) => ({ _id: REVIEWER_ID, ...u, toObject() { return { _id: REVIEWER_ID, ...u }; } }));
      passwordResetService.invite.mockResolvedValue({ sent: true });
    });

    it('creates the reviewer with an unusable password and emails a set-password link', async () => {
      const out = await team.create(ADMIN, { name: 'Asha Verma', email: 'Asha@Nabz.in' });

      const created = User.create.mock.calls[0][0];
      expect(created).toMatchObject({ name: 'Asha Verma', email: 'asha@nabz.in', role: 'onboarding_reviewer' });
      expect(created.password.length).toBeGreaterThan(30); // random, never shown to anyone
      expect(passwordResetService.invite).toHaveBeenCalledWith(expect.objectContaining({ _id: REVIEWER_ID }), { team: true });
      expect(securityAuditService.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'admin_onboarding_reviewer_created', actorId: ADMIN._id }));
      expect(out.invite).toEqual({ sent: true });
      expect(out.reviewer).toMatchObject({ email: 'asha@nabz.in', mfaEnrolled: false });
    });

    it('refuses a login ID outside the allowed domains', async () => {
      process.env.ONBOARDING_LOGIN_DOMAINS = 'nabz.in';
      await expect(team.create(ADMIN, { name: 'Asha Verma', email: 'asha@gmail.com' })).rejects.toThrow(/@nabz\.in/);
      expect(User.create).not.toHaveBeenCalled();
    });

    it('refuses an email that already has an account', async () => {
      User.exists.mockResolvedValue({ _id: 'x' });
      await expect(team.create(ADMIN, { name: 'Asha Verma', email: 'asha@nabz.in' })).rejects.toThrow(/already exists/);
    });
  });

  describe('suspend', () => {
    it('ends every session of a suspended reviewer', async () => {
      User.findOne = jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve({ _id: REVIEWER_ID, isActive: true }) }) }));
      User.updateOne = jest.fn().mockResolvedValue({});

      await team.setActive(ADMIN, REVIEWER_ID, false);

      expect(User.updateOne).toHaveBeenCalledWith(
        { _id: REVIEWER_ID, role: 'onboarding_reviewer' },
        { $set: { isActive: false }, $inc: { sessionVersion: 1 } }
      );
    });
  });

  describe('sign-in rules', () => {
    it('always needs the authenticator app', () => {
      expect(adminMfa.isAdminRole('onboarding_reviewer')).toBe(true);
    });

    it('signs in only through the onboarding portal', () => {
      expect(isRoleAllowedInPortal('onboarding', 'onboarding_reviewer')).toBe(true);
      expect(isRoleAllowedInPortal('admin', 'onboarding_reviewer')).toBe(false);
      expect(isRoleAllowedInPortal('onboarding', 'platform_admin')).toBe(false);
    });
  });
});
