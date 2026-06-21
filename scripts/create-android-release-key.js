const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const androidDir = path.join(rootDir, 'android');
const secretsDir = process.env.ANDROID_RELEASE_SECRETS_DIR
  ? path.resolve(process.env.ANDROID_RELEASE_SECRETS_DIR)
  : path.resolve(rootDir, '..', 'android-release-secrets');
const keystorePath = path.join(secretsDir, 'nocturnal-upload-key.jks');
const credentialsPath = path.join(secretsDir, 'release-signing-credentials.txt');
const propertiesPath = path.join(androidDir, 'keystore.properties');
const alias = 'nocturnal-upload';

if ([keystorePath, credentialsPath, propertiesPath].some(file => fs.existsSync(file))) {
  console.error('Release signing files already exist. Refusing to overwrite them.');
  process.exit(1);
}

const findKeytool = () => {
  const candidates = [process.env.JAVA_HOME].filter(Boolean);
  if (process.platform === 'win32') {
    const adoptiumDir = 'C:\\Program Files\\Eclipse Adoptium';
    if (fs.existsSync(adoptiumDir)) {
      fs.readdirSync(adoptiumDir)
        .filter(name => name.startsWith('jdk-21'))
        .sort()
        .reverse()
        .forEach(name => candidates.push(path.join(adoptiumDir, name)));
    }
  }

  return candidates
    .map(home => path.join(home, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool'))
    .find(executable => fs.existsSync(executable));
};

const keytool = findKeytool();
if (!keytool) {
  console.error('JDK 21 keytool was not found.');
  process.exit(1);
}

fs.mkdirSync(secretsDir, { recursive: true });
const password = crypto.randomBytes(24).toString('base64url');
const result = spawnSync(keytool, [
  '-genkeypair',
  '-v',
  '-keystore', keystorePath,
  '-storetype', 'PKCS12',
  '-alias', alias,
  '-keyalg', 'RSA',
  '-keysize', '4096',
  '-validity', '10000',
  '-storepass', password,
  '-keypass', password,
  '-dname', 'CN=Nocturnal Healthcare, OU=Mobile, O=Nocturnal, L=Jaipur, ST=Rajasthan, C=IN'
], { stdio: 'inherit' });

if (result.status !== 0) {
  process.exit(result.status || 1);
}

fs.writeFileSync(propertiesPath, [
  `storeFile=${keystorePath.replace(/\\/g, '\\\\')}`,
  `storePassword=${password}`,
  `keyAlias=${alias}`,
  `keyPassword=${password}`,
  ''
].join('\n'), { mode: 0o600 });

fs.writeFileSync(credentialsPath, [
  'Nocturnal Android upload signing credentials',
  `Keystore: ${keystorePath}`,
  `Alias: ${alias}`,
  `Store/key password: ${password}`,
  '',
  'Back up this directory securely. Losing this upload key can block future updates.'
].join('\n'), { mode: 0o600 });

console.log(`Release signing key created at ${keystorePath}`);
console.log(`Credentials saved at ${credentialsPath}`);
