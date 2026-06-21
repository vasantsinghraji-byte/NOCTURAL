/* eslint-disable security/detect-non-literal-fs-filename */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');

function readFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('Security Unit: Loki authentication guardrails', () => {
  it('requires Loki multi-tenant auth', () => {
    const lokiConfig = readFile('loki/loki-config.yml');

    expect(lokiConfig).toMatch(/auth_enabled:\s*true/);
    expect(lokiConfig).not.toMatch(/auth_enabled:\s*false/);
  });

  it('does not publish the Loki API directly to the host network', () => {
    const compose = readFile('docker-compose.logging.yml');
    const lokiBlock = compose.match(/^\s{2}loki:[\s\S]*?(?=^\s{2}\w+:|\nnetworks:|\nvolumes:)/m);

    expect(lokiBlock).not.toBeNull();
    expect(lokiBlock[0]).not.toMatch(/ports:\s*\n\s*-\s*["']?3100:3100["']?/);
    expect(lokiBlock[0]).toMatch(/expose:\s*\n\s*-\s*["']?3100["']?/);
    expect(lokiBlock[0]).toMatch(/networks:\s*\n\s*-\s*loki-network/);
    expect(compose).toMatch(/loki-network:\s*\n\s*driver:\s*bridge\s*\n\s*internal:\s*true/);
  });

  it('protects optional direct Loki API access with OIDC and tenant injection', () => {
    const compose = readFile('docker-compose.logging.yml');
    const proxyTemplate = readFile('loki/loki-auth-proxy.conf.template');

    expect(compose).toContain('loki-oauth2-proxy:');
    expect(compose).toContain('quay.io/oauth2-proxy/oauth2-proxy');
    expect(compose).toContain('LOKI_OIDC_ISSUER_URL');
    expect(compose).toContain('loki-auth-proxy:');
    expect(compose).toMatch(/127\.0\.0\.1:\$\{LOKI_AUTH_PROXY_PORT:-3101\}:8080/);
    expect(proxyTemplate).toContain('auth_request /oauth2/auth');
    expect(proxyTemplate).toContain('proxy_set_header X-Scope-OrgID ${LOKI_TENANT_ID}');
    expect(proxyTemplate).toContain('proxy_pass http://loki:3100');
  });

  it('sets a tenant ID for Promtail ingestion and Grafana queries', () => {
    const promtailConfig = readFile('promtail/promtail-config.yml');
    const grafanaDatasource = readFile('grafana/provisioning/datasources/loki.yml');

    expect(promtailConfig).toMatch(/tenant_id:\s*nocturnal/);
    expect(grafanaDatasource).toMatch(/httpHeaderName1:\s*X-Scope-OrgID/);
    expect(grafanaDatasource).toMatch(/httpHeaderValue1:\s*nocturnal/);
  });

  it('sends tenant and optional basic auth headers for direct app Loki writes', () => {
    const loggerSource = readFile('utils/logger.js');

    expect(loggerSource).toContain('LOKI_BASIC_AUTH');
    expect(loggerSource).toContain('LOKI_TENANT_ID');
    expect(loggerSource).toContain('X-Scope-OrgID');
  });

  it('provides Kubernetes OIDC ingress and NetworkPolicy guardrails', () => {
    const k8sManifest = readFile('k8s/loki-auth-ingress.yaml');

    expect(k8sManifest).toContain('name: loki-oauth2-proxy');
    expect(k8sManifest).toContain('quay.io/oauth2-proxy/oauth2-proxy');
    expect(k8sManifest).toContain('nginx.ingress.kubernetes.io/auth-url');
    expect(k8sManifest).toContain('proxy_set_header X-Scope-OrgID nocturnal');
    expect(k8sManifest).toContain('name: allow-loki-authenticated-access');
    expect(k8sManifest).toContain('name: allow-loki-oauth2-proxy');
    expect(k8sManifest).toMatch(/podSelector:\s*\n\s*matchLabels:\s*\n\s*app:\s*loki/);
    expect(k8sManifest).toMatch(/app:\s*grafana/);
    expect(k8sManifest).toMatch(/app:\s*promtail/);
  });
});
