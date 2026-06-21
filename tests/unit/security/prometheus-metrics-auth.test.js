/* eslint-disable security/detect-non-literal-fs-filename */
const express = require('express');
const fs = require('fs');
const path = require('path');
const request = require('supertest');

const ROOT = path.resolve(__dirname, '..', '..', '..');

function readFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('Security Unit: Prometheus metrics authentication', () => {
  let metricsRouter;
  let app;

  beforeAll(() => {
    process.env.PROMETHEUS_METRICS_TOKEN = 'test-prometheus-token';
    metricsRouter = require('../../../routes/admin/metrics');
    app = express();
    app.use('/api/v1/admin/metrics', metricsRouter.router);
  });

  afterAll(() => {
    metricsRouter.cleanup();
    delete process.env.PROMETHEUS_METRICS_TOKEN;
  });

  it('rejects metrics scrapes without the bearer token', async () => {
    await request(app)
      .get('/api/v1/admin/metrics')
      .expect(401);
  });

  it('rejects metrics scrapes with the wrong bearer token', async () => {
    await request(app)
      .get('/api/v1/admin/metrics')
      .set('Authorization', 'Bearer wrong-token')
      .expect(401);
  });

  it('returns Prometheus text metrics with the correct bearer token', async () => {
    const response = await request(app)
      .get('/api/v1/admin/metrics')
      .set('Authorization', 'Bearer test-prometheus-token')
      .expect(200);

    expect(response.headers['content-type']).toMatch(/text\/plain/);
    expect(response.text).toContain('# TYPE nocturnal_rate_limit_total counter');
    expect(response.text).toContain('nocturnal_admin_tracked_requests');
  });

  it('configures Prometheus scrapes with a credentials file', () => {
    const prometheusYaml = readFile('prometheus/prometheus.yml');
    const monitoringPrometheusYaml = readFile('monitoring/prometheus.yml');

    for (const source of [prometheusYaml, monitoringPrometheusYaml]) {
      expect(source).toMatch(/metrics_path:\s*['"]\/api\/v1\/admin\/metrics['"]/);
      expect(source).toMatch(/authorization:\s*\n\s*type:\s*Bearer\s*\n\s*credentials_file:\s*\/etc\/prometheus\/secrets\/nocturnal-metrics-token/);
    }
  });

  it('wires Kubernetes and Compose secrets for metrics auth', () => {
    const deploymentYaml = readFile('k8s/deployment.yaml');
    const monitoringYaml = readFile('k8s/monitoring.yaml');
    const secretsYaml = readFile('k8s/secrets.yaml');
    const composeYaml = readFile('docker-compose.prod.yml');

    expect(deploymentYaml).toContain('PROMETHEUS_METRICS_TOKEN');
    expect(deploymentYaml).toContain('prometheus-metrics-token');
    expect(monitoringYaml).toContain('authorization:');
    expect(monitoringYaml).toContain('type: Bearer');
    expect(monitoringYaml).toContain('name: nocturnal-secrets');
    expect(monitoringYaml).toContain('key: prometheus-metrics-token');
    expect(secretsYaml).toContain('nocturnal/prometheus-metrics-token');
    expect(composeYaml).toContain('PROMETHEUS_METRICS_TOKEN_FILE');
    expect(composeYaml).toContain('/etc/prometheus/secrets/nocturnal-metrics-token');
  });

  it('restricts app metrics ingress to Prometheus pods in the monitoring namespace', () => {
    const deploymentYaml = readFile('k8s/deployment.yaml');

    const prometheusIngressStart = deploymentYaml.indexOf('# Allow Prometheus scraping');
    const egressStart = deploymentYaml.indexOf('  egress:', prometheusIngressStart);
    const prometheusIngress = deploymentYaml.slice(prometheusIngressStart, egressStart);

    expect(prometheusIngressStart).toBeGreaterThanOrEqual(0);
    expect(egressStart).toBeGreaterThan(prometheusIngressStart);
    expect(prometheusIngress).toContain('kubernetes.io/metadata.name: monitoring');
    expect(prometheusIngress).toContain('app.kubernetes.io/name: prometheus');
    expect(prometheusIngress).toContain('port: 5000');
  });
});
