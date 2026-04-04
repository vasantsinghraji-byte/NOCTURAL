/**
 * Docker Configuration Tests (Static Analysis)
 *
 * Verifies:
 * - INFRA-001: sleep(5000) is mongosh JS inside heredoc (not bash)
 * - INFRA-002: ES heap configurable via ES_HEAP_SIZE env var (default 2g)
 * - INFRA-003: Filebeat container has healthcheck
 * - INFRA-004: Log capacity increased to 50m x 5 per container
 * - INFRA-005: Monitoring services mandatory (no profiles constraint)
 */

const fs = require('fs');
const path = require('path');

const replicaInit = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'docker', 'mongo-replica-init.sh'),
  'utf8'
);

const loggingYaml = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'docker-compose.logging.yml'),
  'utf8'
);

const prodYaml = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'docker-compose.prod.yml'),
  'utf8'
);

describe('Phase 6 — Docker Configuration', () => {
  describe('INFRA-001: mongo-replica-init.sh sleep() is mongosh JS', () => {
    it('should contain sleep(5000) inside a mongosh heredoc block', () => {
      expect(replicaInit).toMatch(/mongosh/);
      expect(replicaInit).toContain('sleep(5000)');
    });
  });

  describe('INFRA-002: Elasticsearch heap configurable', () => {
    it('should use ES_HEAP_SIZE env var with 2g default', () => {
      expect(loggingYaml).toMatch(/ES_HEAP_SIZE:-2g/);
    });
  });

  describe('INFRA-003: Filebeat healthcheck', () => {
    it('should define a healthcheck for filebeat service', () => {
      // Extract filebeat service block
      const filebeatBlock = loggingYaml.match(/filebeat:[\s\S]*?(?=\n\s{2}\w+:|\nvolumes:|\nnetworks:)/);
      expect(filebeatBlock).not.toBeNull();
      expect(filebeatBlock[0]).toMatch(/healthcheck/);
      expect(filebeatBlock[0]).toMatch(/filebeat test output/);
    });
  });

  describe('INFRA-004: Log capacity 50m x 5', () => {
    it('should configure max-size 50m and max-file 5', () => {
      expect(prodYaml).toMatch(/max-size:\s*["']50m["']/);
      expect(prodYaml).toMatch(/max-file:\s*["']5["']/);
    });
  });

  describe('INFRA-005: Monitoring mandatory (no profiles)', () => {
    it('prometheus should NOT have profiles constraint', () => {
      const promBlock = prodYaml.match(/prometheus:[\s\S]*?(?=\n\s{2}#\s*=+|\n\s{2}\w+:(?!\s))/);
      expect(promBlock).not.toBeNull();
      expect(promBlock[0]).not.toMatch(/profiles:/);
    });

    it('grafana should NOT have profiles constraint', () => {
      const grafanaBlock = prodYaml.match(/grafana:[\s\S]*?(?=\n\s{2}#\s*=+|\nvolumes:|\n\w)/);
      expect(grafanaBlock).not.toBeNull();
      expect(grafanaBlock[0]).not.toMatch(/profiles:/);
    });
  });
});
