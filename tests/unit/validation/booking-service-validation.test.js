/**
 * Booking Service Validation Tests
 *
 * Verifies:
 * - VAL-001: Surge pricing time format validation (regex + bounds)
 * - TZ-014: Surge pricing uses explicit client timezone offsets
 * - PERF-013: Review aggregate uses pipeline + supporting index
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
    constructor(t, _id) { super(`${t} not found`); this.name = 'NotFoundError'; }
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
      expect(src).toMatch(/TIME_FORMAT_REGEX/);
      expect(src).toMatch(/\\d\{1,2\}:\\d\{2\}/);
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
      expect(src).toMatch(/Number\.isNaN\(bookingDate\.getTime\(\)\)/);
    });
  });

  describe('TZ-014: Explicit timezone offset contract', () => {
    it('source code should resolve surge pricing hour using an explicit timezone offset instead of server-local Date parsing', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'bookingService.js'),
        'utf8'
      );

      expect(src).toMatch(/resolveScheduledLocalHour/);
      expect(src).toMatch(/scheduledTimezoneOffsetMinutes/);
      expect(src).toMatch(/formatUtcOffset/);
      expect(src).not.toContain('new Date(`${scheduledDate}T${scheduledTime}`)');
    });

    it('route validation should require scheduledTimezoneOffsetMinutes on booking creation', () => {
      const routesSrc = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'routes', 'booking.js'),
        'utf8'
      );

      expect(routesSrc).toMatch(/body\('scheduledTimezoneOffsetMinutes'\)/);
      expect(routesSrc).toContain('Scheduled timezone offset is required');
    });

    it('route validation should require a valid scheduledTimezone on booking creation', () => {
      const routesSrc = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'routes', 'booking.js'),
        'utf8'
      );
      const modelSrc = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'models', 'nurseBooking.js'),
        'utf8'
      );

      expect(routesSrc).toMatch(/body\('scheduledTimezone'\)/);
      expect(routesSrc).toContain('Scheduled timezone is required');
      expect(routesSrc).toContain('valid IANA timezone');
      expect(modelSrc).toContain('scheduledTimezone: {');
      expect(modelSrc).toContain('scheduledTimezoneOffsetMinutes: {');
    });
  });

  describe('PERF-013: Review aggregate and index contract', () => {
    it('source code should aggregate provider review stats instead of loading reviewed bookings into memory', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'bookingService.js'),
        'utf8'
      );

      const methodMatch = src.match(/async syncProviderReviewStats[\s\S]*?(?=\n\s{2}async |\n\s{2}\/\*\*)/);
      expect(methodMatch).not.toBeNull();
      const methodBody = methodMatch[0];

      expect(methodBody).toMatch(/NurseBooking\.aggregate/);
      expect(methodBody).toMatch(/\$group/);
      expect(methodBody).toMatch(/\$avg:\s*['"]\$rating\.stars['"]/);
      expect(methodBody).not.toMatch(/NurseBooking\.find\(/);
    });

    it('source code should gate provider review aggregate recompute on aggregate-driving review field changes', () => {
      const bookingServiceSrc = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'bookingService.js'),
        'utf8'
      );
      const aggregateHelperSrc = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'utils', 'bookingReviewAggregate.js'),
        'utf8'
      );

      expect(bookingServiceSrc).toMatch(/syncProviderReviewStatsIfNeeded/);
      expect(bookingServiceSrc).toMatch(/bookingReviewAggregate/);
      expect(bookingServiceSrc).toMatch(/hasReviewAggregateStateChanged/);
      expect(aggregateHelperSrc).toMatch(/normalizeReviewAggregateState/);
      expect(aggregateHelperSrc).toMatch(/previousState\.stars !== nextState\.stars/);
      expect(aggregateHelperSrc).toMatch(/previousState\.hasRatedAt !== nextState\.hasRatedAt/);
    });

    it('booking model should define the provider review aggregate index', () => {
      const modelSrc = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'models', 'nurseBooking.js'),
        'utf8'
      );

      expect(modelSrc).toContain("NurseBookingSchema.index({ serviceProvider: 1, 'rating.ratedAt': 1 });");
    });
  });

  describe('NULL-003: Cannot complete booking without startTime', () => {
    it('should throw ValidationError when completing booking without startTime', async () => {
      const mockBooking = {
        _id: '000000000000000000000001',
        patient: { toString: () => '000000000000000000000002' },
        serviceProvider: { toString: () => '000000000000000000000003' },
        status: 'IN_PROGRESS',
        actualService: {},  // No startTime
        statusHistory: [],
        save: jest.fn().mockResolvedValue(true)
      };
      NurseBooking.findById.mockResolvedValue(mockBooking);

      await expect(
        bookingService.updateStatus(
          '000000000000000000000001',
          'COMPLETED',
          '000000000000000000000003',
          '',
          'nurse'
        )
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

  describe('REVIEW-010: Booking review route contract', () => {
    it('should expose explicit booking review CRUD routes in the main API', () => {
      const routesSrc = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'routes', 'booking.js'),
        'utf8'
      );

      expect(routesSrc).toMatch(/router\.post\(\s*['"`]\/:id\/review['"`]/);
      expect(routesSrc).toMatch(/router\.put\(\s*['"`]\/:id\/review['"`]/);
      expect(routesSrc).toMatch(/router\.delete\(\s*['"`]\/:id\/review['"`]/);
      expect(routesSrc).not.toMatch(/router\.patch\(\s*['"`]\/:id\/review['"`]/);
    });

    it('should restrict booking review mutations to authenticated patients', () => {
      const routesSrc = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'routes', 'booking.js'),
        'utf8'
      );

      const addReviewRouteMatch = routesSrc.match(
        /router\.post\(\s*['"`]\/:id\/review['"`][\s\S]*?addReview\s*\)/
      );
      const updateReviewRouteMatch = routesSrc.match(
        /router\.put\(\s*['"`]\/:id\/review['"`][\s\S]*?updateReview\s*\)/
      );
      const deleteReviewRouteMatch = routesSrc.match(
        /router\.delete\(\s*['"`]\/:id\/review['"`][\s\S]*?deleteReview\s*\)/
      );

      expect(addReviewRouteMatch).not.toBeNull();
      expect(updateReviewRouteMatch).not.toBeNull();
      expect(deleteReviewRouteMatch).not.toBeNull();
      expect(addReviewRouteMatch[0]).toMatch(/authorize\(\s*['"`]patient['"`]\s*\)/);
      expect(updateReviewRouteMatch[0]).toMatch(/authorize\(\s*['"`]patient['"`]\s*\)/);
      expect(deleteReviewRouteMatch[0]).toMatch(/authorize\(\s*['"`]patient['"`]\s*\)/);
    });

    it('should verify booking ownership before addReview writes rating data', () => {
      const bookingServiceSrc = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'bookingService.js'),
        'utf8'
      );

      const methodMatch = bookingServiceSrc.match(
        /async addReview[\s\S]*?(?=\n\s{2}async |\n\s{2}\/\*\*)/
      );

      expect(methodMatch).not.toBeNull();
      expect(methodMatch[0]).toMatch(/booking\.patient\.toString\(\)\s*!==\s*safePatientId\.toString\(\)/);
      expect(methodMatch[0]).toMatch(/throw new AuthorizationError/);
      expect(methodMatch[0].indexOf('throw new AuthorizationError')).toBeLessThan(
        methodMatch[0].indexOf('booking.rating =')
      );
    });
  });
});
