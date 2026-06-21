const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..', '..');

function readClientScript(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

describe('Admin frontend XSS hardening', () => {
  it('renders admin applications with DOM APIs instead of API-data innerHTML', () => {
    const source = readClientScript('client/public/js/admin-applications.js');

    expect(source).not.toMatch(/applicationsContainer[\s\S]*?innerHTML/);
    expect(source).toContain('container.replaceChildren');
    expect(source).toContain('document.createElement');
    expect(source).toContain('textContent');
  });

  it('renders admin dashboard booking assignments with DOM APIs instead of API-data innerHTML', () => {
    const source = readClientScript('client/public/js/admin-dashboard.js');

    expect(source).not.toMatch(/bookingAssignmentList[\s\S]*?innerHTML/);
    expect(source).toContain('list.replaceChildren');
    expect(source).toContain('document.createElement');
    expect(source).toContain('textContent');
  });

  it('renders admin analytics sections without innerHTML sinks', () => {
    const source = readClientScript('client/public/js/admin-analytics.js');

    expect(source).not.toMatch(/innerHTML\s*=/);
    expect(source).toContain('document.createElement');
    expect(source).toContain('textContent');
    expect(source).toContain('replaceChildren');
  });

  it('keeps production script CSP nonce-based without unsafe-inline', () => {
    const source = readClientScript('middleware/security.js');

    expect(source).toContain('scriptSrc.push((req, res) =>');
    expect(source).toContain("return `'nonce-${nonce}'`;");
    expect(source).toContain("scriptSrcAttr: isDevelopment ? [\"'unsafe-inline'\"] : [\"'none'\"]");
    expect(source).toContain('Only in dev - production should use nonces');
  });
});
