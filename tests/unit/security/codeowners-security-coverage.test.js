const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const {
  getUniqueApiOwners,
  parseCodeowners,
  patternCoversPath,
  validateCodeownersOwnerExistence,
  validateCodeownersSecurityCoverage,
  validateRequiredStatusChecksExist
} = require('../../../scripts/validate-codeowners-security-coverage');
const {
  classifyStatus,
  getDriftedBranches
} = require('../../../scripts/manage-security-governance-protection');
const {
  buildDriftIssueBody
} = require('../../../scripts/render-security-governance-drift-issue');

const ROOT = path.resolve(__dirname, '../../..');

describe('CODEOWNERS security-governance validator', () => {
  it('classifies bootstrap-safe, fully-enforced, and drifted branch protection', () => {
    expect(classifyStatus({
      contexts: ['CODEOWNERS Security Governance Gate', 'CodeQL Alert Gate'],
      requireCodeOwnerReviews: false
    })).toBe('bootstrap-safe');

    expect(classifyStatus({
      contexts: [
        'CodeQL Alert Gate',
        'CODEOWNERS Security Governance Gate'
      ],
      requireCodeOwnerReviews: true
    })).toBe('fully-enforced');

    expect(classifyStatus({
      contexts: ['CodeQL Alert Gate'],
      requireCodeOwnerReviews: false
    })).toBe('custom-or-drifted');
  });

  it('identifies branches that would fail --fail-on-drift status audits', () => {
    expect(getDriftedBranches([
      {
        branch: 'main',
        contexts: ['CODEOWNERS Security Governance Gate', 'CodeQL Alert Gate'],
        requireCodeOwnerReviews: true
      },
      {
        branch: 'develop',
        contexts: ['CODEOWNERS Security Governance Gate', 'CodeQL Alert Gate'],
        requireCodeOwnerReviews: false
      }
    ])).toEqual(['develop']);

    expect(getDriftedBranches([
      {
        branch: 'main',
        contexts: ['CODEOWNERS Security Governance Gate', 'CodeQL Alert Gate'],
        requireCodeOwnerReviews: true
      }
    ])).toEqual([]);
  });

  it('does not treat deployed-production health as a pull-request requirement', () => {
    expect(classifyStatus({
      branch: 'develop',
      contexts: ['CODEOWNERS Security Governance Gate', 'CodeQL Alert Gate'],
      requireCodeOwnerReviews: true
    })).toBe('fully-enforced');

    expect(classifyStatus({
      branch: 'main',
      contexts: ['CODEOWNERS Security Governance Gate', 'CodeQL Alert Gate'],
      requireCodeOwnerReviews: true
    })).toBe('fully-enforced');

    expect(getDriftedBranches([
      {
        branch: 'main',
        contexts: ['CODEOWNERS Security Governance Gate', 'CodeQL Alert Gate'],
        requireCodeOwnerReviews: true
      }
    ])).toEqual([]);
  });

  it('keeps deployed Render smoke monitoring off pull requests', () => {
    const workflowPath = path.join(ROOT, '.github/workflows/render-smoke.yml');
    const workflowSource = fs.readFileSync(workflowPath, 'utf8');

    expect(workflowSource).not.toMatch(/^\s*pull_request:/m);
    expect(workflowSource).toContain('name: Post-Deploy Render Smoke');
    expect(workflowSource).toContain('SMOKE_ORIGINS:');
    expect(workflowSource).toContain('https://nocturnal-frontend-208z.onrender.com,https://nocturnal-api.onrender.com');
  });

  it('renders the drift-audit issue body from the negative workflow fixture', () => {
    const fixture = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'tests/fixtures/security/governance-drift-audit-issue.json'),
      'utf8'
    ));
    const body = buildDriftIssueBody(fixture);

    for (const fragment of fixture.expectedFragments) {
      expect(body).toContain(fragment);
    }
  });

  it('uses the shared drift issue renderer in the scheduled workflow', () => {
    const workflowPath = path.join(ROOT, '.github/workflows/security-governance-drift-audit.yml');
    const workflowSource = fs.readFileSync(workflowPath, 'utf8');
    const workflow = yaml.load(workflowSource);

    expect(workflow.name).toBe('Security Governance Drift Audit');
    expect(workflowSource).toContain('node scripts/render-security-governance-drift-issue.js');
    expect(workflowSource).toContain('gh issue create');
    expect(workflowSource).toContain('gh issue comment');
  });

  it('prefers GitHub App authentication for branch-protection governance workflows', () => {
    const workflowFiles = [
      '.github/workflows/security-governance-protection-bootstrap.yml',
      '.github/workflows/security-governance-protection-rollback.yml',
      '.github/workflows/security-governance-drift-audit.yml'
    ];

    for (const workflowFile of workflowFiles) {
      // Test fixtures are fixed repository-relative workflow paths.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const workflowSource = fs.readFileSync(path.join(ROOT, workflowFile), 'utf8');
      // Match any major version so Dependabot bumps (e.g. @v2 -> @v3) don't
      // fail this security contract — the requirement is that the pinned app
      // token action is used, not a specific major.
      expect(workflowSource).toMatch(/actions\/create-github-app-token@v\d+/);
      expect(workflowSource).toContain('secrets.BRANCH_PROTECTION_APP_ID');
      expect(workflowSource).toContain('secrets.BRANCH_PROTECTION_APP_PRIVATE_KEY');
      expect(workflowSource).toContain('steps.branch-protection-app-token.outputs.token');
      expect(workflowSource).not.toContain('BRANCH_PROTECTION_ADMIN_TOKEN');
      expect(workflowSource).not.toContain('continue-on-error: true');
    }
  });

  it('opens or updates a quarterly GitHub App private-key rotation reminder', () => {
    const workflowPath = path.join(ROOT, '.github/workflows/security-governance-key-rotation-reminder.yml');
    const workflowSource = fs.readFileSync(workflowPath, 'utf8');
    const workflow = yaml.load(workflowSource);

    expect(workflow.name).toBe('Security Governance Key Rotation Reminder');
    expect(workflowSource).toContain('30 5 1 1,4,7,10 *');
    expect(workflowSource).toContain('Rotate security governance GitHub App private key');
    expect(workflowSource).toContain('BRANCH_PROTECTION_APP_PRIVATE_KEY');
    expect(workflowSource).toContain('gh issue create');
    expect(workflowSource).toContain('gh issue comment');
  });

  it('rejects entries without owners', () => {
    const result = validateCodeownersSecurityCoverage({
      source: '.github/CODEOWNERS\n',
      requiredPaths: ['.github/CODEOWNERS']
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'Line 1: CODEOWNERS entries must include a path pattern and at least one owner.'
    );
  });

  it('rejects invalid owner syntax', () => {
    const result = validateCodeownersSecurityCoverage({
      source: '.github/CODEOWNERS invalid owner\n',
      requiredPaths: ['.github/CODEOWNERS']
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Line 1: invalid CODEOWNERS owner(s): invalid, owner');
  });

  it('rejects missing required security-governance coverage', () => {
    const result = validateCodeownersSecurityCoverage({
      source: '.github/CODEOWNERS @security-owner\n',
      requiredPaths: [
        '.github/CODEOWNERS',
        '.github/workflows/ci.yml'
      ]
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'Missing CODEOWNERS coverage for security-governance path: .github/workflows/ci.yml'
    );
  });

  it('accepts directory coverage for nested security-governance paths', () => {
    const result = validateCodeownersSecurityCoverage({
      source: 'tools/eslint-rules/ @security-owner\n',
      requiredPaths: ['tools/eslint-rules/no-raw-html-sinks.js']
    });

    expect(result).toEqual({
      ok: true,
      errors: []
    });
  });

  it('matches simple CODEOWNERS globs', () => {
    expect(patternCoversPath('.github/workflows/*.yml', '.github/workflows/ci.yml')).toBe(true);
    expect(patternCoversPath('.github/workflows/*.yml', '.github/workflows/nested/ci.yml')).toBe(false);
    expect(patternCoversPath('docs/**/*.md', 'docs/security/sensitive-get-route-policy.md')).toBe(true);
  });

  it('collects unique GitHub API owners and skips email owners', () => {
    const { entries } = parseCodeowners(`
      .github/CODEOWNERS @security-owner security@example.test
      tools/eslint-rules/ @security-owner @org/security-team
    `);

    expect(getUniqueApiOwners(entries)).toEqual([
      'security-owner',
      'org/security-team'
    ]);
  });

  it('validates user and team owners through the GitHub API abstraction', async () => {
    const { entries } = parseCodeowners(`
      .github/CODEOWNERS @security-owner
      tools/eslint-rules/ @org/security-team
    `);
    const request = jest.fn().mockResolvedValue(200);

    await expect(validateCodeownersOwnerExistence(entries, {
      token: 'test-token',
      request
    })).resolves.toEqual({
      ok: true,
      errors: []
    });
    expect(request).toHaveBeenCalledWith('/users/security-owner', 'test-token');
    expect(request).toHaveBeenCalledWith('/orgs/org/teams/security-team', 'test-token');
  });

  it('reports missing GitHub token when owner validation is requested', async () => {
    const { entries } = parseCodeowners('.github/CODEOWNERS @security-owner\n');

    await expect(validateCodeownersOwnerExistence(entries, {
      token: ''
    })).resolves.toEqual({
      ok: false,
      errors: ['Owner validation requested but GITHUB_TOKEN or GH_TOKEN is not set.']
    });
  });

  it('reports owner lookup failures', async () => {
    const { entries } = parseCodeowners('.github/CODEOWNERS @missing-owner\n');

    const result = await validateCodeownersOwnerExistence(entries, {
      token: 'test-token',
      request: jest.fn().mockResolvedValue(404)
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      'CODEOWNERS owner @missing-owner was not found through GitHub API (/users/missing-owner, status 404).'
    ]);
  });

  it('validates protected branch required checks against workflow job names', async () => {
    const request = jest.fn().mockResolvedValue({
      statusCode: 200,
      body: {
        contexts: ['CODEOWNERS Security Governance Gate', 'CodeQL Alert Gate']
      }
    });

    await expect(validateRequiredStatusChecksExist({
      branches: ['main'],
      repository: 'owner/repo',
      token: 'test-token',
      request,
      workflowCheckNames: new Set([
        'CODEOWNERS Security Governance Gate',
        'CodeQL Alert Gate'
      ])
    })).resolves.toEqual({
      ok: true,
      errors: []
    });
    expect(request).toHaveBeenCalledWith(
      '/repos/owner/repo/branches/main/protection/required_status_checks',
      'test-token'
    );
  });

  it('reports required checks that are not defined as workflow job names', async () => {
    const result = await validateRequiredStatusChecksExist({
      branches: ['develop'],
      repository: 'owner/repo',
      token: 'test-token',
      request: jest.fn().mockResolvedValue({
        statusCode: 200,
        body: {
          contexts: ['Missing Required Check']
        }
      }),
      workflowCheckNames: new Set(['CODEOWNERS Security Governance Gate'])
    });

    expect(result).toEqual({
      ok: false,
      errors: [
        'Required status check "Missing Required Check" on develop is not defined as a workflow job name.'
      ]
    });
  });

  it('reports unreadable branch protection while validating required checks', async () => {
    const result = await validateRequiredStatusChecksExist({
      branches: ['develop'],
      repository: 'owner/repo',
      token: 'test-token',
      request: jest.fn().mockResolvedValue({
        statusCode: 404,
        body: {}
      }),
      workflowCheckNames: new Set()
    });

    expect(result).toEqual({
      ok: false,
      errors: [
        'Could not read required status checks for develop (/repos/owner/repo/branches/develop/protection/required_status_checks, status 404).'
      ]
    });
  });

  it('requires repository and token for required status-check validation', async () => {
    await expect(validateRequiredStatusChecksExist({
      repository: '',
      token: 'test-token',
      workflowCheckNames: new Set()
    })).resolves.toEqual({
      ok: false,
      errors: ['Required status-check validation requested but GITHUB_REPOSITORY is not set.']
    });

    await expect(validateRequiredStatusChecksExist({
      repository: 'owner/repo',
      token: '',
      workflowCheckNames: new Set()
    })).resolves.toEqual({
      ok: false,
      errors: ['Required status-check validation requested but GITHUB_TOKEN or GH_TOKEN is not set.']
    });
  });
});
