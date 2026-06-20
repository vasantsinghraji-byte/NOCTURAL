const fs = require('fs');
const path = require('path');

const workflow = fs.readFileSync(
  path.join(__dirname, '../../../.github/workflows/ci.yml'),
  'utf8'
);
const validator = fs.readFileSync(
  path.join(__dirname, '../../../scripts/run-stacked-pr-validation.js'),
  'utf8'
);

describe('ready stacked PR CI gates', () => {
  const earlyStackBranches = [
    'feature/security-audit-notification-core',
    'fix/auth-session-revocation',
    'feature/auth-webauthn-recovery',
    'feature/admin-security-audit-export',
    'fix/uploads-stored-file-authorization',
    'fix/bookings-idempotent-payments',
    'fix/patient-data-hardening',
    'fix/provider-ops-hardening'
  ];

  it('defers all three repo-wide jobs for early stack branches', () => {
    expect(workflow.match(/!contains\(fromJSON\(/g)).toHaveLength(3);
    for (const branch of earlyStackBranches) {
      expect(workflow.match(new RegExp(branch, 'g'))).toHaveLength(3);
    }
  });

  it('keeps this governance branch on targeted validation', () => {
    expect(validator).toContain("'chore/stack-ready-ci-gates'");
    expect(validator).toContain("'chore/require-codeql-alert-gate'");
    expect(validator).toContain("? 'chore/repo-governance-lint-ci'");
  });
});
