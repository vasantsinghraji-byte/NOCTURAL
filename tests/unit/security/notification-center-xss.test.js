const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..', '..');

function readClientScript(relativePath) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

describe('Notification center frontend XSS hardening', () => {
  const source = readClientScript('client/public/js/notification-center.js');

  it('renders the notification list with DOM APIs instead of API-data innerHTML', () => {
    expect(source).toContain('list.replaceChildren');
    expect(source).toContain('document.createElement');
    expect(source).toContain('textContent');
  });

  it('does not assign notification API data into innerHTML', () => {
    expect(source).not.toMatch(/innerHTML\s*=\s*this\.notifications/);
    expect(source).not.toMatch(/notif\.(title|message)[\s\S]{0,80}innerHTML/);
    expect(source).not.toMatch(/innerHTML[\s\S]{0,80}notif\.(title|message)/);
  });

  it('renders notification title and message via textContent', () => {
    expect(source).toMatch(/\.textContent\s*=\s*notif\.title/);
    expect(source).toMatch(/\.textContent\s*=\s*notif\.message/);
  });

  it('restricts action URL navigation to an internal allowlist', () => {
    expect(source).toContain('getSafeActionUrl');
    expect(source).toMatch(/window\.location\.href\s*=\s*safeUrl/);
  });
});
