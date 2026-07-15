#!/usr/bin/env node

const DEFAULT_BASE_URL = 'https://nocturnal-api.onrender.com';

const baseUrl = (process.env.DEPLOYED_BASE_URL ||
  process.env.RENDER_SMOKE_BASE_URL ||
  DEFAULT_BASE_URL).replace(/\/+$/, '');
const expectedCommit = (process.env.EXPECTED_DEPLOYMENT_COMMIT || process.argv[2] || '').trim();

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

async function fetchHealth() {
  const response = await fetch(`${baseUrl}/api/v1/health`, {
    redirect: 'manual',
    cache: 'no-store',
    headers: {
      Accept: 'application/json'
    }
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`/api/v1/health: expected 2xx, received ${response.status}: ${body.slice(0, 500)}`);
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`/api/v1/health: expected JSON response: ${error.message}: ${body.slice(0, 500)}`, {
      cause: error
    });
  }
}

function assertDeploymentCommit(health) {
  const actualCommit = String(health.deploymentCommit || '').trim();

  if (!actualCommit) {
    throw new Error('/api/v1/health: missing deploymentCommit');
  }

  if (expectedCommit.length < 7) {
    throw new Error('EXPECTED_DEPLOYMENT_COMMIT must be at least 7 characters when set');
  }

  if (!actualCommit.startsWith(expectedCommit)) {
    throw new Error(`/api/v1/health: expected deploymentCommit ${expectedCommit}, received ${actualCommit}`);
  }
}

async function main() {
  if (!expectedCommit) {
    console.log('EXPECTED_DEPLOYMENT_COMMIT not set; skipping deployed commit identity check');
    return;
  }

  const attempts = Number(process.env.DEPLOYED_SMOKE_RETRIES || process.argv[3] || 12);
  const delayMs = Number(process.env.DEPLOYED_SMOKE_RETRY_DELAY_MS || process.argv[4] || 15000);
  let lastError;

  console.log(`Running deployed health commit smoke against ${baseUrl}; expecting ${expectedCommit}`);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const health = await fetchHealth();
      assertDeploymentCommit(health);
      console.log(`Deployed health commit smoke passed: ${health.deploymentCommit}`);
      return;
    } catch (error) {
      lastError = error;

      if (attempt === attempts) {
        break;
      }

      console.warn(`health commit: attempt ${attempt}/${attempts} failed: ${error.message}`);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
