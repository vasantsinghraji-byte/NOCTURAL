const {
  getUniqueApiOwners,
  parseCodeowners,
  patternCoversPath,
  validateCodeownersOwnerExistence,
  validateCodeownersSecurityCoverage,
  validateRequiredStatusChecksExist
} = require('../../../scripts/validate-codeowners-security-coverage');
const {
  classifyStatus
} = require('../../../scripts/manage-security-governance-protection');

describe('CODEOWNERS security-governance validator', () => {
  it('classifies bootstrap-safe, fully-enforced, and drifted branch protection', () => {
    expect(classifyStatus({
      contexts: ['Required Post-Deploy Render Smoke'],
      requireCodeOwnerReviews: false,
      dismissStaleReviews: false,
      requireLastPushApproval: false,
      requireConversationResolution: false
    })).toBe('bootstrap-safe');

    expect(classifyStatus({
      contexts: [
        'Required Post-Deploy Render Smoke',
        'CODEOWNERS Security Governance Gate',
        'Analyze (javascript-typescript)',
        'CodeQL Alert Gate'
      ],
      requireCodeOwnerReviews: true,
      dismissStaleReviews: true,
      requireLastPushApproval: true,
      requireConversationResolution: true
    })).toBe('fully-enforced');

    expect(classifyStatus({
      contexts: ['CodeQL Alert Gate'],
      requireCodeOwnerReviews: false,
      dismissStaleReviews: false,
      requireLastPushApproval: false,
      requireConversationResolution: false
    })).toBe('custom-or-drifted');

    expect(classifyStatus({
      contexts: [
        'Required Post-Deploy Render Smoke',
        'CODEOWNERS Security Governance Gate',
        'Analyze (javascript-typescript)',
        'CodeQL Alert Gate'
      ],
      requireCodeOwnerReviews: true,
      dismissStaleReviews: false,
      requireLastPushApproval: true,
      requireConversationResolution: true
    })).toBe('custom-or-drifted');
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
        contexts: ['CODEOWNERS Security Governance Gate', 'CodeQL Alert Gate'],
        checks: [{ context: 'Required Post-Deploy Render Smoke' }]
      }
    });

    await expect(validateRequiredStatusChecksExist({
      branches: ['main'],
      repository: 'owner/repo',
      token: 'test-token',
      request,
      workflowCheckNames: new Set([
        'CODEOWNERS Security Governance Gate',
        'CodeQL Alert Gate',
        'Required Post-Deploy Render Smoke'
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
