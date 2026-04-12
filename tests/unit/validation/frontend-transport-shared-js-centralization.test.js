const {
  fs,
  productionFrontendScriptPaths,
  toProjectRelativePath
} = require('./frontend-validation-utils');

describe('Frontend Transport Shared JS Centralization', () => {
  it('should keep shared frontend JS modules off fetch(AppConfig.api(...)) in favor of shared transport helpers', () => {
    const legacyAppConfigFetchOffenders = new Set();

    productionFrontendScriptPaths.forEach((absolutePath) => {
      const source = fs.readFileSync(absolutePath, 'utf8');
      const relativePath = toProjectRelativePath(absolutePath);

      if (source.includes('fetch(AppConfig.api(')) {
        legacyAppConfigFetchOffenders.add(relativePath);
      }
    });

    expect(Array.from(legacyAppConfigFetchOffenders).sort()).toEqual([]);
  });

  it('should keep shared frontend JS modules off hardcoded localhost, direct /api fetches, and raw API_URL string building', () => {
    const hardcodedLocalhostOffenders = [];
    const directApiFetchOffenders = [];
    const rawApiUrlInterpolationOffenders = [];

    productionFrontendScriptPaths.forEach((absolutePath) => {
      const source = fs.readFileSync(absolutePath, 'utf8');
      const relativePath = toProjectRelativePath(absolutePath);

      if (source.includes('http://localhost:5000')) {
        hardcodedLocalhostOffenders.push(relativePath);
      }

      if (/fetch\(\s*['"`]\/api/.test(source)) {
        directApiFetchOffenders.push(relativePath);
      }

      if (source.includes('${API_URL}/')) {
        rawApiUrlInterpolationOffenders.push(relativePath);
      }
    });

    expect({
      hardcodedLocalhostOffenders,
      directApiFetchOffenders,
      rawApiUrlInterpolationOffenders
    }).toEqual({
      hardcodedLocalhostOffenders: [],
      directApiFetchOffenders: [],
      rawApiUrlInterpolationOffenders: []
    });
  });
});
