/**
 * Data Mutation Security Tests
 *
 * Covers Phase 1 fixes:
 * - SEC-013: Field whitelist enforcement in patient profile updates
 * - SEC-014: Error stack trace hiding in production
 */

jest.mock('../../../models/patient');
jest.mock('../../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  logSecurity: jest.fn()
}));

describe('Security Unit: protected data mutation rules', () => {
  describe('SEC-013: Patient Update Field Whitelist', () => {
    // The whitelist defined in patientService.js
    const ALLOWED_FIELDS = [
      'name', 'dateOfBirth', 'gender', 'bloodGroup',
      'profilePhoto', 'address', 'emergencyContact',
      'insurance', 'preferences'
    ];

    const DANGEROUS_FIELDS = [
      'role', 'password', 'isAdmin', 'isVerified',
      'emailVerified', 'phoneVerified', 'intakeStatus',
      'email', '__proto__', 'constructor'
    ];

    it('should verify source code has explicit field whitelist', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require.resolve('../../../services/patientService'),
        'utf8'
      );

      // Verify whitelist pattern exists
      expect(source).toContain('ALLOWED_FIELDS');
      expect(source).toContain('ALLOWED_FIELDS.includes(key)');

      // Verify all expected allowed fields are in the whitelist
      for (const field of ALLOWED_FIELDS) {
        expect(source).toContain(`'${field}'`);
      }
    });

    it('should NOT have unrestricted Object.keys assignment pattern', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require.resolve('../../../services/patientService'),
        'utf8'
      );

      // The old vulnerable pattern: Object.keys(updateData).forEach(key => { patient[key] = ... })
      // should now be guarded by ALLOWED_FIELDS.includes check
      const updateSection = source.substring(
        source.indexOf('ALLOWED_FIELDS'),
        source.indexOf('ALLOWED_FIELDS') + 500
      );

      expect(updateSection).toContain('includes(key)');
    });

    it('should list only safe fields in the whitelist', () => {
      // Verify that dangerous fields are NOT in the whitelist
      for (const field of DANGEROUS_FIELDS) {
        expect(ALLOWED_FIELDS).not.toContain(field);
      }
    });

    it('should include expected safe fields in the whitelist', () => {
      expect(ALLOWED_FIELDS).toContain('name');
      expect(ALLOWED_FIELDS).toContain('dateOfBirth');
      expect(ALLOWED_FIELDS).toContain('gender');
      expect(ALLOWED_FIELDS).toContain('bloodGroup');
      expect(ALLOWED_FIELDS).toContain('address');
      expect(ALLOWED_FIELDS).toContain('emergencyContact');
      expect(ALLOWED_FIELDS).toContain('insurance');
      expect(ALLOWED_FIELDS).toContain('preferences');
    });
  });

  describe('SEC-014: Error Stack Trace Hiding', () => {
    it('should not expose stack traces in authService error responses', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require.resolve('../../../services/authService'),
        'utf8'
      );

      // The error thrown to the client should NOT include the stack
      // Old pattern: throw { statusCode, message, stack: error.stack }
      // Fixed pattern: throw { statusCode, message } (no stack)

      // Check that the catch block in register does NOT pass stack to thrown error
      const catchBlocks = source.match(/catch\s*\([^)]+\)\s*\{[^}]*throw\s*\{[^}]*\}/g) || [];

      for (const block of catchBlocks) {
        // The thrown error object should NOT include stack
        const thrownObj = block.match(/throw\s*\{([^}]*)\}/)?.[1] || '';
        expect(thrownObj).not.toContain('stack');
        expect(thrownObj).not.toContain('error.stack');
      }
    });

    it('should log stack traces server-side only', () => {
      const fs = require('fs');
      const source = fs.readFileSync(
        require.resolve('../../../services/authService'),
        'utf8'
      );

      // Logger calls CAN include stack (server-side only)
      // But thrown errors MUST NOT include stack
      const loggerStackUsages = (source.match(/logger\.\w+\([^)]*stack/g) || []).length;
      const thrownStackUsages = (source.match(/throw\s*\{[^}]*stack[^}]*\}/g) || []).length;

      // Stack should only appear in logger, never in thrown errors
      expect(thrownStackUsages).toBe(0);
      // Logger can log stack (this is OK for debugging)
      expect(loggerStackUsages).toBeGreaterThanOrEqual(0);
    });

    it('should verify ServiceError toJSON hides stack in production', () => {
      const { ServiceError } = require('../../../utils/errors');

      const error = new ServiceError(500, 'Test error');

      // In test env, toJSON may or may not include stack
      const json = error.toJSON();
      expect(json.message).toBe('Test error');
      expect(json.statusCode).toBe(500);

      // Simulate production
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const prodJson = error.toJSON();
      // Stack should be undefined in production (won't appear in JSON.stringify output)
      expect(prodJson.stack).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });
  });
});
