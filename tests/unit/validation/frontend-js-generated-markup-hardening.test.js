const {
  fs,
  frontendJsFilePaths,
  hardeningPatterns,
  toProjectRelativePath
} = require('./frontend-validation-utils');

describe('Frontend JS Markup Hardening', () => {
  const frontendScripts = frontendJsFilePaths;

  it('should keep the full frontend JS tree free of inline handler strings in generated markup', () => {
    const offendingScripts = frontendScripts.filter((scriptPath) => {
      const source = fs.readFileSync(scriptPath, 'utf8');
      return hardeningPatterns.inlineHandlerString.test(source);
    }).map(toProjectRelativePath);

    expect(offendingScripts).toEqual([]);
  });

  it('should keep the full frontend JS tree free of direct inline handler assignments', () => {
    const offendingScripts = frontendScripts.filter((scriptPath) => {
      const source = fs.readFileSync(scriptPath, 'utf8');
      return hardeningPatterns.directHandlerAssignment.test(source);
    }).map(toProjectRelativePath);

    expect(offendingScripts).toEqual([]);
  });
});
