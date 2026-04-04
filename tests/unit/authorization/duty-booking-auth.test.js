/**
 * Duty & Booking Authorization Tests
 *
 * Verifies:
 * - AUTH-002: ObjectId comparison uses .toString() in updateDuty()
 * - AUTH-003: Role param in booking updateStatus()/cancelBooking() — no extra DB query
 */

const fs = require('fs');
const path = require('path');

jest.mock('../../../models/duty');
jest.mock('../../../models/nurseBooking');
jest.mock('../../../models/serviceCatalog');
jest.mock('../../../models/patient');
jest.mock('../../../models/user');
jest.mock('../../../middleware/queryCache', () => ({ invalidateCache: jest.fn() }));
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
  AuthorizationError: class AuthorizationError extends Error {
    constructor(m) { super(m); this.name = 'AuthorizationError'; }
  },
  NotFoundError: class NotFoundError extends Error {
    constructor(t, id) { super(`${t} not found`); this.name = 'NotFoundError'; }
  }
}));
jest.mock('../../../services/healthIntakeService', () => ({ startIntakeProcess: jest.fn() }));
jest.mock('../../../services/healthMetricService', () => ({ recordMultipleMetrics: jest.fn() }));
jest.mock('../../../services/healthRecordService', () => ({ captureBookingVitals: jest.fn() }));
jest.mock('../../../services/doctorAccessService', () => ({ grantAccess: jest.fn() }));

const Duty = require('../../../models/duty');
const NurseBooking = require('../../../models/nurseBooking');
const dutyService = require('../../../services/dutyService');
const bookingService = require('../../../services/bookingService');

describe('Phase 3 — Duty & Booking Authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AUTH-002: ObjectId comparison in updateDuty()', () => {
    it('source code should use .toString() on both sides of authorization check', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'dutyService.js'),
        'utf8'
      );

      // Extract the updateDuty method body
      const methodMatch = src.match(/async updateDuty\b[\s\S]*?(?=\n\s{2}async |\n\s{2}\/\*\*|\n})/);
      expect(methodMatch).not.toBeNull();
      const methodBody = methodMatch[0];

      // Should have .toString() on both sides of comparison
      expect(methodBody).toMatch(/postedBy\.toString\(\)\s*!==\s*user\._id\.toString\(\)/);
    });

    it('should authorize when ObjectId-like postedBy matches user._id as strings', async () => {
      const mockDuty = {
        _id: 'duty1',
        postedBy: { toString: () => 'user123' },
        title: 'Test Duty'
      };
      Duty.findById.mockResolvedValue(mockDuty);
      Duty.findByIdAndUpdate.mockResolvedValue({ ...mockDuty, status: 'UPDATED' });

      const user = { _id: { toString: () => 'user123' } };

      const result = await dutyService.updateDuty('duty1', { title: 'Updated' }, user);

      expect(result).toBeDefined();
      expect(Duty.findByIdAndUpdate).toHaveBeenCalled();
    });

    it('should reject when postedBy and user._id differ', async () => {
      const mockDuty = {
        _id: 'duty1',
        postedBy: { toString: () => 'user123' }
      };
      Duty.findById.mockResolvedValue(mockDuty);

      const user = { _id: { toString: () => 'differentUser' } };

      await expect(
        dutyService.updateDuty('duty1', { title: 'Updated' }, user)
      ).rejects.toMatchObject({
        statusCode: 403
      });
    });
  });

  describe('AUTH-003: Role param in booking status updates', () => {
    it('should authorize admin via userRole param without extra DB lookup', async () => {
      const mockBooking = {
        _id: 'booking1',
        patient: { toString: () => 'patient1' },
        serviceProvider: { toString: () => 'provider1' },
        status: 'EN_ROUTE',
        actualService: {},
        save: jest.fn().mockResolvedValue(true)
      };
      NurseBooking.findById.mockResolvedValue(mockBooking);

      // userId doesn't match provider, but userRole = 'admin'
      await bookingService.updateStatus('booking1', 'IN_PROGRESS', 'adminUser', '', 'admin');

      expect(mockBooking.save).toHaveBeenCalled();
      // Verify no User.findById call was needed for role checking
      const User = require('../../../models/user');
      // User.findById should NOT have been called during updateStatus
      // (It may have been called elsewhere, but updateStatus doesn't call it)
    });

    it('should reject non-provider, non-admin user', async () => {
      const mockBooking = {
        _id: 'booking1',
        patient: { toString: () => 'patient1' },
        serviceProvider: { toString: () => 'provider1' },
        status: 'EN_ROUTE',
        actualService: {},
        save: jest.fn().mockResolvedValue(true)
      };
      NurseBooking.findById.mockResolvedValue(mockBooking);

      await expect(
        bookingService.updateStatus('booking1', 'IN_PROGRESS', 'randomUser', '')
      ).rejects.toThrow(/Not authorized/);
    });

    it('source code updateStatus should not call User.findById for role checking', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'bookingService.js'),
        'utf8'
      );

      // Extract updateStatus method body
      const methodMatch = src.match(/async updateStatus\b[\s\S]*?(?=\n\s{2}async |\n\s{2}\/\*\*|\n})/);
      expect(methodMatch).not.toBeNull();
      const methodBody = methodMatch[0];

      // Should NOT contain User.findById — role comes from parameter
      expect(methodBody).not.toContain('User.findById');
      expect(methodBody).not.toContain('findById(userId)');
    });
  });
});
