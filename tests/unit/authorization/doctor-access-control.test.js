/**
 * Doctor Access Control Tests
 *
 * Verifies:
 * - AUTH-001: Hospital boundary enforcement in grantAccess()
 * - AUTH-004: Token constraint validation (expiresAt, maxUsage)
 * - AUTH-005: Usage recording failure isolation in getPatientDataForDoctor()
 */

const PATIENT_ID = '000000000000000000000001';
const DOCTOR_ID = '000000000000000000000002';
const ADMIN_ID = '000000000000000000000003';
const BOOKING_ID = '000000000000000000000004';
const HOSPITAL_A_ID = '100000000000000000000001';
const HOSPITAL_B_ID = '100000000000000000000002';

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
    constructor(t, _id) { super(`${t} not found`); this.name = 'NotFoundError'; }
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

describe('Authorization Unit: doctor access control rules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const setupGrantAccessMocks = (overrides = {}) => {
    Patient.findById.mockResolvedValue(overrides.patient || { _id: PATIENT_ID, name: 'Test Patient' });

    User.findById
      .mockResolvedValueOnce(overrides.doctor || { _id: DOCTOR_ID, name: 'Dr. Test', role: 'doctor', hospitalId: HOSPITAL_A_ID })  // doctor lookup
      .mockResolvedValueOnce(overrides.admin || { _id: ADMIN_ID, name: 'Admin', role: 'admin', hospitalId: HOSPITAL_A_ID });  // admin lookup

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
        doctor: { _id: DOCTOR_ID, name: 'Dr. Test', role: 'doctor', hospitalId: HOSPITAL_B_ID },
        admin: { _id: ADMIN_ID, name: 'Admin', role: 'admin', hospitalId: HOSPITAL_A_ID }
      });

      await expect(
        doctorAccessService.grantAccess({
          patientId: PATIENT_ID,
          doctorId: DOCTOR_ID,
          adminId: ADMIN_ID,
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
        doctor: { _id: DOCTOR_ID, name: 'Dr. Test', role: 'doctor', hospitalId: HOSPITAL_A_ID },
        admin: { _id: ADMIN_ID, name: 'Admin', role: 'admin', hospitalId: HOSPITAL_A_ID },
        hospitalProviders: [{ _id: 'prov1' }],
        patientHasBooking: null  // no booking found
      });

      await expect(
        doctorAccessService.grantAccess({
          patientId: PATIENT_ID,
          doctorId: DOCTOR_ID,
          adminId: ADMIN_ID,
          grantReason: 'Test'
        })
      ).rejects.toThrow(/no bookings with your hospital/);
    });

    it('should allow super-admin (no hospitalId field) to grant cross-hospital access', async () => {
      setupGrantAccessMocks({
        doctor: { _id: DOCTOR_ID, name: 'Dr. Test', role: 'doctor', hospitalId: HOSPITAL_B_ID },
        admin: { _id: ADMIN_ID, name: 'SuperAdmin', role: 'admin' }  // no hospitalId field
      });

      const result = await doctorAccessService.grantAccess({
        patientId: PATIENT_ID,
        doctorId: DOCTOR_ID,
        adminId: ADMIN_ID,
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
          patientId: PATIENT_ID,
          doctorId: DOCTOR_ID,
          adminId: ADMIN_ID,
          grantReason: 'Test',
          expiresAt: new Date(Date.now() - 86400000).toISOString()  // yesterday
        })
      ).rejects.toThrow(/must be a future date/);
    });

    it('should reject invalid expiresAt string', async () => {
      setupGrantAccessMocks();

      await expect(
        doctorAccessService.grantAccess({
          patientId: PATIENT_ID,
          doctorId: DOCTOR_ID,
          adminId: ADMIN_ID,
          grantReason: 'Test',
          expiresAt: 'not-a-date'
        })
      ).rejects.toThrow(/must be a valid date/);
    });

    it('should reject maxUsage of 0', async () => {
      setupGrantAccessMocks();

      await expect(
        doctorAccessService.grantAccess({
          patientId: PATIENT_ID,
          doctorId: DOCTOR_ID,
          adminId: ADMIN_ID,
          grantReason: 'Test',
          maxUsage: 0
        })
      ).rejects.toThrow(/must be a positive integer/);
    });

    it('should reject non-integer maxUsage', async () => {
      setupGrantAccessMocks();

      await expect(
        doctorAccessService.grantAccess({
          patientId: PATIENT_ID,
          doctorId: DOCTOR_ID,
          adminId: ADMIN_ID,
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
        booking: BOOKING_ID,
        recordUsage: jest.fn().mockRejectedValue(new Error('Redis down'))
      };

      HealthAccessToken.hasAccess = jest.fn().mockResolvedValue(mockToken);
      User.findById.mockResolvedValue({ _id: DOCTOR_ID, name: 'Dr. Test', role: 'doctor' });
      HealthRecord.getLatestApproved = jest.fn().mockResolvedValue({ _id: 'record1' });

      const result = await doctorAccessService.getPatientDataForDoctor(
        DOCTOR_ID, PATIENT_ID, 'HEALTH_RECORD', { ipAddress: '127.0.0.1' }
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
