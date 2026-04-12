const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..', '..');

const readProjectFile = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
const retiredProviderPrefix = ['fire', 'base'].join('');
const retiredProviderConfig = `${retiredProviderPrefix}-config.js`;
const retiredAuthGlobal = `window.${retiredProviderPrefix}Auth`;
const retiredSignOutGlobal = `window.${retiredProviderPrefix}SignOut`;
const retiredEnvToggle = `${retiredProviderPrefix.toUpperCase()}_AUTH_ENABLED`;
const retiredUserField = `${retiredProviderPrefix}Uid`;
const retiredAdminPackage = `${retiredProviderPrefix}-admin`;
const retiredEnvSection = `${retiredProviderPrefix}: {`;
const retiredVaultAccessor = ['get', retiredProviderPrefix[0].toUpperCase() + retiredProviderPrefix.slice(1), 'Credentials'].join('');
const retiredProviderRegex = new RegExp(retiredProviderPrefix, 'i');
const retiredCloudCredentialsEnv = ['GOOGLE', 'APPLICATION', 'CREDENTIALS'].join('_');

const productionAuthPages = [
  'client/public/index.html',
  'client/public/shared/register.html',
  'client/public/roles/doctor/browse-shifts-enhanced.html',
  'client/public/roles/doctor/my-applications.html',
  'client/public/roles/doctor/duty-details.html',
  'client/public/roles/doctor/doctor-profile-enhanced.html',
  'client/public/roles/admin/admin-dashboard.html',
  'client/public/roles/admin/admin-applications.html',
  'client/public/roles/admin/admin-post-duty.html',
  'client/public/roles/admin/admin-profile.html',
  'client/public/roles/admin/admin-settings.html'
];

const webpackConfigSrc = readProjectFile('client/webpack.config.js');
const webpackSimpleConfigSrc = readProjectFile('client/webpack.config.simple.js');
const buildConfigSrc = readProjectFile('client/build.config.js');
const renderYamlSrc = readProjectFile('render.yaml');
const environmentsSrc = readProjectFile('config/environments.js');
const testSetupSrc = readProjectFile('tests/setup.js');
const envExampleSrc = readProjectFile('.env.example');
const vaultSrc = readProjectFile('config/vault.js');
const packageJsonSrc = readProjectFile('package.json');
const packageLockSrc = readProjectFile('package-lock.json');
const userModelSrc = readProjectFile('models/user.js');
const migrationGuideSrc = readProjectFile('docs/MIGRATION_GUIDE.md');
const securityChangelogSrc = readProjectFile('docs/changelog/2024-Q4-security.md');
const secretsGuideSrc = readProjectFile('docs/SECRETS_MANAGEMENT.md');
const rotateSecretsScriptSrc = readProjectFile('scripts/rotate-secrets.js');
const cleanGitSecretsScriptSrc = readProjectFile('scripts/clean-git-secrets.sh');

describe('Frontend Legacy Auth Retirement', () => {
  it('should keep production auth entrypoints off retired third-party auth hooks', () => {
    productionAuthPages.forEach((relativePath) => {
      const source = readProjectFile(relativePath);

      expect(source).not.toContain(retiredProviderConfig);
      expect(source).not.toContain(retiredAuthGlobal);
      expect(source).not.toContain(retiredSignOutGlobal);
      expect(source).not.toContain('onAuthStateChanged(');
      expect(source).not.toContain('getIdToken(');
      expect(source).not.toContain('signInWithEmailAndPassword');
    });
  });

  it('should not advertise retired auth deployment defaults in render config', () => {
    expect(renderYamlSrc).not.toContain(retiredEnvToggle);
  });

  it('should keep runtime configuration off retired auth environment switches', () => {
    expect(environmentsSrc).not.toContain(retiredEnvSection);
    expect(environmentsSrc).not.toContain(retiredEnvToggle);
    expect(environmentsSrc).not.toContain(retiredCloudCredentialsEnv);

    expect(envExampleSrc).not.toContain(retiredEnvToggle);
    expect(envExampleSrc).not.toContain(`${retiredCloudCredentialsEnv}=`);

    expect(testSetupSrc).not.toContain(retiredEnvToggle);
    expect(vaultSrc).not.toContain(retiredVaultAccessor);
    expect(userModelSrc).not.toContain(retiredUserField);
  });

  it('should keep the root dependency graph off retired auth packages', () => {
    expect(packageJsonSrc).not.toContain(`"${retiredProviderPrefix}"`);
    expect(packageJsonSrc).not.toContain(`"${retiredAdminPackage}"`);
    expect(packageLockSrc).not.toContain(`"${retiredAdminPackage}"`);
  });

  it('should remove legacy auth frontend stubs from served assets', () => {
    expect(fs.existsSync(path.join(rootDir, 'client/public/app.js'))).toBe(false);
    expect(fs.existsSync(path.join(rootDir, 'client/public', retiredProviderConfig))).toBe(false);
  });

  it('should keep the webpack pipeline off deprecated legacy-auth entrypoints', () => {
    expect(webpackConfigSrc).not.toContain("./public/app.js");
    expect(webpackConfigSrc).not.toContain(`./public/${retiredProviderConfig}`);
    expect(webpackConfigSrc).toContain("./public/js/config.js");
    expect(webpackConfigSrc).toContain("chunks: ['main', 'api']");

    expect(webpackSimpleConfigSrc).not.toContain("public/app.js");
    expect(webpackSimpleConfigSrc).toContain("public/js/config.js");
  });

  it('should exclude legacy auth test utilities from the production build output', () => {
    expect(buildConfigSrc).toContain("path.join('test', path.sep)");
    expect(buildConfigSrc).toContain("const BUILD_EXCLUDES = [");
  });

  it('should keep archival docs and maintenance scripts off retired provider references', () => {
    expect(migrationGuideSrc).not.toMatch(retiredProviderRegex);
    expect(securityChangelogSrc).not.toMatch(retiredProviderRegex);
    expect(secretsGuideSrc).not.toMatch(retiredProviderRegex);
    expect(rotateSecretsScriptSrc).not.toMatch(retiredProviderRegex);
    expect(cleanGitSecretsScriptSrc).not.toMatch(retiredProviderRegex);
  });
});
