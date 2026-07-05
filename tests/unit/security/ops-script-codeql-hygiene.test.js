/* eslint-disable security/detect-non-literal-fs-filename -- Contract test reads fixed repo files by relative path. */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../../..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

describe('ops script CodeQL hygiene', () => {
  it('uses unbiased random indexes for generated passwords', () => {
    const setupMongoSecurity = readProjectFile('scripts/setup-mongodb-security.js');
    const rotateSecrets = readProjectFile('scripts/rotate-secrets.js');

    expect(setupMongoSecurity).toContain('crypto.randomInt(chars.length)');
    expect(rotateSecrets).toContain('crypto.randomInt(chars.length)');
    expect(setupMongoSecurity).not.toMatch(/%\s*chars\.length/);
    expect(rotateSecrets).not.toMatch(/%\s*chars\.length/);
  });

  it('avoids shell command strings for MongoDB backup and restore operations', () => {
    const backupDatabase = readProjectFile('scripts/backup-database.js');

    expect(backupDatabase).toContain("const { execFile } = require('child_process');");
    expect(backupDatabase).toContain("execFile('mongodump', dumpArgs");
    expect(backupDatabase).toContain("execFile('mongorestore', restoreArgs");
    expect(backupDatabase).not.toContain("const { exec } = require('child_process');");
    expect(backupDatabase).not.toMatch(/exec\(\s*command/);
  });

  it('uses operation-first file handling for setup scripts', () => {
    const setupEnv = readProjectFile('scripts/setup-env.js');
    const setupMongoSecurity = readProjectFile('scripts/setup-mongodb-security.js');

    expect(setupEnv).toContain('fs.constants.COPYFILE_EXCL');
    expect(setupEnv).toContain("error.code === 'EEXIST'");
    expect(setupMongoSecurity).toContain("error.code !== 'ENOENT'");
    expect(setupEnv).not.toContain('fs.existsSync');
    expect(setupMongoSecurity).not.toContain('fs.existsSync');
  });
});
