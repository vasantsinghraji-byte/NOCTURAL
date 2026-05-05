const {
  fs,
  productionPagePaths,
  toProjectRelativePath
} = require('./frontend-validation-utils');

describe('Frontend Transport HTML Centralization', () => {
  it('should keep production HTML pages off hardcoded localhost, direct /api fetches, and raw API_URL string building', () => {
    const hardcodedLocalhostOffenders = [];
    const directApiFetchOffenders = [];
    const rawApiUrlInterpolationOffenders = [];

    productionPagePaths.forEach((absolutePath) => {
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

  it('should keep production HTML pages off fetch(AppConfig.api(...)) in favor of shared transport helpers', () => {
    const legacyAppConfigFetchOffenders = new Set();

    productionPagePaths.forEach((absolutePath) => {
      const source = fs.readFileSync(absolutePath, 'utf8');
      const relativePath = toProjectRelativePath(absolutePath);

      if (source.includes('fetch(AppConfig.api(')) {
        legacyAppConfigFetchOffenders.add(relativePath);
      }
    });

    expect(Array.from(legacyAppConfigFetchOffenders).sort()).toEqual([]);
  });
});
