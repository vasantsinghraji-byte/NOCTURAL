/**
 * Kubernetes Infrastructure Tests (Static YAML Analysis)
 *
 * Verifies:
 * - K8S-001: Image tag configurable via IMAGE_TAG (not hardcoded 'latest')
 * - K8S-002: MongoDB replica set initContainer + --replSet rs0
 * - K8S-003: No hardcoded 'fast-ssd' StorageClass
 * - K8S-004: Redis StatefulSet with replicas: 2 + headless service
 * - K8S-005: ClusterIssuer configurable via CLUSTER_ISSUER env var
 * - K8S-006: Domain configurable via DOMAIN env var
 */

const fs = require('fs');
const path = require('path');

const deploymentYaml = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'k8s', 'deployment.yaml'),
  'utf8'
);

const mongoYaml = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'k8s', 'mongodb.yaml'),
  'utf8'
);

const redisYaml = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'k8s', 'redis.yaml'),
  'utf8'
);

const ingressYaml = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'k8s', 'ingress.yaml'),
  'utf8'
);

describe('Phase 6 — Kubernetes Infrastructure', () => {
  describe('K8S-001: Image tag not hardcoded as latest', () => {
    it('should use IMAGE_TAG variable with versioned default', () => {
      expect(deploymentYaml).toMatch(/\$\{IMAGE_TAG:-v\d+\.\d+\.\d+\}/);
    });

    it('should use IfNotPresent pull policy (not Always)', () => {
      expect(deploymentYaml).toMatch(/imagePullPolicy:\s*IfNotPresent/);
    });
  });

  describe('K8S-002: MongoDB replica set initialization', () => {
    it('should include --replSet rs0 in mongod args', () => {
      expect(mongoYaml).toMatch(/--replSet.*rs0/);
    });

    it('should have an initContainer for replica set initialization', () => {
      expect(mongoYaml).toMatch(/initContainers:/);
      expect(mongoYaml).toMatch(/init-replicaset/);
    });

    it('should run rs.initiate() only on pod-0', () => {
      expect(mongoYaml).toMatch(/mongodb-0/);
      expect(mongoYaml).toMatch(/rs\.initiate/);
    });
  });

  describe('K8S-003: No hardcoded fast-ssd StorageClass', () => {
    it('should NOT have active storageClassName: fast-ssd', () => {
      // May appear in comments but not as active config
      const activeStorageClass = mongoYaml.match(/^\s+storageClassName:\s*["']?fast-ssd/m);
      expect(activeStorageClass).toBeNull();
    });
  });

  describe('K8S-004: Redis StatefulSet with replicas', () => {
    it('should use StatefulSet kind', () => {
      expect(redisYaml).toMatch(/kind:\s*StatefulSet/);
    });

    it('should have replicas: 2 for high availability', () => {
      expect(redisYaml).toMatch(/replicas:\s*2/);
    });

    it('should define a headless service for StatefulSet DNS', () => {
      expect(redisYaml).toMatch(/clusterIP:\s*None/);
      expect(redisYaml).toMatch(/redis-headless/);
    });
  });

  describe('K8S-005: ClusterIssuer configurable', () => {
    it('should use CLUSTER_ISSUER env var with default', () => {
      expect(ingressYaml).toMatch(/\$\{CLUSTER_ISSUER:-letsencrypt-prod\}/);
    });
  });

  describe('K8S-006: Domain configurable', () => {
    it('should use DOMAIN env var in TLS hosts and rules', () => {
      expect(ingressYaml).toMatch(/\$\{DOMAIN:-nocturnal\.com\}/);
    });

    it('should support www subdomain via DOMAIN variable', () => {
      expect(ingressYaml).toMatch(/www\.\$\{DOMAIN/);
    });
  });
});
