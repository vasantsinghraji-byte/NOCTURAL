const { spawnSync } = require('child_process');
const baseline = require('../.lint-warning-baseline.json');

const result = spawnSync(process.execPath, [
  './node_modules/eslint/bin/eslint.js',
  '.',
  '--format',
  'json'
], {
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024,
  env: process.env
});

if (result.error) {
  console.error(`Failed to run ESLint: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0 && !result.stdout) {
  if (result.stderr) process.stderr.write(result.stderr);
  console.error(`ESLint exited with status ${result.status} before producing a JSON report`);
  process.exit(result.status || 1);
}

const report = JSON.parse(result.stdout || '[]');
const errors = report.reduce((sum, file) => sum + file.errorCount, 0);
const warnings = report.reduce((sum, file) => sum + file.warningCount, 0);
console.log(`ESLint: ${errors} errors, ${warnings} warnings (baseline maximum: ${baseline.maxWarnings})`);
if (errors > 0 || warnings > baseline.maxWarnings) process.exitCode = 1;
