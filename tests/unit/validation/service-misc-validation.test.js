/**
 * Service Miscellaneous Validation Tests
 *
 * Verifies:
 * - VAL-009: Page/limit clamping with Math.max/min
 * - VAL-011: recipientModel allowlist validation
 * - VAL-017: ObjectId constructor compatibility
 * - NULL-001: acceptedApp.applicant null guard in analytics
 * - NULL-002: duty.createdAt null guard in analytics
 * - ERR-009: patient profile query updates validate their payloads
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

  describe('ERR-009: validated patient profile query updates', () => {
    it('patient query updates should use shared validated options', () => {
      const patientServiceSrc = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'services', 'patientService.js'),
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
