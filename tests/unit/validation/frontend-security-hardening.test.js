const {
  fs,
  frontendJsFilePaths,
  hardeningPatterns,
  roleHtmlFilePaths,
  toProjectRelativePath
} = require('./frontend-validation-utils');

describe('Frontend Security Hardening', () => {
  const roleHtmlFiles = roleHtmlFilePaths;
  const frontendScripts = frontendJsFilePaths;

  it('should keep role HTML free of inline scripts and inline handlers', () => {
    const offendingInlineScripts = [];
    const offendingInlineHandlers = [];

    roleHtmlFiles.forEach((filePath) => {
      const source = fs.readFileSync(filePath, 'utf8');
      const relativePath = toProjectRelativePath(filePath);

      if (hardeningPatterns.inlineScript.test(source)) {
        offendingInlineScripts.push(relativePath);
      }

      if (hardeningPatterns.inlineHtmlHandler.test(source)) {
        offendingInlineHandlers.push(relativePath);
      }
    });

    expect(offendingInlineScripts).toEqual([]);
    expect(offendingInlineHandlers).toEqual([]);
  });

  it('should keep frontend JS free of inline handler markup strings and direct handler assignments', () => {
    const offendingInlineHandlerStrings = [];
    const offendingDirectAssignments = [];

    frontendScripts.forEach((filePath) => {
      const source = fs.readFileSync(filePath, 'utf8');
      const relativePath = toProjectRelativePath(filePath);

      if (hardeningPatterns.inlineHandlerString.test(source)) {
        offendingInlineHandlerStrings.push(relativePath);
      }

      if (hardeningPatterns.directHandlerAssignment.test(source)) {
        offendingDirectAssignments.push(relativePath);
      }
    });

    expect(offendingInlineHandlerStrings).toEqual([]);
    expect(offendingDirectAssignments).toEqual([]);
  });

  it('should keep frontend JS and role HTML free of javascript: URLs', () => {
    const offendingScripts = frontendScripts.filter((filePath) => {
      const source = fs.readFileSync(filePath, 'utf8');
      return hardeningPatterns.unsafeJavascriptUrl.test(source);
    }).map(toProjectRelativePath);

    const offendingTemplates = roleHtmlFiles.filter((filePath) => {
      const source = fs.readFileSync(filePath, 'utf8');
      return hardeningPatterns.unsafeJavascriptUrl.test(source);
    }).map(toProjectRelativePath);

    expect(offendingScripts).toEqual([]);
    expect(offendingTemplates).toEqual([]);
  });

  it('should keep role HTML free of inline styles', () => {
    const offendingTemplates = [];

    roleHtmlFiles.forEach((filePath) => {
      const source = fs.readFileSync(filePath, 'utf8');
      const matches = source.match(hardeningPatterns.inlineStyle);
      if (matches && matches.length) {
        offendingTemplates.push(toProjectRelativePath(filePath));
      }
    });

    expect(offendingTemplates).toEqual([]);
  });
});
