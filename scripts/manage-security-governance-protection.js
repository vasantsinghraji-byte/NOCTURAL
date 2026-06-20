/* eslint-disable no-console, security/detect-non-literal-fs-filename */
const { execFileSync } = require('child_process');
const fs = require('fs');

const BOOTSTRAP_CONTEXTS = ['Required Post-Deploy Render Smoke'];
const ENFORCED_CONTEXTS = [
  'Required Post-Deploy Render Smoke',
  'CODEOWNERS Security Governance Gate',
  'Analyze (javascript-typescript)',
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

function patchReviewProtection(repository, branch, settings) {
  ghApi([
    '--method',
    'PATCH',
    `repos/${repository}/branches/${branch}/protection/required_pull_request_reviews`,
    '-F',
    `dismiss_stale_reviews=${settings.dismissStaleReviews ? 'true' : 'false'}`,
    '-F',
    `require_code_owner_reviews=${settings.requireCodeOwnerReviews ? 'true' : 'false'}`,
    '-F',
    'required_approving_review_count=1',
    '-F',
    `require_last_push_approval=${settings.requireLastPushApproval ? 'true' : 'false'}`
  ]);
}

function getBranchProtectionRuleId(repository, branch) {
  const [owner, name, ...extra] = repository.split('/');
  if (!owner || !name || extra.length > 0) {
    throw new Error(`Invalid GITHUB_REPOSITORY value: ${repository}`);
  }

  const response = ghApiJson([
    'graphql',
    '-f',
    'query=query($owner:String!,$name:String!){repository(owner:$owner,name:$name){branchProtectionRules(first:100){nodes{id pattern}}}}',
    '-F',
    `owner=${owner}`,
    '-F',
    `name=${name}`
  ]);
  const rule = response.repository.branchProtectionRules.nodes.find(candidate => candidate.pattern === branch);
  if (!rule) {
    throw new Error(`No exact branch protection rule found for ${branch}.`);
  }
  return rule.id;
}

function patchConversationResolution(repository, branch, enabled) {
  const ruleId = getBranchProtectionRuleId(repository, branch);
  ghApi([
    'graphql',
    '-f',
    'query=mutation($ruleId:ID!,$enabled:Boolean!){updateBranchProtectionRule(input:{branchProtectionRuleId:$ruleId,requiresConversationResolution:$enabled}){branchProtectionRule{id}}}',
    '-F',
    `ruleId=${ruleId}`,
    '-F',
    `enabled=${enabled ? 'true' : 'false'}`
  ]);
}

function getProtectionStatus(repository, branch) {
  const protection = ghApiJson([
    `repos/${repository}/branches/${branch}/protection`
  ]);

  const reviews = protection.required_pull_request_reviews || {};
  return {
    branch,
    contexts: protection.required_status_checks ? protection.required_status_checks.contexts || [] : [],
    requireCodeOwnerReviews: Boolean(reviews.require_code_owner_reviews),
    dismissStaleReviews: Boolean(reviews.dismiss_stale_reviews),
    requireLastPushApproval: Boolean(reviews.require_last_push_approval),
    requireConversationResolution: Boolean(
      protection.required_conversation_resolution
      && protection.required_conversation_resolution.enabled
    )
  };
}

function classifyStatus(status) {
  const contexts = [...status.contexts].sort();
  const enforcedContexts = [...ENFORCED_CONTEXTS].sort();
  const bootstrapContexts = [...BOOTSTRAP_CONTEXTS].sort();

  if (
    status.requireCodeOwnerReviews
    && status.dismissStaleReviews
    && status.requireLastPushApproval
    && status.requireConversationResolution
    && JSON.stringify(contexts) === JSON.stringify(enforcedContexts)
  ) {
    return 'fully-enforced';
  }

  if (
    !status.requireCodeOwnerReviews
    && !status.dismissStaleReviews
    && !status.requireLastPushApproval
    && !status.requireConversationResolution
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
    ['.github/workflows/codeql.yml', 'Analyze (javascript-typescript)']
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
    '| Branch | Mode | Required checks | Code owner reviews | Dismiss stale reviews | Last-push approval | Resolved conversations |',
    '|---|---|---|---|---|---|---|',
    ...statuses.map(status => (
      `| ${status.branch} | ${classifyStatus(status)} | ${status.contexts.join('<br>')} | ${status.requireCodeOwnerReviews} | ${status.dismissStaleReviews} | ${status.requireLastPushApproval} | ${status.requireConversationResolution} |`
    )),
    ''
  ];

  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
}

function preflight(repository, branches) {
  const statuses = branches.map(branch => getProtectionStatus(repository, branch));

  for (const status of statuses) {
    patchRequiredChecks(repository, status.branch, status.contexts);
    patchReviewProtection(repository, status.branch, status);
    patchConversationResolution(repository, status.branch, status.requireConversationResolution);
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
    patchReviewProtection(repository, branch, {
      requireCodeOwnerReviews: true,
      dismissStaleReviews: true,
      requireLastPushApproval: true
    });
    patchConversationResolution(repository, branch, true);
    console.log(`Enabled fully-enforced governance protection for ${branch}.`);
  }
}

function rollback(repository, branches) {
  for (const branch of branches) {
    patchRequiredChecks(repository, branch, BOOTSTRAP_CONTEXTS);
    patchReviewProtection(repository, branch, {
      requireCodeOwnerReviews: false,
      dismissStaleReviews: false,
      requireLastPushApproval: false
    });
    patchConversationResolution(repository, branch, false);
    console.log(`Restored bootstrap-safe governance protection for ${branch}.`);
  }
}

function status(repository, branches) {
  const statuses = branches.map(branch => getProtectionStatus(repository, branch));
  for (const branchStatus of statuses) {
    console.log(`${branchStatus.branch}: ${classifyStatus(branchStatus)} (${branchStatus.contexts.join(', ')}; codeOwnerReviews=${branchStatus.requireCodeOwnerReviews}; dismissStaleReviews=${branchStatus.dismissStaleReviews}; lastPushApproval=${branchStatus.requireLastPushApproval}; conversationResolution=${branchStatus.requireConversationResolution})`);
  }
  writeStepSummary(statuses);
  if (hasFlag('fail-on-drift') && statuses.some(branchStatus => classifyStatus(branchStatus) !== 'fully-enforced')) {
    throw new Error('Security governance branch protection drift detected.');
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
