const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const androidDir = path.join(rootDir, 'android');
const gradleTasks = process.argv.slice(2);
const tasks = gradleTasks.length > 0 ? gradleTasks : ['assembleDebug'];

const getJavaMajorVersion = (javaHome) => {
  const executable = path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  // The executable path is derived only from configured/local JDK directories.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!fs.existsSync(executable)) return null;

  const result = spawnSync(executable, ['-version'], { encoding: 'utf8' });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const match = output.match(/version "(\d+)/);
  return match ? Number(match[1]) : null;
};

const getJavaCandidates = () => {
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

  return [...new Set(candidates)];
};

const javaHome = getJavaCandidates().find(candidate => getJavaMajorVersion(candidate) >= 21);
if (!javaHome) {
  console.error('Android builds require JDK 21 or newer. Set JAVA_HOME to a compatible JDK.');
  process.exit(1);
}

const gradleExecutable = process.platform === 'win32'
  ? path.join(androidDir, 'gradlew.bat')
  : path.join(androidDir, 'gradlew');
const separator = process.platform === 'win32' ? ';' : ':';
const isReleaseBuild = tasks.some(task => /release/i.test(task));
if (isReleaseBuild && !fs.existsSync(path.join(androidDir, 'keystore.properties'))) {
  console.error('Release signing is not configured. Run: npm run android:release-key');
  process.exit(1);
}

const result = spawnSync(gradleExecutable, tasks, {
  cwd: androidDir,
  env: {
    ...process.env,
    JAVA_HOME: javaHome,
    PATH: `${path.join(javaHome, 'bin')}${separator}${process.env.PATH || ''}`
  },
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

process.exit(result.status === null ? 1 : result.status);
