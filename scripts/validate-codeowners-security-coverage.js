const fs = require('fs');
const https = require('https');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CODEOWNERS_PATH = path.join(ROOT, '.github', 'CODEOWNERS');

const REQUIRED_SECURITY_GOVERNANCE_PATHS = [
  '.github/CODEOWNERS',
  '.github/pull_request_template.md',
  '.github/workflows/ci.yml',
  '.github/workflows/codeql.yml',
  '.github/workflows/render-smoke.yml',
  '.github/workflows/security-governance-drift-audit.yml',
  '.github/workflows/security-governance-protection-bootstrap.yml',
  '.github/workflows/security-governance-protection-rollback.yml',
  'docs/security/branch-protection-governance.md',
  'scripts/check-codeql-alert-threshold.js',
  'scripts/export-codeql-alerts.js',
  'scripts/manage-security-governance-protection.js',
  'scripts/post-codeql-pr-comment.js',
  'scripts/validate-codeowners-security-coverage.js',
  'tests/unit/security/codeowners-security-coverage.test.js'
];

function normalizePath(value) {
  return value.replace(/\\/g, '/').replace(/^\//, '');
}

function isValidOwner(owner) {
  return /^@[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?$/.test(owner)
    || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner);
}

function escapeRegExp(value) {
  return value.replace(/[\\^$.+?()[\]{}|]/g, '\\$&');
}

function globToRegExp(pattern) {
  const normalizedPattern = normalizePath(pattern);
  let source = '';

  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const character = normalizedPattern[index];
    const nextCharacter = normalizedPattern[index + 1];

    if (character === '*' && nextCharacter === '*') {
      source += '.*';
      index += 1;
    } else if (character === '*') {
      source += '[^/]*';
    } else {
      source += escapeRegExp(character);
    }
  }

  return new RegExp(`^${source}$`);
}

function patternCoversPath(pattern, candidatePath) {
  const normalizedPattern = normalizePath(pattern);
  const normalizedCandidate = normalizePath(candidatePath);

  if (normalizedPattern.endsWith('/')) {
    return normalizedCandidate === normalizedPattern.slice(0, -1)
      || normalizedCandidate.startsWith(normalizedPattern);
  }

  if (normalizedPattern.includes('*')) {
    return globToRegExp(normalizedPattern).test(normalizedCandidate);
  }

  return normalizedPattern === normalizedCandidate;
}

function parseCodeowners(source) {
  const entries = [];
  const errors = [];

  source.split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const tokens = trimmed.split(/\s+/);
    const [pattern, ...owners] = tokens;

    if (!pattern || owners.length === 0) {
      errors.push(`Line ${lineNumber}: CODEOWNERS entries must include a path pattern and at least one owner.`);
      return;
    }

    const invalidOwners = owners.filter(owner => !isValidOwner(owner));
    if (invalidOwners.length > 0) {
      errors.push(`Line ${lineNumber}: invalid CODEOWNERS owner(s): ${invalidOwners.join(', ')}`);
    }

    entries.push({ lineNumber, pattern, owners });
  });

  return { entries, errors };
}

function validateCodeownersSecurityCoverage(options = {}) {
  const {
    codeownersPath = CODEOWNERS_PATH,
    requiredPaths = REQUIRED_SECURITY_GOVERNANCE_PATHS,
    source
  } = options;

  // The validator only reads the repository CODEOWNERS file or explicit test fixtures.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!source && !fs.existsSync(codeownersPath)) {
    return {
      ok: false,
      errors: ['Missing .github/CODEOWNERS.']
    };
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const codeownersSource = source || fs.readFileSync(codeownersPath, 'utf8');
  const { entries, errors } = parseCodeowners(codeownersSource);
  const missingCoverage = requiredPaths.filter(requiredPath => (
    !entries.some(entry => patternCoversPath(entry.pattern, requiredPath))
  ));

  for (const requiredPath of missingCoverage) {
    errors.push(`Missing CODEOWNERS coverage for security-governance path: ${requiredPath}`);
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function getUniqueApiOwners(entries) {
  return [...new Set(entries.flatMap(entry => entry.owners))]
    .filter(owner => owner.startsWith('@'))
    .map(owner => owner.slice(1));
}

function githubApiRequest(apiPath, token) {
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: 'api.github.com',
      path: apiPath,
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'nocturnal-codeowners-security-validator',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }, (response) => {
      response.resume();
      response.on('end', () => {
        resolve(response.statusCode);
      });
    });

    request.on('error', reject);
    request.end();
  });
}

function githubApiJsonRequest(apiPath, token) {
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: 'api.github.com',
      path: apiPath,
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'nocturnal-codeowners-security-validator',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }, (response) => {
      let body = '';

      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
      });
      response.on('end', () => {
        try {
          resolve({
            statusCode: response.statusCode,
            body: body ? JSON.parse(body) : {}
          });
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on('error', reject);
    request.end();
  });
}

async function validateCodeownersOwnerExistence(entries, options = {}) {
  const {
    token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
    request = githubApiRequest
  } = options;
  const errors = [];

  if (!token) {
    return {
      ok: false,
      errors: ['Owner validation requested but GITHUB_TOKEN or GH_TOKEN is not set.']
    };
  }

  for (const owner of getUniqueApiOwners(entries)) {
    const [orgOrUser, teamSlug] = owner.split('/');
    const apiPath = teamSlug
      ? `/orgs/${encodeURIComponent(orgOrUser)}/teams/${encodeURIComponent(teamSlug)}`
      : `/users/${encodeURIComponent(orgOrUser)}`;
    const statusCode = await request(apiPath, token);

    if (statusCode !== 200) {
      errors.push(`CODEOWNERS owner @${owner} was not found through GitHub API (${apiPath}, status ${statusCode}).`);
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function loadYamlParser() {
  try {
    return require('js-yaml');
  } catch {
    throw new Error('js-yaml is required to validate workflow status-check names. Run npm ci first.');
  }
}

function collectWorkflowStatusCheckNames(options = {}) {
  const {
    workflowDir = path.join(ROOT, '.github', 'workflows'),
    yaml = loadYamlParser()
  } = options;
  const checkNames = new Set();

  // Workflow discovery is limited to the repository workflow directory or explicit tests.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!fs.existsSync(workflowDir)) {
    return checkNames;
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  for (const entry of fs.readdirSync(workflowDir, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) {
      continue;
    }

    const workflowPath = path.join(workflowDir, entry.name);
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const source = fs.readFileSync(workflowPath, 'utf8');
    const workflow = yaml.load(source) || {};

    for (const [jobId, job] of Object.entries(workflow.jobs || {})) {
      checkNames.add(job && job.name ? String(job.name) : jobId);
    }
  }

  return checkNames;
}

function parseCommaSeparatedOption(name, fallback) {
  const prefix = `--${name}=`;
  const option = process.argv.find(argument => argument.startsWith(prefix));

  if (!option) {
    return fallback;
  }

  return option
    .slice(prefix.length)
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

async function validateRequiredStatusChecksExist(options = {}) {
  const {
    branches = ['main'],
    repository = process.env.GITHUB_REPOSITORY,
    token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
    request = githubApiJsonRequest,
    workflowCheckNames = collectWorkflowStatusCheckNames()
  } = options;
  const errors = [];

  if (!repository) {
    return {
      ok: false,
      errors: ['Required status-check validation requested but GITHUB_REPOSITORY is not set.']
    };
  }

  if (!token) {
    return {
      ok: false,
      errors: ['Required status-check validation requested but GITHUB_TOKEN or GH_TOKEN is not set.']
    };
  }

  for (const branch of branches) {
    const apiPath = `/repos/${repository}/branches/${encodeURIComponent(branch)}/protection/required_status_checks`;
    const response = await request(apiPath, token);

    if (response.statusCode !== 200) {
      errors.push(`Could not read required status checks for ${branch} (${apiPath}, status ${response.statusCode}).`);
      continue;
    }

    const contexts = [
      ...(response.body.contexts || []),
      ...((response.body.checks || []).map(check => check.context).filter(Boolean))
    ];
    const uniqueContexts = [...new Set(contexts)];

    for (const context of uniqueContexts) {
      if (!workflowCheckNames.has(context)) {
        errors.push(`Required status check "${context}" on ${branch} is not defined as a workflow job name.`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

async function runCli() {
  const shouldValidateOwners = process.argv.includes('--validate-owners');
  const shouldValidateRequiredChecks = process.argv.includes('--validate-required-checks');
  const branches = parseCommaSeparatedOption('branches', ['main']);
  const source = fs.existsSync(CODEOWNERS_PATH) ? fs.readFileSync(CODEOWNERS_PATH, 'utf8') : '';
  const result = validateCodeownersSecurityCoverage({ source });

  if (shouldValidateOwners && result.ok) {
    const { entries } = parseCodeowners(source);
    const ownerResult = await validateCodeownersOwnerExistence(entries);
    result.errors.push(...ownerResult.errors);
    result.ok = result.errors.length === 0;
  }

  if (shouldValidateRequiredChecks && result.ok) {
    const requiredChecksResult = await validateRequiredStatusChecksExist({ branches });
    result.errors.push(...requiredChecksResult.errors);
    result.ok = result.errors.length === 0;
  }

  if (!result.ok) {
    console.error('CODEOWNERS security-governance validation failed:');
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
  } else {
    console.log('CODEOWNERS security-governance validation passed.');
  }
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error('CODEOWNERS security-governance validation failed:');
    console.error(`- ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  REQUIRED_SECURITY_GOVERNANCE_PATHS,
  collectWorkflowStatusCheckNames,
  getUniqueApiOwners,
  githubApiJsonRequest,
  parseCodeowners,
  patternCoversPath,
  validateRequiredStatusChecksExist,
  validateCodeownersOwnerExistence,
  validateCodeownersSecurityCoverage
};
