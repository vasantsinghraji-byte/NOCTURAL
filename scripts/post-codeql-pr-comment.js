const { execFileSync } = require('child_process');

const COMMENT_MARKER = '<!-- nocturnal-codeql-alert-summary -->';

function requiredEnv(name) {
  if (!process.env[name]) {
    throw new Error(`${name} is required.`);
  }
  return process.env[name];
}

function ghApiJson(args) {
  return JSON.parse(execFileSync('gh', ['api', ...args], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  }));
}

function ghApi(args) {
  return execFileSync('gh', ['api', ...args], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
}

function countOpenCodeqlAlerts(repository, ref) {
  let count = 0;

  for (let page = 1; page <= 1000; page += 1) {
    const endpoint = `repos/${repository}/code-scanning/alerts?state=open&tool_name=CodeQL&ref=${encodeURIComponent(ref)}&per_page=100&page=${page}`;
    const alerts = ghApiJson([endpoint]);
    if (!Array.isArray(alerts) || alerts.length === 0) {
      break;
    }

    count += alerts.length;
    if (alerts.length < 100) {
      break;
    }
  }

  return count;
}

function getExistingComment(repository, issueNumber) {
  const comments = ghApiJson([
    `repos/${repository}/issues/${issueNumber}/comments?per_page=100`
  ]);

  return comments.find(comment => comment.body && comment.body.includes(COMMENT_MARKER));
}

function upsertPrComment(repository, issueNumber, body) {
  const existingComment = getExistingComment(repository, issueNumber);

  if (existingComment) {
    ghApi([
      '--method',
      'PATCH',
      `repos/${repository}/issues/comments/${existingComment.id}`,
      '-f',
      `body=${body}`
    ]);
  } else {
    ghApi([
      '--method',
      'POST',
      `repos/${repository}/issues/${issueNumber}/comments`,
      '-f',
      `body=${body}`
    ]);
  }
}

function main() {
  const repository = requiredEnv('GITHUB_REPOSITORY');
  const prNumber = requiredEnv('PR_NUMBER');
  const baseRef = requiredEnv('BASE_REF');
  const prRef = requiredEnv('PR_REF');
  const runUrl = requiredEnv('RUN_URL');

  const beforeCount = countOpenCodeqlAlerts(repository, `refs/heads/${baseRef}`);
  const afterCount = countOpenCodeqlAlerts(repository, prRef);
  const delta = afterCount - beforeCount;
  const deltaText = delta > 0 ? `+${delta}` : String(delta);
  const body = [
    COMMENT_MARKER,
    '## CodeQL Alert Summary',
    '',
    `- Base branch open CodeQL alerts (${baseRef}): ${beforeCount}`,
    `- PR ref open CodeQL alerts (${prRef}): ${afterCount}`,
    `- Delta: ${deltaText}`,
    `- Workflow run: ${runUrl}`,
    '',
    'The detailed grouped CSV is uploaded as the `codeql-open-alert-summary` workflow artifact.'
  ].join('\n');

  upsertPrComment(repository, prNumber, body);
  console.log(`Posted CodeQL PR alert summary for #${prNumber}: ${beforeCount} -> ${afterCount}.`);
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
  countOpenCodeqlAlerts
};
