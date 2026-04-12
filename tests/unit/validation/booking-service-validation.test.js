/**
 * Booking Service Validation Tests
 *
 * Verifies:
 * - VAL-001: Surge pricing time format validation (regex + bounds)
 * - VAL-016: Service availability by city validation
 * - NULL-003: Cannot complete booking without startTime
 * - NULL-004: startTime null check prevents NaN duration
 */

const fs = require('fs');
const path = require('path');

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

const NurseBooking = require('../../../models/nurseBooking');
const bookingService = require('../../../services/bookingService');

describe('Booking Service Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('VAL-001: Surge pricing time format validation', () => {
    it('source code should have timeFormatRegex for HH:MM validation', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'bookingService.js'),
        'utf8'
      );

      // Extract createBooking method
      const methodMatch = src.match(/async createBooking[\s\S]*?(?=\n\s{2}async |\n\s{2}\/\*\*)/);
      expect(methodMatch).not.toBeNull();
      const methodBody = methodMatch[0];

      // Should validate time format with regex
      expect(methodBody).toMatch(/timeFormatRegex/);
      expect(methodBody).toMatch(/\\d\{1,2\}:\\d\{2\}/);
    });

    it('source code should validate surge hour bounds (0-23)', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'bookingService.js'),
        'utf8'
      );

      const methodMatch = src.match(/async createBooking[\s\S]*?(?=\n\s{2}async |\n\s{2}\/\*\*)/);
      const methodBody = methodMatch[0];

      // Should check hour boundaries
      expect(methodBody).toMatch(/start < 0|start > 23|end < 0|end > 23/);
      expect(methodBody).toMatch(/isNaN\(start\)|isNaN\(end\)/);
    });

    it('source code should validate scheduled date/time format', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'bookingService.js'),
        'utf8'
      );

      expect(src).toContain('Invalid scheduled date/time format');
      expect(src).toMatch(/isNaN\(bookingDate\.getTime\(\)\)/);
    });
  });

  describe('VAL-016: Service availability by city', () => {
    it('source code should validate service availability by city (case-insensitive)', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'patient-booking-service', 'src', 'services', 'bookingService.js'),
        'utf8'
      );

      expect(src).toMatch(/availableCities/);
      expect(src).toMatch(/toLowerCase\(\)/);
      expect(src).toMatch(/not available in/);
    });
  });

  describe('NULL-003: Cannot complete booking without startTime', () => {
    it('should throw ValidationError when completing booking without startTime', async () => {
      const mockBooking = {
        _id: 'booking1',
        patient: { toString: () => 'patient1' },
        serviceProvider: { toString: () => 'provider1' },
        status: 'IN_PROGRESS',
        actualService: {},  // No startTime
        statusHistory: [],
        save: jest.fn().mockResolvedValue(true)
      };
      NurseBooking.findById.mockResolvedValue(mockBooking);

      await expect(
        bookingService.updateStatus('booking1', 'COMPLETED', 'provider1', '', 'nurse')
      ).rejects.toThrow(/Cannot complete booking without a start time/);
    });
  });

  describe('NULL-004: startTime presence check before duration calc', () => {
    it('source code should check startTime exists before calculating duration', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'bookingService.js'),
        'utf8'
      );

      // Extract updateStatus method
      const methodMatch = src.match(/async updateStatus[\s\S]*?(?=\n\s{2}async |\n\s{2}\/\*\*)/);
      expect(methodMatch).not.toBeNull();
      const methodBody = methodMatch[0];

      // Should check startTime before calculating duration
      expect(methodBody).toMatch(/!booking\.actualService\.startTime/);
      expect(methodBody).toContain('Cannot complete booking without a start time');
    });
  });
});
