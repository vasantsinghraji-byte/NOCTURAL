const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..', '..');

describe('shared server warming status', () => {
  it('is injected into built pages and responds to both retry lifecycle events', () => {
    const buildConfig = fs.readFileSync(path.join(rootDir, 'client/build.config.js'), 'utf8');
    const statusScript = fs.readFileSync(path.join(rootDir, 'client/public/js/server-warming-status.js'), 'utf8');
    const statusCss = fs.readFileSync(
      path.join(rootDir, 'client/public/css/components/server-warming-status.css'),
      'utf8'
    );

    expect(buildConfig).toContain('/js/server-warming-status.js');
    expect(buildConfig).toContain('/css/components/server-warming-status.css');
    expect(statusScript).toContain("addEventListener('nocturnal:server-warming'");
    expect(statusScript).toContain("addEventListener('nocturnal:server-warming-complete'");
    expect(statusScript).toContain('Waking up server');
    expect(statusCss).toContain('.server-warming-status');
  });
});
