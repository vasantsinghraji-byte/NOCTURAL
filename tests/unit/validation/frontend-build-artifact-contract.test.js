const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../../..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

describe('Frontend build artifact contract', () => {
  const rootPackage = JSON.parse(readProjectFile('package.json'));
  const clientPackage = JSON.parse(readProjectFile('client/package.json'));
  const buildConfigSrc = readProjectFile('client/build.config.js');
  const webpackSimpleSrc = readProjectFile('client/webpack.config.simple.js');
  const dockerfileSrc = readProjectFile('Dockerfile');
  const renderYamlSrc = readProjectFile('render.yaml');

  test('root build scripts delegate to the shared client build command', () => {
    expect(rootPackage.scripts['dev:all']).toBe('concurrently "npm run dev" "npm --prefix client run serve"');
    expect(rootPackage.scripts['start:all']).toBe('concurrently "npm start" "npm --prefix client run serve"');
    expect(rootPackage.scripts.frontend).toBe('npm --prefix client run serve');
    expect(rootPackage.scripts.build).toBe('npm run build:prod');
    expect(rootPackage.scripts['build:frontend']).toBe('npm --prefix client ci --include=dev && npm --prefix client run build');
    expect(rootPackage.scripts['build:client']).toBe('npm run build:frontend');
    expect(rootPackage.scripts['build:prod']).toBe('cross-env NODE_ENV=production npm run build:frontend');
    expect(rootPackage.scripts.optimize).toBe('npm run build:frontend');
  });

  test('client build scripts collapse onto one production build path and output directory', () => {
    expect(clientPackage.scripts.build).toBe('npm run build:prod');
    expect(clientPackage.scripts['build:prod']).toBe('cross-env NODE_ENV=production node build.config.js');
    expect(clientPackage.scripts['build:dev']).toBe('cross-env NODE_ENV=development webpack --config webpack.config.simple.js --mode development');
    expect(clientPackage.scripts['build:optimize']).toBe('npm run build:prod');
    expect(clientPackage.devDependencies['cross-env']).toBeDefined();
  });

  test('frontend optimizer fails the build when any asset step errors', () => {
    expect(buildConfigSrc).toContain('function createBuildFailure(step, sourceFile, details)');
    expect(buildConfigSrc).toContain('const failures = [];');
    expect(buildConfigSrc).toContain('trackFailure(await minifyCSS(file, destPath));');
    expect(buildConfigSrc).toContain('trackFailure(await minifyJS(file, destPath));');
    expect(buildConfigSrc).toContain('trackFailure(await minifyHTMLFile(file, destPath));');
    expect(buildConfigSrc).toContain('trackFailure(await processImage(file, destPath));');
    expect(buildConfigSrc).toContain("Frontend build failed with ${failures.length} asset processing error(s).");
    expect(buildConfigSrc).toContain('process.exit(1);');
  });

  test('fallback webpack copy config excludes test and archival artifacts too', () => {
    expect(webpackSimpleSrc).toContain("**/test/**");
    expect(webpackSimpleSrc).toContain("**/*.original");
    expect(webpackSimpleSrc).toContain("**/shared/auth-setup.html");
    expect(webpackSimpleSrc).toContain("**/js/auth-setup.js");
    expect(buildConfigSrc).toContain("path.join('js', 'auth-setup.js')");
  });

  test('Docker and Render use the same client build command and publish dist', () => {
    expect(dockerfileSrc).toContain('RUN cd client && npm ci && npm run build && cd ..');
    expect(dockerfileSrc).toContain('/app/client/dist ./client/dist');

    expect(renderYamlSrc).toContain('buildCommand: npm --prefix client ci && npm --prefix client run build');
    expect(renderYamlSrc).toContain('staticPublishPath: client/dist');
  });
});
