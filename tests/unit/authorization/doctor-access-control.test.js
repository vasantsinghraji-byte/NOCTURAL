/**
 * Doctor Access Control Tests
 *
 * Verifies:
 * - AUTH-001: Hospital boundary enforcement in grantAccess()
 * - AUTH-004: Token constraint validation (expiresAt, maxUsage)
 * - AUTH-005: Usage recording failure isolation in getPatientDataForDoctor()
 */

jest.mock('../../../models/healthAccessToken');
jest.mock('../../../models/healthDataAccessLog', () => ({
  logAccess: jest.fn()
}));
jest.mock('../../../models/healthRecord');
jest.mock('../../../models/healthMetric');
jest.mock('../../../models/doctorNote');
jest.mock('../../../models/emergencySummary');
jest.mock('../../../models/patient');
jest.mock('../../../models/user');
jest.mock('../../../models/nurseBooking');
jest.mock('../../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  logSecurity: jest.fn()
}));
jest.mock('../../../utils/errors', () => ({
  ValidationError: class ValidationError extends Error {
    constructor(m) { super(m); this.name = 'ValidationError'; }
  },
  NotFoundError: class NotFoundError extends Error {
    constructor(t, id) { super(`${t} not found`); this.name = 'NotFoundError'; }
  },
  AuthorizationError: class AuthorizationError extends Error {
    constructor(m) { super(m); this.name = 'AuthorizationError'; }
  }
}));

const HealthAccessToken = require('../../../models/healthAccessToken');
const Patient = require('../../../models/patient');
const User = require('../../../models/user');
const NurseBooking = require('../../../models/nurseBooking');
const HealthRecord = require('../../../models/healthRecord');
const logger = require('../../../utils/logger');
const doctorAccessService = require('../../../services/doctorAccessService');

describe('Phase 3 — Doctor Access Control', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const setupGrantAccessMocks = (overrides = {}) => {
    Patient.findById.mockResolvedValue(overrides.patient || { _id: 'patient1', name: 'Test Patient' });

    User.findById
      .mockResolvedValueOnce(overrides.doctor || { _id: 'doctor1', name: 'Dr. Test', role: 'doctor', hospital: 'hospitalA' })  // doctor lookup
      .mockResolvedValueOnce(overrides.admin || { _id: 'admin1', name: 'Admin', role: 'admin', hospital: 'hospitalA' });  // admin lookup

    if (overrides.hospitalProviders !== undefined) {
      User.find.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          then: jest.fn(cb => Promise.resolve(cb(overrides.hospitalProviders || [])))
        })
      });
    }

    NurseBooking.exists.mockResolvedValue(overrides.patientHasBooking !== undefined ? overrides.patientHasBooking : true);

    HealthAccessToken.generateToken.mockResolvedValue({
      tokenId: 'token123',
      token: 'abc',
      expiresAt: new Date(Date.now() + 86400000)
    });
  };

  describe('AUTH-001: Hospital boundary enforcement', () => {
    it('should reject when doctor is from a different hospital than admin', async () => {
      setupGrantAccessMocks({
        doctor: { _id: 'doctor1', name: 'Dr. Test', role: 'doctor', hospital: 'hospitalB' },
        admin: { _id: 'admin1', name: 'Admin', role: 'admin', hospital: 'hospitalA' }
      });

      await expect(
        doctorAccessService.grantAccess({
          patientId: 'patient1',
          doctorId: 'doctor1',
          adminId: 'admin1',
          grantReason: 'Test'
        })
      ).rejects.toThrow(/outside your hospital/);

      expect(logger.logSecurity).toHaveBeenCalledWith(
        'cross_hospital_access_attempt',
        expect.any(Object)
      );
    });

    it('should reject when patient has no bookings with admin hospital', async () => {
      setupGrantAccessMocks({
        doctor: { _id: 'doctor1', name: 'Dr. Test', role: 'doctor', hospital: 'hospitalA' },
        admin: { _id: 'admin1', name: 'Admin', role: 'admin', hospital: 'hospitalA' },
        hospitalProviders: [{ _id: 'prov1' }],
        patientHasBooking: null  // no booking found
      });

      await expect(
        doctorAccessService.grantAccess({
          patientId: 'patient1',
          doctorId: 'doctor1',
          adminId: 'admin1',
          grantReason: 'Test'
        })
      ).rejects.toThrow(/no bookings with your hospital/);
    });

    it('should allow super-admin (no hospital field) to grant cross-hospital access', async () => {
      setupGrantAccessMocks({
        doctor: { _id: 'doctor1', name: 'Dr. Test', role: 'doctor', hospital: 'hospitalB' },
        admin: { _id: 'admin1', name: 'SuperAdmin', role: 'admin' }  // no hospital field
      });

      const result = await doctorAccessService.grantAccess({
        patientId: 'patient1',
        doctorId: 'doctor1',
        adminId: 'admin1',
        grantReason: 'Emergency'
      });

      expect(result).toBeDefined();
      expect(result.tokenId).toBe('token123');
    });
  });

  describe('AUTH-004: Token constraint validation', () => {
    it('should reject expiresAt in the past', async () => {
      setupGrantAccessMocks();

      await expect(
        doctorAccessService.grantAccess({
          patientId: 'patient1',
          doctorId: 'doctor1',
          adminId: 'admin1',
          grantReason: 'Test',
          expiresAt: new Date(Date.now() - 86400000).toISOString()  // yesterday
        })
      ).rejects.toThrow(/must be a future date/);
    });

    it('should reject invalid expiresAt string', async () => {
      setupGrantAccessMocks();

      await expect(
        doctorAccessService.grantAccess({
          patientId: 'patient1',
          doctorId: 'doctor1',
          adminId: 'admin1',
          grantReason: 'Test',
          expiresAt: 'not-a-date'
        })
      ).rejects.toThrow(/must be a valid date/);
    });

    it('should reject maxUsage of 0', async () => {
      setupGrantAccessMocks();

      await expect(
        doctorAccessService.grantAccess({
          patientId: 'patient1',
          doctorId: 'doctor1',
          adminId: 'admin1',
          grantReason: 'Test',
          maxUsage: 0
        })
      ).rejects.toThrow(/must be a positive integer/);
    });

    it('should reject non-integer maxUsage', async () => {
      setupGrantAccessMocks();

      await expect(
        doctorAccessService.grantAccess({
          patientId: 'patient1',
          doctorId: 'doctor1',
          adminId: 'admin1',
          grantReason: 'Test',
          maxUsage: 2.5
        })
      ).rejects.toThrow(/must be a positive integer/);
    });
  });

  describe('AUTH-005: Usage recording failure isolation', () => {
    it('should still grant access when recordUsage() throws', async () => {
      const mockToken = {
        _id: 'token1',
        allowedResources: ['HEALTH_RECORD'],
        booking: 'booking1',
        recordUsage: jest.fn().mockRejectedValue(new Error('Redis down'))
      };

      HealthAccessToken.hasAccess = jest.fn().mockResolvedValue(mockToken);
      User.findById.mockResolvedValue({ _id: 'doctor1', name: 'Dr. Test', role: 'doctor' });
      HealthRecord.getLatestApproved = jest.fn().mockResolvedValue({ _id: 'record1' });

      const result = await doctorAccessService.getPatientDataForDoctor(
        'doctor1', 'patient1', 'HEALTH_RECORD', { ipAddress: '127.0.0.1' }
      );

      // Access should succeed despite usage recording failure
      expect(result).toBeDefined();
      expect(mockToken.recordUsage).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to record token usage'),
        expect.any(Object)
      );
    });
  });
});
