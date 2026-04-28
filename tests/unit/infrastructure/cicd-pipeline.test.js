/**
 * CI/CD Pipeline Tests (Static YAML Analysis)
 *
 * Verifies that the active GitHub Actions workflows still contain the
 * deployment, smoke, security, container scan, signing, and secret scan gates.
 */

const fs = require('fs');
const path = require('path');

const readWorkflow = (name) => fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', name),
  'utf8'
);

const deployYaml = readWorkflow('deploy.yml');
const ciYaml = readWorkflow('ci.yml');

describe('Phase 6 - CI/CD Pipeline', () => {
  describe('CICD-001: Deployment plan resolution', () => {
    it('should define a deployment planning job', () => {
      expect(deployYaml).toMatch(/resolve:/);
      expect(deployYaml).toMatch(/Resolve Deployment Plan/);
    });

    it('should resolve staging and production health URLs', () => {
      expect(deployYaml).toMatch(/https:\/\/nocturnal\.com\/api\/health/);
      expect(deployYaml).toMatch(/https:\/\/staging\.nocturnal\.com\/api\/health/);
    });
  });

  describe('CICD-002: Smoke tests use real health checks', () => {
    it('should use curl for health endpoint validation', () => {
      expect(deployYaml).toMatch(/curl\s+-f/);
    });

    it('should have retry loop for smoke tests', () => {
      expect(deployYaml).toMatch(/for\s+attempt\s+in\s+1\s+2\s+3\s+4\s+5/);
    });

    it('should exit 1 on smoke test failure', () => {
      expect(deployYaml).toMatch(/exit 1/);
    });
  });

  describe('CICD-003: Rollback mechanism implemented', () => {
    it('should define rollback workflow input', () => {
      expect(deployYaml).toMatch(/action:/);
      expect(deployYaml).toMatch(/rollback/);
    });

    it('should accept an image tag for rollback', () => {
      expect(deployYaml).toMatch(/image_tag/);
    });

    it('should validate rollback image tag is provided', () => {
      expect(deployYaml).toMatch(/Rollback requires an existing image_tag input/);
    });
  });

  describe('CICD-004: Lint failures fail the pipeline', () => {
    it('should NOT have continue-on-error on lint step', () => {
      const lintBlock = ciYaml.match(/lint:[\s\S]*?(?=\n\s{2}\w+:|$)/);
      expect(lintBlock).not.toBeNull();
      expect(lintBlock[0]).not.toMatch(/continue-on-error:\s*true/);
    });

    it('should run npm run lint directly (no echo fallback)', () => {
      expect(ciYaml).toMatch(/run:\s*npm run lint/);
    });
  });

  describe('CICD-005: Security audit reporting', () => {
    it('should use --audit-level=moderate', () => {
      expect(ciYaml).toMatch(/--audit-level=moderate/);
    });

    it('should capture audit output as a non-blocking report', () => {
      const securityBlock = ciYaml.match(/security:[\s\S]*?(?=\n\s{2}\w+:|$)/);
      expect(securityBlock).not.toBeNull();
      expect(securityBlock[0]).not.toMatch(/continue-on-error:\s*true/);
      expect(securityBlock[0]).toMatch(/npm-audit-prod\.json/);
      expect(securityBlock[0]).toMatch(/\|\|\s*true/);
    });
  });

  describe('CICD-006: Docker image vulnerability scanning', () => {
    it('should include Trivy vulnerability scanner', () => {
      expect(deployYaml).toMatch(/trivy-action/);
    });

    it('should scan for CRITICAL and HIGH severity', () => {
      expect(deployYaml).toMatch(/severity.*CRITICAL.*HIGH/s);
    });

    it('should fail pipeline on vulnerabilities', () => {
      expect(deployYaml).toMatch(/exit-code.*['"]1['"]/);
    });
  });

  describe('CICD-007: Docker image signing (cosign)', () => {
    it('should install cosign', () => {
      expect(deployYaml).toMatch(/cosign-installer/);
    });

    it('should sign image by digest', () => {
      expect(deployYaml).toMatch(/cosign sign/);
    });
  });

  describe('CICD-008: Secret scanning (Gitleaks)', () => {
    it('should include Gitleaks current-tree scanning', () => {
      expect(ciYaml).toMatch(/gitleaks:v/);
      expect(ciYaml).toMatch(/dir \/repo/);
    });

    it('should scan the checked-out tree', () => {
      expect(ciYaml).toMatch(/fetch-depth:\s*0/);
      expect(ciYaml).toMatch(/--redact/);
    });
  });

  describe('MISC-011: AWS secret validation', () => {
    it('should validate AWS secrets before deployment', () => {
      expect(deployYaml).toMatch(/Validate AWS secrets/);
      expect(deployYaml).toMatch(/AWS_ACCESS_KEY_ID/);
      expect(deployYaml).toMatch(/AWS_SECRET_ACCESS_KEY/);
    });
  });
});
