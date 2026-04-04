const fs = require('fs');
const path = require('path');

const controllersDir = path.resolve(__dirname, '..', '..', '..', 'controllers');
const controllerFiles = fs.readdirSync(controllersDir)
  .filter(file => file.endsWith('.js'))
  .map(file => ({
    file,
    source: fs.readFileSync(path.join(controllersDir, file), 'utf8')
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
