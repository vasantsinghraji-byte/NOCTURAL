/**
 * Rate Limiting & Miscellaneous Infrastructure Tests (Source Analysis)
 *
 * Verifies:
 * - RL-001: Redis-backed persistence for rate limit metrics
 * - RL-002: Redis health monitoring with INSTANCE_COUNT degradation
 * - RL-003: .unref() on cleanup interval (prevents Jest hangs)
 * - MISC-001: node-vault in optionalDependencies with try-catch
 * - MISC-002: GCS only enabled when explicitly opted in AND bucket configured
 * - MISC-003: Production logging level defaults to 'warn'
 * - MISC-004: PM2 log rotation at 50M
 * - MISC-005: OpenTelemetry tracing configuration
 * - MISC-006: Global request timeout middleware
 * - MISC-007: Content-Length limit middleware
 * - MISC-008: Terraform state bucket + DynamoDB lock table
 * - MISC-009: Automated database backup workflow
 * - MISC-010: Disaster recovery documentation exists
 */

const fs = require('fs');
const path = require('path');

describe('Phase 6 — Rate Limiting & Miscellaneous', () => {
  describe('RL-001: Redis-backed persistence for rate limits', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'config', 'rateLimit.js'),
      'utf8'
    );

    it('should define Redis persistence helpers', () => {
      expect(src).toMatch(/persistMetricToRedis/);
      expect(src).toMatch(/persistBlockedToRedis/);
      expect(src).toMatch(/isBlockedInRedis/);
      expect(src).toMatch(/getMetricFromRedis/);
    });

    it('should use non-critical try-catch for Redis operations', () => {
      // Redis calls should be wrapped in try-catch (non-blocking)
      const persistFn = src.match(/persistMetricToRedis[\s\S]*?(?=\nconst )/);
      expect(persistFn).not.toBeNull();
      expect(persistFn[0]).toMatch(/try\s*\{/);
      expect(persistFn[0]).toMatch(/catch/);
    });
  });

  describe('RL-002: Redis health monitoring with degradation', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'config', 'rateLimit.js'),
      'utf8'
    );

    it('should track Redis health via redisHealthy flag', () => {
      expect(src).toMatch(/redisHealthy/);
    });

    it('should divide limits by INSTANCE_COUNT when Redis is down', () => {
      expect(src).toMatch(/INSTANCE_COUNT/);
      expect(src).toMatch(/Math\.floor\(baseMax\s*\/\s*instanceCount\)/);
    });
  });

  describe('RL-003: .unref() on cleanup interval', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'config', 'rateLimit.js'),
      'utf8'
    );

    it('should call .unref() on the cleanup setInterval timer', () => {
      expect(src).toMatch(/cleanupInterval\.unref\(\)/);
    });
  });

  describe('MISC-001: node-vault optional dependency', () => {
    it('should list node-vault in optionalDependencies', () => {
      const pkg = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'package.json'),
        'utf8'
      );
      expect(pkg).toMatch(/"optionalDependencies"[\s\S]*?"node-vault"/);
    });

    it('should wrap require(node-vault) in try-catch', () => {
      const vaultSrc = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'config', 'vault.js'),
        'utf8'
      );
      expect(vaultSrc).toMatch(/try[\s\S]*?require\(['"]node-vault['"]\)/);
      expect(vaultSrc).toMatch(/VAULT_ENABLED=true/);
    });
  });

  describe('MISC-002: GCS requires explicit opt-in AND bucket', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'config', 'storage.js'),
      'utf8'
    );

    it('should require both USE_GCS=true AND GCS_BUCKET to enable GCS', () => {
      expect(src).toMatch(/USE_GCS\s*=.*USE_GCS.*===.*'true'.*&&.*GCS_BUCKET/);
    });
  });

  describe('MISC-003: Production logging defaults to warn', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'config', 'environments.js'),
      'utf8'
    );

    it('should default to warn level (not error-only) in production', () => {
      expect(src).toMatch(/LOG_LEVEL.*\|\|.*['"]warn['"]/);
    });
  });

  describe('MISC-004: PM2 log rotation at 50M', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'ecosystem.config.js'),
      'utf8'
    );

    it('should set max_size to 50M', () => {
      expect(src).toMatch(/max_size:\s*['"]50M['"]/);
    });
  });

  describe('MISC-005: OpenTelemetry tracing configuration', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'config', 'environments.js'),
      'utf8'
    );

    it('should define tracing config with OTEL env vars', () => {
      expect(src).toMatch(/OTEL_ENABLED/);
      expect(src).toMatch(/OTEL_SERVICE_NAME/);
      expect(src).toMatch(/OTEL_EXPORTER_OTLP_ENDPOINT/);
      expect(src).toMatch(/OTEL_SAMPLE_RATE/);
    });
  });

  describe('MISC-006: Global request timeout middleware', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'app.js'),
      'utf8'
    );

    it('should set request timeout with configurable duration', () => {
      expect(src).toMatch(/REQUEST_TIMEOUT_MS/);
      expect(src).toMatch(/req\.setTimeout/);
    });

    it('should return 408 on timeout', () => {
      expect(src).toMatch(/408/);
      expect(src).toMatch(/Request timed out/);
    });
  });

  describe('MISC-007: Content-Length limit middleware', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'app.js'),
      'utf8'
    );

    it('should reject oversized requests with 413 status', () => {
      expect(src).toMatch(/MAX_CONTENT_LENGTH/);
      expect(src).toMatch(/content-length/);
      expect(src).toMatch(/413/);
    });
  });

  describe('MISC-008: Terraform state management', () => {
    it('should define S3 bucket with versioning and encryption', () => {
      const tfSrc = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'terraform', 'bootstrap', 'main.tf'),
        'utf8'
      );

      expect(tfSrc).toMatch(/aws_s3_bucket.*terraform_state/s);
      expect(tfSrc).toMatch(/versioning_configuration[\s\S]*?Enabled/);
      expect(tfSrc).toMatch(/AES256/);
      expect(tfSrc).toMatch(/block_public_acls\s*=\s*true/);
    });

    it('should define DynamoDB lock table with LockID key', () => {
      const tfSrc = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'terraform', 'bootstrap', 'main.tf'),
        'utf8'
      );

      expect(tfSrc).toMatch(/aws_dynamodb_table.*terraform_lock/s);
      expect(tfSrc).toMatch(/LockID/);
      expect(tfSrc).toMatch(/PAY_PER_REQUEST/);
    });
  });

  describe('MISC-009: Automated database backup', () => {
    it('should have backup workflow with mongodump', () => {
      const backupYaml = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'backup.yml'),
        'utf8'
      );

      expect(backupYaml).toMatch(/mongodump/);
      expect(backupYaml).toMatch(/--gzip/);
      expect(backupYaml).toMatch(/s3.*cp/s);
    });

    it('should have db:backup npm scripts', () => {
      const pkg = fs.readFileSync(
        path.resolve(__dirname, '..', '..', '..', 'package.json'),
        'utf8'
      );

      expect(pkg).toMatch(/"db:backup"/);
      expect(pkg).toMatch(/"db:backup:list"/);
      expect(pkg).toMatch(/"db:backup:restore"/);
    });
  });

  describe('MISC-010: Disaster recovery documentation', () => {
    it('should have DISASTER_RECOVERY.md in docs', () => {
      const drExists = fs.existsSync(
        path.resolve(__dirname, '..', '..', '..', 'docs', 'DISASTER_RECOVERY.md')
      );
      expect(drExists).toBe(true);
    });
  });
});
