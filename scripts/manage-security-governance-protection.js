/* eslint-disable security/detect-non-literal-fs-filename */
const { execFileSync } = require('child_process');
const fs = require('fs');

const BOOTSTRAP_CONTEXTS = ['Required Post-Deploy Render Smoke'];
const ENFORCED_CONTEXTS = [
  'Required Post-Deploy Render Smoke',
  'CODEOWNERS Security Governance Gate',
  'CodeQL Alert Gate'
];

function getArgValue(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find(argument => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function getBranches() {
  return getArgValue('branches', 'main,develop')
    .split(',')
    .map(branch => branch.trim())
    .filter(Boolean);
}

function requiredEnv(name) {
  if (!process.env[name]) {
    throw new Error(`${name} is required.`);
  }
  return process.env[name];
}

function ghApi(args, options = {}) {
  return execFileSync('gh', ['api', ...args], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: {
      ...process.env,
      GH_TOKEN: requiredEnv('GH_TOKEN')
    },
    ...options
  });
}

function ghApiJson(args) {
  return JSON.parse(ghApi(args));
}

function patchRequiredChecks(repository, branch, contexts) {
  ghApi([
    '--method',
    'PATCH',
    `repos/${repository}/branches/${branch}/protection/required_status_checks`,
    '-F',
    'strict=true',
    ...contexts.flatMap(context => ['-F', `contexts[]=${context}`])
  ]);
}

function patchReviewProtection(repository, branch, requireCodeOwnerReviews) {
  ghApi([
    '--method',
    'PATCH',
    `repos/${repository}/branches/${branch}/protection/required_pull_request_reviews`,
    '-F',
    'dismiss_stale_reviews=false',
    '-F',
    `require_code_owner_reviews=${requireCodeOwnerReviews ? 'true' : 'false'}`,
    '-F',
    'required_approving_review_count=1',
    '-F',
    'require_last_push_approval=false'
  ]);
}

function getProtectionStatus(repository, branch) {
  const protection = ghApiJson([
    `repos/${repository}/branches/${branch}/protection`
  ]);

  return {
    branch,
    contexts: protection.required_status_checks ? protection.required_status_checks.contexts || [] : [],
    requireCodeOwnerReviews: Boolean(
      protection.required_pull_request_reviews
      && protection.required_pull_request_reviews.require_code_owner_reviews
    )
  };
}

function classifyStatus(status) {
  const contexts = [...status.contexts].sort();
  const enforcedContexts = [...ENFORCED_CONTEXTS].sort();
  const bootstrapContexts = [...BOOTSTRAP_CONTEXTS].sort();

  if (
    status.requireCodeOwnerReviews
    && JSON.stringify(contexts) === JSON.stringify(enforcedContexts)
  ) {
    return 'fully-enforced';
  }

  if (
    !status.requireCodeOwnerReviews
    && JSON.stringify(contexts) === JSON.stringify(bootstrapContexts)
  ) {
    return 'bootstrap-safe';
  }

  return 'custom-or-drifted';
}

function assertBaseConfigExists() {
  const required = [
    ['.github/CODEOWNERS', '.github/CODEOWNERS'],
    ['.github/workflows/ci.yml', 'CODEOWNERS Security Governance Gate'],
    ['.github/workflows/codeql.yml', 'CodeQL Alert Gate']
  ];

  for (const [file, requiredText] of required) {
    if (!fs.existsSync(file)) {
      throw new Error(`Missing required governance file on base branch: ${file}`);
    }

    if (requiredText !== file && !fs.readFileSync(file, 'utf8').includes(requiredText)) {
      throw new Error(`Missing "${requiredText}" in ${file}.`);
    }
  }
}

function writeStepSummary(statuses) {
  if (!process.env.GITHUB_STEP_SUMMARY) {
    return;
  }

  const lines = [
    '## Security Governance Protection Status',
    '',
    '| Branch | Mode | Required checks | Code owner reviews |',
    '|---|---|---|---|',
    ...statuses.map(status => (
      `| ${status.branch} | ${classifyStatus(status)} | ${status.contexts.join('<br>')} | ${status.requireCodeOwnerReviews} |`
    )),
    ''
  ];

  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
}

function preflight(repository, branches) {
  const statuses = branches.map(branch => getProtectionStatus(repository, branch));

  for (const status of statuses) {
    patchRequiredChecks(repository, status.branch, status.contexts);
    patchReviewProtection(repository, status.branch, status.requireCodeOwnerReviews);
    console.log(`Preflight edit check passed for ${status.branch}.`);
  }

  writeStepSummary(statuses);
}

function enforce(repository, branches) {
  if (!hasFlag('skip-config-check')) {
    assertBaseConfigExists();
  }

  for (const branch of branches) {
    patchRequiredChecks(repository, branch, ENFORCED_CONTEXTS);
    patchReviewProtection(repository, branch, true);
    console.log(`Enabled fully-enforced governance protection for ${branch}.`);
  }
}

function rollback(repository, branches) {
  for (const branch of branches) {
    patchRequiredChecks(repository, branch, BOOTSTRAP_CONTEXTS);
    patchReviewProtection(repository, branch, false);
    console.log(`Restored bootstrap-safe governance protection for ${branch}.`);
  }
}

function status(repository, branches) {
  const statuses = branches.map(branch => getProtectionStatus(repository, branch));
  for (const branchStatus of statuses) {
    console.log(`${branchStatus.branch}: ${classifyStatus(branchStatus)} (${branchStatus.contexts.join(', ')}; codeOwnerReviews=${branchStatus.requireCodeOwnerReviews})`);
  }
  writeStepSummary(statuses);

  if (hasFlag('fail-on-drift')) {
    const driftedBranches = statuses
      .filter(branchStatus => classifyStatus(branchStatus) !== 'fully-enforced')
      .map(branchStatus => branchStatus.branch);

    if (driftedBranches.length > 0) {
      console.error(`Security governance protection drift detected on: ${driftedBranches.join(', ')}`);
      process.exitCode = 1;
    }
  }
}

function main() {
  const mode = getArgValue('mode', 'status');
  const repository = requiredEnv('GITHUB_REPOSITORY');
  const branches = getBranches();

  if (mode === 'preflight') {
    preflight(repository, branches);
  } else if (mode === 'enforce') {
    enforce(repository, branches);
  } else if (mode === 'rollback') {
    rollback(repository, branches);
  } else if (mode === 'status') {
    status(repository, branches);
  } else {
    throw new Error(`Unknown mode: ${mode}`);
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
  BOOTSTRAP_CONTEXTS,
  ENFORCED_CONTEXTS,
  classifyStatus
};
