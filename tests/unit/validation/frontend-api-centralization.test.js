const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..', '..');
const publicDir = path.join(rootDir, 'client', 'public');

const readDirectoryRecursively = (directoryPath) => {
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'test') {
        return [];
      }

      return readDirectoryRecursively(entryPath);
    }

    if (!entry.name.endsWith('.html') || entry.name.endsWith('.original')) {
      return [];
    }

    return [entryPath];
  });
};

const productionPagePaths = readDirectoryRecursively(publicDir);

const toProjectRelativePath = (absolutePath) => path.relative(rootDir, absolutePath).replace(/\\/g, '/');

describe('Frontend API Centralization', () => {
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
});
