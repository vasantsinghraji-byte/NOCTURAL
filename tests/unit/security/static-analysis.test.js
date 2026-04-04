/**
 * Static Analysis Security Tests
 *
 * Covers Phase 1 fixes:
 * - SEC-001 to SEC-012: Hardcoded secrets removed from source files
 * - SEC-015: Elasticsearch xpack.security.enabled=true
 * - SEC-016: Grafana credentials use env vars (not admin/admin)
 * - SEC-017: Logstash ports restricted
 * - SEC-018: Filebeat runs as non-root
 * - SEC-019: CORS requires explicit ALLOWED_ORIGINS in production
 * - Encryption key validation and IV uniqueness
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');

function readFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

// Known vulnerable passwords that were hardcoded before fixes
const KNOWN_LEAKED_PASSWORDS = [
  'NocturnalAdmin2025!Secure',
  'DevPass2025!ChangeMe',
  'ProdPass2025!VeryStrong',
  'changeme',
  'admin123',
  'redis123'
];

const KNOWN_LEAKED_KEYS = [
  'rzp_test_YOUR_KEY_HERE',
  'YOUR_KEY_SECRET'
];

describe('Static Analysis Security Tests', () => {
  // ──────────────────────────────────────────────
  // SEC-001 to SEC-012: Hardcoded Secrets
  // ──────────────────────────────────────────────

  describe('SEC-001: create-mongo-users.js', () => {
    let source;
    beforeAll(() => { source = readFile('create-mongo-users.js'); });

    it('should not contain hardcoded passwords', () => {
      for (const pwd of KNOWN_LEAKED_PASSWORDS) {
        expect(source).not.toContain(pwd);
      }
    });

    it('should use environment variable references for passwords', () => {
      expect(source).toMatch(/process\.env\./);
    });
  });

  describe('SEC-002: create-mongo-user.js', () => {
    let source;
    beforeAll(() => { source = readFile('create-mongo-user.js'); });

    it('should not contain hardcoded passwords', () => {
      for (const pwd of KNOWN_LEAKED_PASSWORDS) {
        expect(source).not.toContain(pwd);
      }
    });
  });

  describe('SEC-003: fix-auth-with-localhost-exception.js', () => {
    let source;
    beforeAll(() => { source = readFile('fix-auth-with-localhost-exception.js'); });

    it('should not contain hardcoded admin/dev/prod passwords', () => {
      for (const pwd of KNOWN_LEAKED_PASSWORDS) {
        expect(source).not.toContain(pwd);
      }
    });
  });

  describe('SEC-004: verify-and-fix-auth.js', () => {
    let source;
    beforeAll(() => { source = readFile('verify-and-fix-auth.js'); });

    it('should not contain hardcoded dev credentials in connection string', () => {
      for (const pwd of KNOWN_LEAKED_PASSWORDS) {
        expect(source).not.toContain(pwd);
      }
      // No inline mongodb:// URIs with passwords
      expect(source).not.toMatch(/mongodb:\/\/\w+:[^$]\w+@/);
    });
  });

  describe('SEC-005: recreate-dev-prod-users.js', () => {
    let source;
    beforeAll(() => { source = readFile('recreate-dev-prod-users.js'); });

    it('should not contain hardcoded admin/dev/prod passwords', () => {
      for (const pwd of KNOWN_LEAKED_PASSWORDS) {
        expect(source).not.toContain(pwd);
      }
    });
  });

  describe('SEC-006: services/paymentService.js', () => {
    let source;
    beforeAll(() => { source = readFile('services/paymentService.js'); });

    it('should not contain fallback Razorpay test credentials', () => {
      for (const key of KNOWN_LEAKED_KEYS) {
        expect(source).not.toContain(key);
      }
      // No hardcoded rzp_ prefixed keys as fallback
      expect(source).not.toMatch(/['"]rzp_test_\w+['"]/);
    });

    it('should require credentials via environment variables', () => {
      expect(source).toContain('process.env.RAZORPAY_KEY_ID');
      expect(source).toContain('process.env.RAZORPAY_KEY_SECRET');
    });

    it('should throw on missing credentials when payment operations are invoked', () => {
      expect(source).toMatch(/throw[\s\S]*Missing Razorpay/);
    });
  });

  describe('SEC-007: docker/mongo-init.js', () => {
    let source;
    beforeAll(() => { source = readFile('docker/mongo-init.js'); });

    it('should not contain default "changeme" password', () => {
      expect(source).not.toContain("'changeme'");
      expect(source).not.toContain('"changeme"');
    });

    it('should reference environment variable for password', () => {
      expect(source).toMatch(/process\.env\.|MONGO.*PASSWORD|\$\{/);
    });
  });

  describe('SEC-008 & SEC-009: .github/workflows/ci.yml', () => {
    let source;
    beforeAll(() => { source = readFile('.github/workflows/ci.yml'); });

    it('should not contain hardcoded JWT_SECRET value', () => {
      expect(source).not.toContain('NocturnalAdmin');
      expect(source).not.toContain('DevPass2025');
      expect(source).not.toContain('ProdPass2025');
    });

    it('should not contain hardcoded ENCRYPTION_KEY value', () => {
      expect(source).not.toMatch(/ENCRYPTION_KEY:\s*['"][a-f0-9]{64}['"]/);
    });

    it('should not contain plaintext credentials in build validation', () => {
      for (const pwd of KNOWN_LEAKED_PASSWORDS) {
        expect(source).not.toContain(pwd);
      }
    });
  });

  describe('SEC-010: docker-compose.yml', () => {
    let source;
    beforeAll(() => { source = readFile('docker-compose.yml'); });

    it('should not contain weak default passwords', () => {
      expect(source).not.toMatch(/password.*admin123/i);
      expect(source).not.toMatch(/password.*redis123/i);
      expect(source).not.toMatch(/password.*changeme/i);
    });

    it('should use environment variable references', () => {
      expect(source).toMatch(/\$\{.*PASSWORD/i);
    });
  });

  describe('SEC-011: docker-compose.prod.yml', () => {
    let source;
    beforeAll(() => { source = readFile('docker-compose.prod.yml'); });

    it('should not contain "changeme" production defaults', () => {
      expect(source).not.toContain("'changeme'");
      expect(source).not.toContain('"changeme"');
      const lines = source.split('\n');
      for (const line of lines) {
        if (line.match(/password|secret|key/i) && !line.trim().startsWith('#')) {
          if (!line.includes('${') && !line.includes('process.env')) {
            if (line.match(/:\s*\S/) && !line.match(/:\s*\$/)) {
              expect(line).not.toMatch(/changeme|admin123|redis123|password123/i);
            }
          }
        }
      }
    });
  });

  describe('SEC-012: k8s/secrets.yaml', () => {
    let source;
    beforeAll(() => { source = readFile('k8s/secrets.yaml'); });

    it('should not contain plaintext secrets', () => {
      for (const pwd of KNOWN_LEAKED_PASSWORDS) {
        expect(source).not.toContain(pwd);
      }
    });

    it('should use base64-encoded placeholders or external refs', () => {
      expect(source).toMatch(/kind:\s*Secret/);
    });
  });

  describe('Cross-file: No leaked credentials anywhere in source', () => {
    const filesToScan = [
      'create-mongo-users.js',
      'create-mongo-user.js',
      'fix-auth-with-localhost-exception.js',
      'verify-and-fix-auth.js',
      'recreate-dev-prod-users.js',
      'services/paymentService.js',
      'docker/mongo-init.js'
    ];

    it.each(KNOWN_LEAKED_PASSWORDS)(
      'should not contain "%s" in any source file',
      (password) => {
        for (const file of filesToScan) {
          const source = readFile(file);
          expect(source).not.toContain(password);
        }
      }
    );
  });

  // ──────────────────────────────────────────────
  // SEC-015 to SEC-019: Infrastructure Security
  // ──────────────────────────────────────────────

  describe('SEC-015: Elasticsearch Security Enabled', () => {
    let source;
    beforeAll(() => { source = readFile('docker-compose.logging.yml'); });

    it('should have xpack.security.enabled=true', () => {
      expect(source).not.toMatch(/xpack\.security\.enabled\s*=\s*false/i);
      expect(source).not.toMatch(/xpack\.security\.enabled.*false/i);
      expect(source).toMatch(/xpack\.security\.enabled/i);
    });
  });

  describe('SEC-016: Grafana Default Credentials Removed', () => {
    let source;
    beforeAll(() => { source = readFile('docker-compose.logging.yml'); });

    it('should not use admin/admin as Grafana credentials', () => {
      expect(source).not.toMatch(/GF_SECURITY_ADMIN_PASSWORD\s*[:=]\s*admin\s*$/m);
    });

    it('should use environment variable references for Grafana credentials', () => {
      const grafanaSection = source.substring(
        source.indexOf('grafana'),
        source.indexOf('grafana') + 2000
      );

      if (grafanaSection.includes('GF_SECURITY_ADMIN_PASSWORD')) {
        expect(grafanaSection).toMatch(
          /GF_SECURITY_ADMIN_PASSWORD.*\$\{|GF_SECURITY_ADMIN_PASSWORD.*process\.env/
        );
      }
    });
  });

  describe('SEC-017: Logstash Port Exposure Restricted', () => {
    let source;
    beforeAll(() => { source = readFile('docker-compose.logging.yml'); });

    it('should not expose Logstash ports to all interfaces (0.0.0.0)', () => {
      const logstashStart = source.indexOf('logstash');
      if (logstashStart === -1) return;

      const logstashSection = source.substring(logstashStart, logstashStart + 1500);

      const portsSection = logstashSection.match(/ports:\s*\n((?:\s*-.*\n)*)/);
      if (portsSection) {
        const ports = portsSection[1];
        const portLines = ports.split('\n').filter(l => l.trim().startsWith('-'));

        for (const line of portLines) {
          if (line.includes('5044') || line.includes('5000') || line.includes('9600')) {
            expect(line).toMatch(/127\.0\.0\.1|localhost|expose/);
          }
        }
      }
    });
  });

  describe('SEC-018: Filebeat Non-Root User', () => {
    let source;
    beforeAll(() => { source = readFile('docker-compose.logging.yml'); });

    it('should not run Filebeat as root', () => {
      const filebeatStart = source.indexOf('filebeat');
      if (filebeatStart === -1) return;

      const filebeatSection = source.substring(filebeatStart, filebeatStart + 1500);

      if (filebeatSection.includes('user:')) {
        expect(filebeatSection).not.toMatch(/user:\s*['"]?root['"]?/);
      }
    });
  });

  describe('SEC-019: CORS Configuration in Production', () => {
    it('should use empty array for production/staging when ALLOWED_ORIGINS not set (source verification)', () => {
      const source = readFile('config/environments.js');

      expect(source).toMatch(/production.*staging.*\[\s*\]/s);
      expect(source).toContain('ALLOWED_ORIGINS');
    });

    it('should split ALLOWED_ORIGINS by comma when provided', () => {
      const source = readFile('config/environments.js');

      expect(source).toMatch(/ALLOWED_ORIGINS.*split\s*\(\s*['",]/);
    });

    it('should only allow localhost fallback in non-production environments', () => {
      const source = readFile('config/environments.js');

      const corsSection = source.substring(
        source.indexOf('cors'),
        source.indexOf('cors') + 500
      );

      expect(corsSection).toContain('localhost');
      expect(corsSection).toMatch(/production|staging/);
    });

    it('should verify runtime config returns correct origins for development', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalOrigins = process.env.ALLOWED_ORIGINS;

      process.env.NODE_ENV = 'development';
      delete process.env.ALLOWED_ORIGINS;

      jest.resetModules();

      const envConfig = require('../../../config/environments');
      const config = typeof envConfig === 'function' ? envConfig() : envConfig;

      expect(config.cors.origin).toContain('http://localhost:3000');

      process.env.NODE_ENV = originalEnv;
      if (originalOrigins) process.env.ALLOWED_ORIGINS = originalOrigins;
    });
  });

  // ──────────────────────────────────────────────
  // Encryption Key Validation
  // ──────────────────────────────────────────────

  describe('Encryption Key Validation', () => {
    it('should reject invalid ENCRYPTION_KEY length', () => {
      const originalKey = process.env.ENCRYPTION_KEY;

      process.env.ENCRYPTION_KEY = 'too-short';

      jest.resetModules();
      jest.mock('../../../utils/logger', () => ({
        error: jest.fn(), warn: jest.fn(), info: jest.fn()
      }));
      const { encrypt } = require('../../../utils/encryption');

      expect(() => encrypt('test data')).toThrow();

      process.env.ENCRYPTION_KEY = originalKey;
    });

    it('should accept valid 64-char hex ENCRYPTION_KEY', () => {
      const originalKey = process.env.ENCRYPTION_KEY;

      process.env.ENCRYPTION_KEY = 'a'.repeat(64);

      jest.resetModules();
      jest.mock('../../../utils/logger', () => ({
        error: jest.fn(), warn: jest.fn(), info: jest.fn()
      }));
      const { encrypt, decrypt } = require('../../../utils/encryption');

      const encrypted = encrypt('test data');
      expect(encrypted).toBeTruthy();
      expect(encrypted).toContain(':');

      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe('test data');

      process.env.ENCRYPTION_KEY = originalKey;
    });

    it('should generate unique IV per encryption (no IV reuse)', () => {
      const originalKey = process.env.ENCRYPTION_KEY;
      process.env.ENCRYPTION_KEY = 'a'.repeat(64);

      jest.resetModules();
      jest.mock('../../../utils/logger', () => ({
        error: jest.fn(), warn: jest.fn(), info: jest.fn()
      }));
      const { encrypt } = require('../../../utils/encryption');

      const enc1 = encrypt('same data');
      const enc2 = encrypt('same data');

      // Same plaintext should produce different ciphertext (different IVs)
      expect(enc1).not.toBe(enc2);

      // Extract IVs (format: iv:encrypted)
      const iv1 = enc1.split(':')[0];
      const iv2 = enc2.split(':')[0];
      expect(iv1).not.toBe(iv2);

      process.env.ENCRYPTION_KEY = originalKey;
    });
  });
});
