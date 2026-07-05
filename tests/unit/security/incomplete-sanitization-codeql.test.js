const { quoteForShell } = require('../../../scripts/doctor-local');
const { escapeRegExp } = require('../../../client/buildEscaping');

describe('CodeQL incomplete sanitization hardening', () => {
  it('escapes backslashes before quoting shell labels', () => {
    expect(quoteForShell('node')).toBe('node');
    expect(quoteForShell('C:\\Program Files\\Tool "A"\\bin')).toBe(
      '"C:\\\\Program Files\\\\Tool \\"A\\"\\\\bin"'
    );
  });

  it('escapes all regular expression metacharacters in asset paths', () => {
    const original = 'js/app.$chunk[1](test)\\file?.js';
    const escaped = escapeRegExp(original);
    const regex = new RegExp(escaped, 'g');
    const html = `<script src="${original}"></script>`;

    expect(html.replace(regex, 'js/app.12345678.js')).toBe(
      '<script src="js/app.12345678.js"></script>'
    );
    expect(regex.test('js/appX$chunk[1](test)\\file?.js')).toBe(false);
  });
});
