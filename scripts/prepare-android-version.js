const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const outputPath = path.join(rootDir, 'android', 'version.properties');
const configuredVersionCode = Number(process.env.ANDROID_VERSION_CODE);
const versionCode = Number.isInteger(configuredVersionCode) && configuredVersionCode > 0
  ? configuredVersionCode
  : Math.floor(Date.now() / 1000);
const versionName = process.env.ANDROID_VERSION_NAME || packageJson.version;

if (!/^\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?$/.test(versionName)) {
  throw new Error(`Invalid Android version name: ${versionName}`);
}

fs.writeFileSync(outputPath, `VERSION_CODE=${versionCode}\nVERSION_NAME=${versionName}\n`);
console.log(`Android version prepared: ${versionName} (${versionCode})`);
