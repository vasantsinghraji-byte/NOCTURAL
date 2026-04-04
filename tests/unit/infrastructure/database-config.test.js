/**
 * Database Configuration Tests (Source Analysis)
 *
 * Verifies:
 * - DB-001: MONGODB_URI has development default
 * - DB-002: Production pool size increased (maxPoolSize: 50, configurable)
 * - DB-003: writeConcern w:'majority' with journal and timeout
 * - DB-004: readPreference 'secondaryPreferred' for replica load balancing
 * - DB-005: update-user.js uses MONGODB_URI (not MONGO_URI)
 */

const fs = require('fs');
const path = require('path');

const envSrc = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'config', 'environments.js'),
  'utf8'
);

const dbSrc = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'config', 'database.js'),
  'utf8'
);

const updateUserSrc = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'update-user.js'),
  'utf8'
);

describe('Phase 6 — Database Configuration', () => {
  describe('DB-001: MONGODB_URI development default', () => {
    it('should provide localhost default for development', () => {
      expect(envSrc).toMatch(/MONGODB_URI.*development.*mongodb:\/\/localhost/s);
    });

    it('should NOT provide default for production (undefined when unset)', () => {
      // Production should rely on validateConfig() to catch missing URI
      expect(envSrc).toMatch(/development.*mongodb:\/\/localhost.*undefined/s);
    });
  });

  describe('DB-002: Production pool size configurable', () => {
    it('should set maxPoolSize to 50 for production', () => {
      expect(envSrc).toMatch(/maxPoolSize.*50/);
    });

    it('should support MONGODB_MAX_POOL_SIZE env var override', () => {
      expect(envSrc).toMatch(/MONGODB_MAX_POOL_SIZE/);
    });
  });

  describe('DB-003: writeConcern w:majority', () => {
    it('should set writeConcern to majority with journal', () => {
      expect(dbSrc).toMatch(/writeConcern.*w.*majority/s);
      expect(dbSrc).toMatch(/j:\s*true/);
    });

    it('should set wtimeout to prevent indefinite hangs', () => {
      expect(dbSrc).toMatch(/wtimeout:\s*10000/);
    });
  });

  describe('DB-004: readPreference for replica load balancing', () => {
    it('should default to secondaryPreferred', () => {
      expect(dbSrc).toMatch(/readPreference.*secondaryPreferred/);
    });

    it('should be configurable via MONGODB_READ_PREFERENCE env var', () => {
      expect(dbSrc).toMatch(/MONGODB_READ_PREFERENCE/);
    });
  });

  describe('DB-005: update-user.js uses correct env var', () => {
    it('should use MONGODB_URI (not MONGO_URI)', () => {
      expect(updateUserSrc).toMatch(/process\.env\.MONGODB_URI/);
      expect(updateUserSrc).not.toMatch(/process\.env\.MONGO_URI\b/);
    });
  });
});
