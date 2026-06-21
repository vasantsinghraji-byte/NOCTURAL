const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const source = fs.readFileSync(path.join(root, 'client/public/js/notification-center.js'), 'utf8');

describe('Notification center frontend XSS hardening', () => {
  it('renders the notification list with DOM APIs instead of API-data innerHTML', () => {
    expect(source).toContain('list.replaceChildren');
    expect(source).toContain('document.createElement');
    expect(source).toContain('textContent');
  });

  it('does not assign notification API data into innerHTML', () => {
    expect(source).not.toMatch(/innerHTML\s*=\s*this\.notifications/);
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
