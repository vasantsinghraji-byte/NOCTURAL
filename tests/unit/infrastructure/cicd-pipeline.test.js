/**
 * CI/CD Pipeline Tests (Static YAML Analysis)
 *
 * Verifies:
 * - CICD-001: Database migrations uncommented in CD pipeline
 * - CICD-002: Smoke tests use real curl health checks (not echo)
 * - CICD-003: Rollback mechanism implemented with inputs
 * - CICD-004: Lint failures fail the pipeline (no continue-on-error)
 * - CICD-005: Security audit at moderate level (not just high)
 * - CICD-006: Docker image vulnerability scanning (Trivy)
 * - CICD-007: Docker image signing (cosign)
 * - CICD-008: Secret scanning (Gitleaks)
 * - MISC-011: AWS secret validation before deployment
 */

const fs = require('fs');
const path = require('path');

const cdYaml = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'cd.yml'),
  'utf8'
);

const ciYaml = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'ci.yml'),
  'utf8'
);

const cicdYaml = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'ci-cd.yml'),
  'utf8'
);

describe('Phase 6 — CI/CD Pipeline', () => {
  describe('CICD-001: Database migrations uncommented', () => {
    it('should run migrations in staging deployment', () => {
      expect(cdYaml).toMatch(/npm run migrate:staging/);
    });

    it('should run migrations in production deployment', () => {
      expect(cdYaml).toMatch(/npm run migrate:production/);
    });
  });

  describe('CICD-002: Smoke tests use real health checks', () => {
    it('should use curl for health endpoint validation', () => {
      expect(cdYaml).toMatch(/curl\s+-sf/);
    });

    it('should have retry loop for smoke tests', () => {
      expect(cdYaml).toMatch(/for\s+i\s+in\s+1\s+2\s+3\s+4\s+5/);
    });

    it('should exit 1 on smoke test failure', () => {
      expect(cdYaml).toMatch(/exit 1/);
    });
  });

  describe('CICD-003: Rollback mechanism implemented', () => {
    it('should define rollback job', () => {
      expect(cdYaml).toMatch(/rollback:/);
    });

    it('should accept rollback_version input', () => {
      expect(cdYaml).toMatch(/rollback_version/);
    });

    it('should validate rollback version is provided', () => {
      expect(cdYaml).toMatch(/rollback_version.*required/s);
    });
  });

  describe('CICD-004: Lint failures fail the pipeline', () => {
    it('should NOT have continue-on-error on lint step', () => {
      // Extract the lint job block
      const lintBlock = ciYaml.match(/lint:[\s\S]*?(?=\n\s{2}\w+:|$)/);
      expect(lintBlock).not.toBeNull();
      expect(lintBlock[0]).not.toMatch(/continue-on-error:\s*true/);
    });

    it('should run npm run lint directly (no echo fallback)', () => {
      expect(ciYaml).toMatch(/run:\s*npm run lint/);
    });
  });

  describe('CICD-005: Security audit at moderate level', () => {
    it('should use --audit-level=moderate (not high)', () => {
      expect(ciYaml).toMatch(/--audit-level=moderate/);
    });

    it('should NOT have continue-on-error on security audit', () => {
      const securityBlock = ciYaml.match(/security:[\s\S]*?(?=\n\s{2}\w+:|$)/);
      expect(securityBlock).not.toBeNull();
      expect(securityBlock[0]).not.toMatch(/continue-on-error:\s*true/);
    });
  });

  describe('CICD-006: Docker image vulnerability scanning', () => {
    it('should include Trivy vulnerability scanner', () => {
      expect(cicdYaml).toMatch(/trivy-action/);
    });

    it('should scan for CRITICAL and HIGH severity', () => {
      expect(cicdYaml).toMatch(/severity.*CRITICAL.*HIGH/s);
    });

    it('should fail pipeline on vulnerabilities (exit-code 1)', () => {
      expect(cicdYaml).toMatch(/exit-code.*['"]1['"]/);
    });
  });

  describe('CICD-007: Docker image signing (cosign)', () => {
    it('should install cosign', () => {
      expect(cicdYaml).toMatch(/cosign-installer/);
    });

    it('should sign image by digest', () => {
      expect(cicdYaml).toMatch(/cosign sign/);
    });
  });

  describe('CICD-008: Secret scanning (Gitleaks)', () => {
    it('should include Gitleaks action', () => {
      expect(ciYaml).toMatch(/gitleaks.*action/);
    });

    it('should scan full git history', () => {
      expect(ciYaml).toMatch(/fetch-depth:\s*0/);
    });
  });

  describe('MISC-011: AWS secret validation', () => {
    it('should validate AWS secrets before deployment', () => {
      expect(cicdYaml).toMatch(/Validate AWS secrets/);
      expect(cicdYaml).toMatch(/AWS_ACCESS_KEY_ID/);
      expect(cicdYaml).toMatch(/AWS_SECRET_ACCESS_KEY/);
    });
  });
});
