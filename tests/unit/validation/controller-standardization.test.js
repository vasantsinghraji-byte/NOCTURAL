const path = require('path');

const { listProjectFiles, readProjectFile } = require('./projectFileReader');

const controllersDir = 'controllers';
const controllerFiles = listProjectFiles(controllersDir)
  .filter(file => file.endsWith('.js'))
  .map(file => ({
    file,
    source: readProjectFile(path.join(controllersDir, file))
  }));

describe('Controller Standardization', () => {
  it('should not use req.user._id directly in controllers', () => {
    const offenders = controllerFiles
      .filter(({ source }) => source.includes('req.user._id'))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it('should not use direct res.status(...).json(...) responses in controllers', () => {
    const offenders = controllerFiles
      .filter(({ source }) => /res\.status\([^)]*\)\.json\(/.test(source))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it('should not use console.error in controllers', () => {
    const offenders = controllerFiles
      .filter(({ source }) => source.includes('console.error('))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });
});
