#!/usr/bin/env node

/* eslint-disable security/detect-non-literal-fs-filename */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const isCi = process.env.CI === 'true' || Boolean(process.env.GITHUB_ACTIONS);

const failures = [];
const warnings = [];

function rel(filePath) {
  return filePath.replace(repoRoot + path.sep, '').replaceAll(path.sep, '/');
}

function read(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), 'utf8');
}

function exists(filePath) {
  return fs.existsSync(path.join(repoRoot, filePath));
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function warn(message) {
  warnings.push(message);
  console.log(`WARN ${message}`);
}

function fail(message) {
  failures.push(message);
  console.log(`FAIL ${message}`);
}

function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (_error) {
    return '';
  }
}

function requireFile(filePath, description = filePath) {
  if (exists(filePath)) {
    pass(`${description} exists`);
    return true;
  }
  fail(`${description} is missing (${filePath})`);
  return false;
}

function requireContent(filePath, pattern, description) {
  if (!exists(filePath)) {
    fail(`${description}: ${filePath} is missing`);
    return;
  }

  const content = read(filePath);
  if (pattern.test(content)) {
    pass(description);
  } else {
    fail(`${description} (${filePath})`);
  }
}

function checkBranch() {
  const branch =
    process.env.GITHUB_HEAD_REF ||
    process.env.GITHUB_REF_NAME ||
    git(['symbolic-ref', '--quiet', '--short', 'HEAD']);

  if (!branch) {
    warn('Could not determine the current branch name; detached HEAD is allowed for CI/release checks.');
    return;
  }

  const protectedBranch = /^(main|develop)$/;
  const workingBranch = /^(feature|fix|bugfix|hotfix|refactor|docs|chore|experiment|release)\/[a-z0-9._-]+$/;
  // Automated dependency-update branches (Dependabot et al.) are bot-generated
  // and follow their own naming (dependabot/<ecosystem>/...). They aren't
  // subject to the team naming convention, so exempt them instead of failing.
  const automatedBranch = /^dependabot\//;

  if (protectedBranch.test(branch)) {
    pass(`Current branch is protected branch ${branch}; use pull requests for changes.`);
  } else if (workingBranch.test(branch)) {
    pass(`Current branch name follows the team convention (${branch})`);
  } else if (automatedBranch.test(branch)) {
    pass(`Current branch is an automated dependency branch (${branch}); naming convention check skipped.`);
  } else {
    fail(`Current branch name "${branch}" does not match the team convention.`);
  }

  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  if (!upstream) {
    warn(`Current branch "${branch}" has no upstream configured.`);
    return;
  }

  const divergence = git(['rev-list', '--left-right', '--count', `${upstream}...HEAD`]);
  const [behind, ahead] = divergence.split(/\s+/).map(Number);
  if (Number.isFinite(behind) && Number.isFinite(ahead)) {
    if (behind > 0 || ahead > 0) {
      warn(`Current branch diverges from ${upstream}: ${ahead} ahead, ${behind} behind.`);
    } else {
      pass(`Current branch is in sync with ${upstream}`);
    }
  }
}

function checkHooks() {
  const hooks = ['pre-commit', 'commit-msg', 'pre-push'];
  for (const hook of hooks) {
    requireFile(path.join('.githooks', hook), `${hook} hook`);
  }

  requireContent('.githooks/pre-commit', /gitleaks|SECRET_PATTERNS|BLOCKED_FILE_PATTERNS/, 'pre-commit blocks common secret leaks');
  requireContent('.githooks/commit-msg', /Conventional Commit|CONVENTIONAL_PATTERN/, 'commit-msg enforces structured commit messages');
  requireContent('.githooks/pre-push', /PROTECTED_BRANCH_PATTERN|main\|develop/, 'pre-push protects main and develop');
  requireContent('.githooks/pre-push', /WORKING_BRANCH_PATTERN|feature\|fix\|bugfix/, 'pre-push validates working branch names');

  const hooksPath = git(['config', '--get', 'core.hooksPath']);
  if (hooksPath.replace(/\\/g, '/') === '.githooks') {
    pass('Git hooks path is configured to .githooks');
  } else if (isCi) {
    warn('Git hooks path is not configured in CI; hook files are still validated.');
  } else {
    fail('Git hooks path is not configured. Run: npm run hooks:install');
  }
}

function checkLockfiles() {
  const packageFiles = ['package.json', 'client/package.json'];
  for (const packageFile of packageFiles) {
    const lockFile = packageFile.replace(/package\.json$/, 'package-lock.json');
    if (exists(packageFile)) {
      requireFile(lockFile, `${rel(path.join(repoRoot, lockFile))} for ${packageFile}`);
    }
  }

  const alternateLocks = ['yarn.lock', 'pnpm-lock.yaml', 'client/yarn.lock', 'client/pnpm-lock.yaml'];
  const foundAlternateLocks = alternateLocks.filter(exists);
  if (foundAlternateLocks.length > 0) {
    fail(`Unexpected alternate lockfile(s): ${foundAlternateLocks.join(', ')}. Keep npm lockfiles canonical.`);
  } else {
    pass('No alternate package-manager lockfiles found');
  }
}

function checkCiWorkflow() {
  const workflow = '.github/workflows/ci.yml';
  requireFile(workflow, 'CI workflow');
  if (!exists(workflow)) {
    return;
  }

  requireContent(workflow, /concurrency:\s*[\s\S]*cancel-in-progress:\s*true/, 'CI cancels stale runs for the same ref');
  requireContent(workflow, /timeout-minutes:/, 'CI jobs define explicit timeouts');
  requireContent(workflow, /uses:\s*actions\/setup-node@[\w.-]+[\s\S]*cache:\s*['"]?npm['"]?/, 'CI enables npm dependency caching');
  requireContent(workflow, /cache-dependency-path:[\s\S]*package-lock\.json[\s\S]*client\/package-lock\.json/, 'CI cache keys include root and client lockfiles');
  requireContent(workflow, /\brun:\s*npm ci\b/, 'CI installs dependencies with npm ci');
  requireContent(workflow, /actions\/cache@[\w.-]+[\s\S]*ms-playwright/, 'CI caches Playwright browser downloads');
  requireContent(workflow, /npm run lint:baseline|npm run lint|run-stacked-pr-validation\.js lint/, 'CI runs ESLint or the lint warning baseline');
  requireContent(workflow, /npm run test:ci|npm test|run-stacked-pr-validation\.js test/, 'CI runs automated tests');
}

function checkDocsAndTemplates() {
  requireFile('CONTRIBUTING.md', 'workflow documentation');
  requireFile('.github/pull_request_template.md', 'pull request template');

  requireContent('CONTRIBUTING.md', /Branch Strategy/, 'Contributing guide documents branch strategy');
  requireContent('CONTRIBUTING.md', /Conventional Commit|Commit Standard/, 'Contributing guide documents commit standards');
  requireContent('CONTRIBUTING.md', /act pull_request/, 'Contributing guide documents local GitHub Actions dry-runs with act');
  requireContent('CONTRIBUTING.md', /hooks:install|\.githooks/, 'Contributing guide documents hook installation');
  requireContent('.github/pull_request_template.md', /Validation[\s\S]*npm run lint/, 'PR template requires lint validation evidence');
  requireContent('.github/pull_request_template.md', /Risk Review/, 'PR template requires risk review');
  requireContent('.github/pull_request_template.md', /Rollback Plan/, 'PR template requires rollback planning');
}

function checkSecretIgnoreRules() {
  requireFile('.gitignore', 'gitignore');
  requireContent('.gitignore', /^\.env$/m, '.gitignore blocks .env');
  requireContent('.gitignore', /\*\.jks|android\/keystore\.properties/, '.gitignore blocks signing key material');
  requireContent('.gitignore', /credentials\.json|serviceAccountKey\.json/, '.gitignore blocks cloud credential files');
}

function main() {
  console.log('Nocturnal repository governance check');
  console.log(`Repo: ${repoRoot}`);
  console.log('');

  checkBranch();
  checkHooks();
  checkLockfiles();
  checkCiWorkflow();
  checkDocsAndTemplates();
  checkSecretIgnoreRules();

  console.log('');
  console.log(`Summary: ${failures.length} failure(s), ${warnings.length} warning(s)`);

  if (warnings.length > 0) {
    for (const message of warnings) {
      console.log(`WARN ${message}`);
    }
  }

  if (failures.length > 0) {
    console.log('');
    for (const message of failures) {
      console.log(`FAIL ${message}`);
    }
    process.exit(1);
  }
}

main();
