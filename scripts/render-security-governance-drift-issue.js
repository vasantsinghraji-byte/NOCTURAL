function buildDriftIssueBody(options = {}) {
  const {
    runUrl = '',
    auditOutput = ''
  } = options;

  return [
    'Security governance branch protection drift was detected by the monthly audit.',
    '',
    `Workflow run: ${runUrl}`,
    '',
    '```',
    auditOutput,
    '```',
    '',
    'Expected mode for both main and develop:',
    '- Required checks: Required Post-Deploy Render Smoke, CODEOWNERS Security Governance Gate, CodeQL Alert Gate',
    '- Code-owner reviews: true',
    '',
    'Remediation:',
    '1. Confirm BRANCH_PROTECTION_APP_ID and BRANCH_PROTECTION_APP_PRIVATE_KEY are set for the installed governance GitHub App.',
    '2. Run the Security Governance Protection Bootstrap workflow on main.',
    '3. Re-run this audit workflow.'
  ].join('\n');
}

function main() {
  process.stdout.write(buildDriftIssueBody({
    runUrl: process.env.RUN_URL || '',
    auditOutput: process.env.AUDIT_OUTPUT || ''
  }));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildDriftIssueBody
};
