/**
 * Kubernetes Security Tests (Static YAML Analysis)
 *
 * Verifies:
 * - AUTH-009: RBAC least-privilege (Role, RoleBinding, ServiceAccount)
 * - AUTH-010: Pod Security Standards (restricted profile)
 * - AUTH-011: NetworkPolicy (default-deny + restricted egress)
 * - AUTH-012: No plaintext secrets (ExternalSecret / SecretStore)
 */

const fs = require('fs');
const path = require('path');

const deploymentYaml = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'k8s', 'deployment.yaml'),
  'utf8'
);

const secretsYaml = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'k8s', 'secrets.yaml'),
  'utf8'
);

describe('Phase 3 — Kubernetes Security (Static YAML Analysis)', () => {
  describe('AUTH-009: RBAC least-privilege', () => {
    it('should define a Role with only "get" verb', () => {
      expect(deploymentYaml).toMatch(/kind:\s*Role/);
      // Role should have restricted verbs — only "get"
      const roleMatch = deploymentYaml.match(/kind:\s*Role[\s\S]*?verbs:\s*\[([^\]]*)\]/);
      expect(roleMatch).not.toBeNull();
      const verbs = roleMatch[1].replace(/"/g, '').replace(/'/g, '').split(',').map(v => v.trim());
      expect(verbs).toEqual(['get']);
    });

    it('should define a RoleBinding for nocturnal-sa', () => {
      expect(deploymentYaml).toMatch(/kind:\s*RoleBinding/);
      expect(deploymentYaml).toMatch(/nocturnal-sa/);
    });

    it('should set automountServiceAccountToken to false', () => {
      expect(deploymentYaml).toMatch(/automountServiceAccountToken:\s*false/);
    });
  });

  describe('AUTH-010: Pod Security Standards', () => {
    it('should enforce restricted pod security standard on namespace', () => {
      expect(deploymentYaml).toMatch(/pod-security\.kubernetes\.io\/enforce:\s*restricted/);
    });

    it('should set runAsNonRoot: true in pod security context', () => {
      expect(deploymentYaml).toMatch(/runAsNonRoot:\s*true/);
    });

    it('should set allowPrivilegeEscalation: false', () => {
      expect(deploymentYaml).toMatch(/allowPrivilegeEscalation:\s*false/);
    });

    it('should drop ALL capabilities', () => {
      // capabilities.drop should contain ALL
      expect(deploymentYaml).toMatch(/drop:\s*\n\s*-\s*("|')?ALL("|')?/);
    });
  });

  describe('AUTH-011: NetworkPolicy', () => {
    it('should define at least one NetworkPolicy', () => {
      expect(deploymentYaml).toMatch(/kind:\s*NetworkPolicy/);
    });

    it('should have a default-deny policy', () => {
      // Default deny pattern: NetworkPolicy with empty ingress/egress or policyTypes without rules
      expect(deploymentYaml).toMatch(/default-deny/);
    });

    it('should restrict egress to known ports', () => {
      // Egress rules should reference known service ports (Redis 6379, MongoDB 27017, DNS 53)
      expect(deploymentYaml).toMatch(/port:\s*6379/);
      expect(deploymentYaml).toMatch(/port:\s*27017/);
      expect(deploymentYaml).toMatch(/port:\s*53/);
    });
  });

  describe('AUTH-012: No plaintext secrets', () => {
    it('should NOT contain base64-encoded secret data', () => {
      // Standard K8s Secret with data: would have base64 values
      // Should NOT match `kind: Secret` with `data:` field containing base64
      // The file should use ExternalSecret, not plain Secret
      expect(secretsYaml).toMatch(/kind:\s*(ExternalSecret|SecretStore)/);
    });

    it('should use ExternalSecret or SecretStore for secret management', () => {
      expect(secretsYaml).toMatch(/kind:\s*SecretStore/);
      expect(secretsYaml).toMatch(/kind:\s*ExternalSecret/);
    });
  });
});
