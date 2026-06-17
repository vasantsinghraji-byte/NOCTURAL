/* eslint-disable no-console */
const { countOpenCodeqlAlerts } = require('./post-codeql-pr-comment');

function requiredEnv(name) {
  if (!process.env[name]) {
    throw new Error(`${name} is required.`);
  }
  return process.env[name];
}

function main() {
  const repository = requiredEnv('GITHUB_REPOSITORY');
  const baseRef = requiredEnv('BASE_REF');
  const prRef = requiredEnv('PR_REF');
  const allowedIncrease = Number(process.env.CODEQL_ALLOWED_ALERT_INCREASE || 0);
  const beforeCount = countOpenCodeqlAlerts(repository, `refs/heads/${baseRef}`);
  const afterCount = countOpenCodeqlAlerts(repository, prRef);
  const delta = afterCount - beforeCount;

  console.log(`Base CodeQL alerts (${baseRef}): ${beforeCount}`);
  console.log(`PR CodeQL alerts (${prRef}): ${afterCount}`);
  console.log(`Delta: ${delta}`);
  console.log(`Allowed increase: ${allowedIncrease}`);

  if (delta > allowedIncrease) {
    throw new Error(`CodeQL alert count increased by ${delta}; allowed increase is ${allowedIncrease}.`);
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
