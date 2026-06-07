/**
 * Service Miscellaneous Validation Tests
 *
 * Verifies:
 * - VAL-008: String-based time comparison fix (minutes arithmetic)
 * - VAL-009: Page/limit clamping with Math.max/min
 * - VAL-011: recipientModel allowlist validation
 * - VAL-017: ObjectId constructor compatibility
 * - NULL-001: acceptedApp.applicant null guard in analytics
 * - NULL-002: duty.createdAt null guard in analytics
 * - ERR-009: createError helper attaches statusCode
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const OBJECT_ID_SCAN_DIRECTORIES = [
  'config',
  'constants',
  'controllers',
  'middleware',
  'models',
  'routes',
  'services',
  'utils',
  'validators'
];
const OBJECT_ID_SCAN_ROOT_FILES = ['app.js', 'server.js'];
const RAW_OBJECT_ID_PATTERN = /(?<!new\s)mongoose\.Types\.ObjectId\s*\(/;

function listJavaScriptFiles(directoryPath) {
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...listJavaScriptFiles(fullPath));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

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

  describe('VAL-017: ObjectId constructor compatibility', () => {
    it('should not use raw mongoose.Types.ObjectId(...) in production JavaScript files', () => {
      const filesToScan = [
        ...OBJECT_ID_SCAN_DIRECTORIES.flatMap((relativeDir) =>
          listJavaScriptFiles(path.join(ROOT, relativeDir))
        ),
        ...OBJECT_ID_SCAN_ROOT_FILES
          .map((relativeFile) => path.join(ROOT, relativeFile))
          .filter((fullPath) => fs.existsSync(fullPath))
      ];

      const offenders = filesToScan
        .map((fullPath) => ({
          file: path.relative(ROOT, fullPath),
          source: fs.readFileSync(fullPath, 'utf8')
        }))
        .filter(({ source }) => RAW_OBJECT_ID_PATTERN.test(source))
        .map(({ file }) => file);

      expect(offenders).toEqual([]);
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

    it('source code patient updateProfile should use validated query-update options', () => {
      const patientServiceSrc = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'patient-booking-service', 'src', 'services', 'patientService.js'),
        'utf8'
      );
      const sharedOptionsSrc = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'utils', 'queryUpdateOptions.js'),
        'utf8'
      );

      expect(patientServiceSrc).toMatch(/queryUpdateOptions/);
      expect(patientServiceSrc).toMatch(/VALIDATED_QUERY_UPDATE_OPTIONS/);
      expect(sharedOptionsSrc).toMatch(/runValidators:\s*true/);
      expect(sharedOptionsSrc).toMatch(/context:\s*['"]query['"]/);
    });
  });
});
