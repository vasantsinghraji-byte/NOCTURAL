/**
 * Service Miscellaneous Validation Tests
 *
 * Verifies:
 * - VAL-008: String-based time comparison fix (minutes arithmetic)
 * - VAL-009: Page/limit clamping with Math.max/min
 * - VAL-011: recipientModel allowlist validation
 * - NULL-001: acceptedApp.applicant null guard in analytics
 * - NULL-002: duty.createdAt null guard in analytics
 * - ERR-009: createError helper attaches statusCode
 */

const fs = require('fs');
const path = require('path');

// Mocks for VAL-011 runtime test
jest.mock('../../../models/notification');
jest.mock('../../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  logSecurity: jest.fn()
}));

describe('Phase 4 — Service Miscellaneous Validation', () => {
  describe('VAL-008: Time comparison uses minutes arithmetic (not string)', () => {
    it('should convert HH:MM to minutes for numeric comparison', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'patient-booking-service', 'src', 'services', 'serviceCatalogService.js'),
        'utf8'
      );

      // Should use numeric conversion: hours * 60 + minutes
      expect(src).toMatch(/\* 60 \+/);
      // Should NOT use direct string comparison for time slots
      const pricingMethod = src.match(/getServicePricing[\s\S]*?(?=\n\s{2}async |\n\s{2}\/\*\*|\n})/);
      if (pricingMethod) {
        // Should split(':') and map(Number) for proper parsing
        expect(pricingMethod[0]).toMatch(/split\(['"]:['"]/)
      }
    });
  });

  describe('VAL-009: Page/limit clamping', () => {
    it('source code should use Math.max/Math.min for bounds checking', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'dutyService.js'),
        'utf8'
      );

      const methodMatch = src.match(/async getAllDuties[\s\S]*?(?=\n\s{2}async |\n\s{2}\/\*\*)/);
      expect(methodMatch).not.toBeNull();
      const methodBody = methodMatch[0];

      // Page: Math.max to ensure minimum
      expect(methodBody).toMatch(/Math\.max\(.*page/);
      // Limit: Math.min to cap maximum + Math.max for minimum
      expect(methodBody).toMatch(/Math\.min\(.*Math\.max/);
      // Should use Math.floor for integer conversion
      expect(methodBody).toMatch(/Math\.floor/);
    });
  });

  describe('VAL-011: recipientModel allowlist', () => {
    it('source code should define VALID_RECIPIENT_MODELS allowlist', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'notificationService.js'),
        'utf8'
      );

      expect(src).toMatch(/VALID_RECIPIENT_MODELS\s*=\s*\[['"]User['"],\s*['"]Patient['"]\]/);
    });

    it('source code should reject invalid recipientModel', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'notificationService.js'),
        'utf8'
      );

      expect(src).toMatch(/!VALID_RECIPIENT_MODELS\.includes\(notificationData\.recipientModel\)/);
    });
  });

  describe('NULL-001: acceptedApp.applicant null guard', () => {
    it('source code should guard against null acceptedApp.applicant', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'analyticsService.js'),
        'utf8'
      );

      // Should check acceptedApp && acceptedApp.applicant before accessing properties
      expect(src).toMatch(/acceptedApp\s*&&\s*acceptedApp\.applicant/);
    });
  });

  describe('NULL-002: duty.createdAt null guard', () => {
    it('source code should guard against null duty.createdAt before date arithmetic', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'analyticsService.js'),
        'utf8'
      );

      // Should check duty.createdAt exists before using in Date calculation
      expect(src).toMatch(/duty\.createdAt\s*&&/);
    });
  });

  describe('ERR-009: createError helper with statusCode', () => {
    it('source code should define createError that attaches statusCode', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'patient-booking-service', 'src', 'services', 'patientService.js'),
        'utf8'
      );

      // Should have createError helper
      expect(src).toMatch(/const createError\s*=/);
      expect(src).toMatch(/err\.statusCode\s*=\s*statusCode/);
    });
  });
});
