#!/usr/bin/env node

/* eslint-disable security/detect-non-literal-fs-filename */

const fs = require('fs');
const { spawnSync } = require('child_process');

const RED = '\u001b[0;31m';
const YELLOW = '\u001b[1;33m';
const NC = '\u001b[0m';

const BLOCKED_FILE_PATTERNS = [
  /\.env$/i,
  /\.env\./i,
  /serviceAccountKey\.json/i,
  /credentials\.json/i,
  /firebase-credentials/i,
  /gcp-credentials/i,
  /aws-credentials/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.keystore$/i,
  /\.jks$/i,
  /id_rsa/i,
  /id_dsa/i,
  /id_ecdsa/i,
  /id_ed25519/i,
  /mongodb-credentials/i
];

const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/i,
  /(api_key|apikey|api_secret|secret_key|access_key|auth_token)\s*[=:]\s*["'][a-zA-Z0-9/+=_-]{20,}/i,
  /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/i,
  /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+/i,
  /mongodb(\+srv)?:\/\/[^:]+:[^@]+@/i,
  /postgres(ql)?:\/\/[^:]+:[^@]+@/i,
  /mysql:\/\/[^:]+:[^@]+@/i,
  /redis:\/\/:[^@]+@/i,
  /rzp_live_[a-zA-Z0-9]+/i,
  /AIzaSy[a-zA-Z0-9_-]{33}/i,
  /xox[bpors]-[a-zA-Z0-9-]+/i,
  /gh[pousr]_[a-zA-Z0-9]{36,}/i,
  /password\s*[=:]\s*["'][^\s"']{8,}/i
];

const SKIP_CONTENT_PATTERNS = [
  /\.env\.example$/i,
  /\.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|pdf|zip|tar|gz|lock|min\.js|min\.css|map)$/i,
  /(^|\/)node_modules\//,
  /^\.githooks\//,
  /\.test\.(js|ts)$/i,
  /\.spec\.(js|ts)$/i,
  /(^|\/)__tests__\//
];

function runGit(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    windowsHide: true
  });

  if (result.error) {
    throw new Error(`git ${args.join(' ')} failed: ${result.error.message}`);
  }

  return {
    status: result.status,
    stdout: result.stdout || ''
  };
}

function getStagedFiles() {
  const result = runGit(['diff', '--cached', '--name-only', '--diff-filter=ACR']);

  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function shouldSkipContentScan(file) {
  return SKIP_CONTENT_PATTERNS.some((pattern) => pattern.test(file));
}

function getAddedPatchLines(file) {
  const result = runGit(['diff', '--cached', '-p', '--', file]);

  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'));
}

function runPreCommit() {
  const stagedFiles = getStagedFiles();
  let blocked = false;

  for (const file of stagedFiles) {
    if (/\.env\.example$/i.test(file)) {
      continue;
    }

    if (BLOCKED_FILE_PATTERNS.some((pattern) => pattern.test(file))) {
      console.error(`${RED}BLOCKED${NC} Sensitive file staged for commit: ${YELLOW}${file}${NC}`);
      blocked = true;
    }
  }

  for (const file of stagedFiles) {
    if (shouldSkipContentScan(file)) {
      continue;
    }

    const addedLines = getAddedPatchLines(file);
    for (const pattern of SECRET_PATTERNS) {
      const match = addedLines.find((line) => pattern.test(line));

      if (!match) {
        continue;
      }

      console.error(`${RED}BLOCKED${NC} Possible secret in ${YELLOW}${file}${NC}`);
      console.error(`  Pattern: ${pattern}`);
      console.error(`  Near:    ${match.slice(0, 80)}...`);
      blocked = true;
      break;
    }
  }

  if (!blocked) {
    return 0;
  }

  console.error('');
  console.error(`${RED}========================================${NC}`);
  console.error(`${RED} COMMIT BLOCKED - Secrets detected!${NC}`);
  console.error(`${RED}========================================${NC}`);
  console.error('');
  console.error('Bots scan every GitHub commit in real-time for exposed secrets.');
  console.error('Your keys can be compromised within seconds of pushing.');
  console.error('');
  console.error('To fix:');
  console.error('  1. Remove the flagged files:  git reset HEAD <file>');
  console.error('  2. Add them to .gitignore');
  console.error('  3. If already pushed, rotate ALL exposed credentials immediately');
  console.error('');
  console.error('To bypass (emergencies only):');
  console.error('  git commit --no-verify');
  console.error('');

  return 1;
}

function runCommitMsg(args) {
  const commitMessageFile = args[0];

  if (!commitMessageFile || !fs.existsSync(commitMessageFile)) {
    console.error('commit-msg hook could not read the commit message file.');
    return 1;
  }

  const commitMessage = fs.readFileSync(commitMessageFile, 'utf8')
    .split(/\r?\n/)[0]
    .replace(/\r/g, '');

  if (/^(Merge|Revert|fixup!|squash!|Initial commit)/.test(commitMessage)) {
    return 0;
  }

  const conventionalPattern = /^(feat|fix|refactor|docs|test|chore|ci|build|perf|style|hotfix|release)(\([a-z0-9._/-]+\))?!?: [^ ].{2,72}$/;
  if (conventionalPattern.test(commitMessage)) {
    return 0;
  }

  console.error(`Commit message rejected.

Use a Conventional Commit style message:
  feat: add patient booking validation
  fix(auth): handle expired sessions
  chore(ci): cache Playwright browsers

Allowed types:
  feat, fix, refactor, docs, test, chore, ci, build, perf, style, hotfix, release`);

  return 1;
}

function runPrePush() {
  const branchResult = runGit(['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const currentBranch = branchResult.stdout.trim();

  if (!currentBranch || process.env.NOCTURNAL_ALLOW_PROTECTED_PUSH === '1') {
    return 0;
  }

  if (/^(main|develop)$/.test(currentBranch)) {
    console.error(`Direct pushes to '${currentBranch}' are blocked.

Create a short-lived branch and open a pull request instead.
Emergency override:
  git push --no-verify`);
    return 1;
  }

  const workingBranchPattern = /^(feature|fix|bugfix|hotfix|refactor|docs|chore|experiment|release)\/[a-z0-9._-]+$/;
  if (workingBranchPattern.test(currentBranch)) {
    return 0;
  }

  console.error(`Branch name '${currentBranch}' does not match the team convention.

Use one of:
  feature/<scope>
  fix/<scope>
  bugfix/<scope>
  hotfix/<scope>
  refactor/<scope>
  docs/<scope>
  chore/<scope>
  experiment/<scope>
  release/<scope>`);
  return 1;
}

function run(hookName, args = []) {
  try {
    if (hookName === 'pre-commit') {
      return runPreCommit();
    }

    if (hookName === 'commit-msg') {
      return runCommitMsg(args);
    }

    if (hookName === 'pre-push') {
      return runPrePush();
    }
  } catch (error) {
    console.error(error.message);
    return 1;
  }

  console.error(`Unknown git hook: ${hookName}`);
  return 1;
}

if (require.main === module) {
  const [hookName, ...args] = process.argv.slice(2);
  process.exit(run(hookName, args));
}

module.exports = { run };
