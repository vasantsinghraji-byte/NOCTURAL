const { execFileSync } = require('child_process');

const STACK_SCOPE_RULES = {
  'fix/patient-data-hardening': {
    owner: 'PR #86 frontend raw-HTML hardening',
    patterns: [
      /^client\/public\/js\/patient-[^/]+\.js$/,
      /^client\/public\/roles\/patient\//
    ]
  },
  'fix/provider-ops-hardening': {
    owner: 'PR #86 frontend raw-HTML hardening',
    patterns: [
      /^client\/public\/js\/doctor-[^/]+\.js$/,
      /^client\/public\/roles\/doctor\//
    ]
  }
};

function normalizePath(filePath) {
  return String(filePath || '').replace(/\\/g, '/');
}

function getScopeViolations(branch, changedFiles) {
  const rule = STACK_SCOPE_RULES[branch];
  if (!rule) return [];

  return changedFiles
    .map(normalizePath)
    .filter(filePath => rule.patterns.some(pattern => pattern.test(filePath)));
}

function assertStackScope(branch, changedFiles) {
  const violations = getScopeViolations(branch, changedFiles);
  if (violations.length === 0) return;

  const owner = STACK_SCOPE_RULES[branch].owner;
  throw new Error([
    `${branch} contains frontend files owned by ${owner}:`,
    ...violations.map(filePath => `- ${filePath}`)
  ].join('\n'));
}

function getChangedFiles(baseSha, headSha) {
  if (!baseSha || !headSha) {
    throw new Error('STACK_SCOPE_BASE_SHA and STACK_SCOPE_HEAD_SHA are required for scoped branches.');
  }

  const output = execFileSync('git', ['diff', '--name-only', '-z', `${baseSha}...${headSha}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return output.split('\0').filter(Boolean);
}

function main() {
  const branch = process.env.STACK_SCOPE_BRANCH || process.env.GITHUB_HEAD_REF || '';
  if (!STACK_SCOPE_RULES[branch]) {
    console.log(`No stack-scope frontend ownership rule for ${branch || 'current ref'}.`);
    return;
  }

  const changedFiles = getChangedFiles(
    process.env.STACK_SCOPE_BASE_SHA,
    process.env.STACK_SCOPE_HEAD_SHA
  );
  assertStackScope(branch, changedFiles);
  console.log(`Stack-scope frontend ownership check passed for ${branch}.`);
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
  STACK_SCOPE_RULES,
  assertStackScope,
  getScopeViolations,
  normalizePath
};
