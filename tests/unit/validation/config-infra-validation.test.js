/**
 * Config & Infrastructure Validation Tests (Source Analysis)
 *
 * Verifies:
 * - VAL-012: JWT_SECRET minimum 64 characters for HS256
 * - VAL-013: ENCRYPTION_KEY strict hex regex (64 hex chars)
 * - VAL-014: Rate limiter keyGenerator uses user ID or IP
 * - VAL-015: MIME type + extension cross-validation in fileFilter
 * - ERR-007: GCS credentials parse failure handling (throws in production)
 * - ERR-008: Redis connection waits for 'ready' event with timeout
 */

const fs = require('fs');
const path = require('path');

const validateEnvSrc = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'config', 'validateEnv.js'),
  'utf8'
);

const storageSrc = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'config', 'storage.js'),
  'utf8'
);

const rateLimiterSrc = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'middleware', 'rateLimiter.js'),
  'utf8'
);

const redisSrc = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'config', 'redis.js'),
  'utf8'
);

const serverSrc = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'server.js'),
  'utf8'
);

const auditedScriptFiles = [
  'seed.js',
  'create-mongo-user.js',
  'create-mongo-users.js',
  'fix-auth-with-localhost-exception.js',
  'recreate-dev-prod-users.js',
  'verify-and-fix-auth.js',
  'scripts/monitor-db.js',
  'scripts/monitor-rate-limits.js',
  'scripts/re-encrypt-data.js',
  'scripts/seedServiceCatalog.js',
  'scripts/setup-replica-set.js'
];

describe('Phase 4 — Config & Infrastructure Validation', () => {
  describe('VAL-012: JWT_SECRET minimum 64 characters', () => {
    it('should validate JWT_SECRET length >= 64', () => {
      expect(validateEnvSrc).toContain('value.length < 64');
      expect(validateEnvSrc).toMatch(/JWT_SECRET must be at least 64 characters/);
    });

    it('should reject weak/default JWT_SECRET values', () => {
      expect(validateEnvSrc).toMatch(/\^.*secret.*test.*123.*abc/i);
    });
  });

  describe('VAL-013: ENCRYPTION_KEY hex regex validation', () => {
    it('should enforce exactly 64 hex characters with regex', () => {
      expect(validateEnvSrc).toMatch(/\[a-f0-9\]\{64\}/i);
    });

    it('should require AES-256 key format (32 bytes = 64 hex chars)', () => {
      expect(validateEnvSrc).toMatch(/AES-256/);
    });
  });

  describe('VAL-014: Rate limiter key generation', () => {
    it('should use user ID when available, otherwise IP', () => {
      expect(rateLimiterSrc).toMatch(/keyGenerator/);
      expect(rateLimiterSrc).toMatch(/req\.user\s*\?\s*req\.user\._id\s*:\s*req\.ip/);
    });
  });

  describe('VAL-015: MIME type + extension cross-validation', () => {
    it('should define ALLOWED_MIME_TYPES from MIME_EXTENSION_MAP', () => {
      expect(storageSrc).toContain('MIME_EXTENSION_MAP');
      expect(storageSrc).toContain('ALLOWED_MIME_TYPES');
    });

    it('should validate MIME type against allowlist in fileFilter', () => {
      expect(storageSrc).toMatch(/ALLOWED_MIME_TYPES\.includes\(file\.mimetype\)/);
    });

    it('should cross-validate file extension against claimed MIME type', () => {
      expect(storageSrc).toMatch(/MIME_EXTENSION_MAP\[file\.mimetype\]/);
      expect(storageSrc).toMatch(/allowedExtensions\.includes\(ext\)/);
    });
  });

  describe('ERR-007: GCS credentials parse error handling', () => {
    it('should wrap GCS_CREDENTIALS parsing in try-catch', () => {
      // Find the GCS_CREDENTIALS block
      const gcsBlock = storageSrc.match(/GCS_CREDENTIALS[\s\S]*?catch\s*\(e\)/);
      expect(gcsBlock).not.toBeNull();
    });

    it('should throw in production when GCS credentials parse fails', () => {
      expect(storageSrc).toMatch(/NODE_ENV.*===.*production/);
      expect(storageSrc).toContain('Failed to parse GCS_CREDENTIALS');
    });
  });

  describe('ERR-008: Redis connection confirmation', () => {
    it('should wait for ready event before marking connected', () => {
      expect(redisSrc).toMatch(/\.once\(['"]ready['"]/);
      expect(redisSrc).toContain('isConnected = true');
    });

    it('should implement connection timeout', () => {
      expect(redisSrc).toMatch(/connectTimeout|setTimeout/);
      expect(redisSrc).toMatch(/Redis connection timed out/);
    });

    it('should handle error event during connection', () => {
      expect(redisSrc).toMatch(/\.once\(['"]error['"]/);
    });
  });

  describe('ERR-009: Environment loaded before env-sensitive imports', () => {
    it('should call dotenv.config() before requiring local config modules in server.js', () => {
      const dotenvIndex = serverSrc.indexOf('dotenv.config()');
      const databaseIndex = serverSrc.indexOf("require('./config/database')");
      const rateLimitIndex = serverSrc.indexOf("require('./config/rateLimit')");
      const versionRoutesIndex = serverSrc.indexOf("require('./routes/v1')");

      expect(dotenvIndex).toBeGreaterThan(-1);
      expect(databaseIndex).toBeGreaterThan(-1);
      expect(rateLimitIndex).toBeGreaterThan(-1);
      expect(versionRoutesIndex).toBeGreaterThan(-1);

      expect(dotenvIndex).toBeLessThan(databaseIndex);
      expect(dotenvIndex).toBeLessThan(rateLimitIndex);
      expect(dotenvIndex).toBeLessThan(versionRoutesIndex);
    });

    it.each(auditedScriptFiles)('should load dotenv early in %s', (relativePath) => {
      const scriptSrc = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', relativePath),
        'utf8'
      );

      const dotenvIndex = scriptSrc.indexOf("require('dotenv').config()");
      const envIndex = scriptSrc.indexOf('process.env');

      expect(dotenvIndex).toBeGreaterThan(-1);

      if (envIndex !== -1) {
        expect(dotenvIndex).toBeLessThan(envIndex);
      }
    });
  });
});
