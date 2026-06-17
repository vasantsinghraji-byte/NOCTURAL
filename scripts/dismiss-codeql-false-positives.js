/* eslint-disable no-console, security/detect-non-literal-fs-filename */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { parseCsv } = require('./export-codeql-alerts');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_TRACKER_PATH = path.join(ROOT, 'docs', 'security', 'codeql-alert-tracker.csv');

function getArgValue(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find(argument => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function getRemoteRepository() {
  const output = execFileSync('git', ['remote', 'get-url', 'origin'], {
    cwd: ROOT,
    encoding: 'utf8'
  }).trim();
  const match = output.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
  return match ? match[1] : '';
}

function getRepository() {
  return getArgValue('repo', process.env.GITHUB_REPOSITORY || getRemoteRepository());
}

function dismissAlert(repository, alertNumber, reason, comment) {
  const fields = [
    'api',
    '--method',
    'PATCH',
    `repos/${repository}/code-scanning/alerts/${alertNumber}`,
    '-f',
    'state=dismissed',
    '-f',
    `dismissed_reason=${reason}`,
    '-f',
    `dismissed_comment=${comment}`
  ];

  execFileSync('gh', fields, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe'
  });
}

function getFalsePositiveRows(trackerPath) {
  if (!fs.existsSync(trackerPath)) {
    throw new Error(`Tracker CSV not found: ${trackerPath}`);
  }

  return parseCsv(fs.readFileSync(trackerPath, 'utf8'))
    .filter(row => row.status === 'false-positive');
}

function main() {
  const repository = getRepository();
  const trackerPath = path.resolve(ROOT, getArgValue('tracker', DEFAULT_TRACKER_PATH));
  const reason = getArgValue('reason', 'false positive');
  const dryRun = hasFlag('dry-run');

  if (!repository) {
    throw new Error('Could not resolve GitHub repository. Pass --repo=owner/name or set GITHUB_REPOSITORY.');
  }

  const rows = getFalsePositiveRows(trackerPath);
  if (rows.length === 0) {
    console.log('No tracker rows marked false-positive.');
    return;
  }

  for (const row of rows) {
    const comment = row.notes
      ? `Tracked false positive in ${path.relative(ROOT, trackerPath)}: ${row.notes}`
      : `Tracked false positive in ${path.relative(ROOT, trackerPath)}.`;

    if (dryRun) {
      console.log(`[dry-run] Would dismiss CodeQL alert ${row.alertNumber}: ${row.ruleId} ${row.path}`);
    } else {
      dismissAlert(repository, row.alertNumber, reason, comment);
      console.log(`Dismissed CodeQL alert ${row.alertNumber}: ${row.ruleId} ${row.path}`);
    }
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  getFalsePositiveRows
};
