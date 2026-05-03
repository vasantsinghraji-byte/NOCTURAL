#!/usr/bin/env node

const DEFAULT_BASE_URL = 'https://nocturnal-api.onrender.com';

const baseUrl = (process.env.DEPLOYED_BASE_URL ||
  process.env.RENDER_SMOKE_BASE_URL ||
  DEFAULT_BASE_URL).replace(/\/+$/, '');

function headerIncludes(response, headerName, expectedValue) {
  const actual = response.headers.get(headerName);
  return actual && actual.toLowerCase().split(',').map((value) => value.trim()).includes(expectedValue);
}

async function main() {
  const url = `${baseUrl}/service-worker.js`;
  console.log(`Running deployed service-worker smoke against ${url}`);

  const response = await fetch(url, {
    redirect: 'manual',
    cache: 'no-store'
  });
  const body = await response.text();

  if (response.status !== 200) {
    throw new Error(`service-worker.js: expected 200, received ${response.status}: ${body.slice(0, 300)}`);
  }

  if (!headerIncludes(response, 'cache-control', 'no-cache') ||
      !headerIncludes(response, 'cache-control', 'no-store') ||
      !headerIncludes(response, 'cache-control', 'must-revalidate')) {
    throw new Error(`service-worker.js: expected Cache-Control no-cache, no-store, must-revalidate; received ${response.headers.get('cache-control') || '<missing>'}`);
  }

  if (response.headers.get('pragma') !== 'no-cache') {
    throw new Error(`service-worker.js: expected Pragma no-cache; received ${response.headers.get('pragma') || '<missing>'}`);
  }

  if (response.headers.get('expires') !== '0') {
    throw new Error(`service-worker.js: expected Expires 0; received ${response.headers.get('expires') || '<missing>'}`);
  }

  if (!body.includes('nocturnal-v4')) {
    throw new Error('service-worker.js: expected deployed cache version nocturnal-v4');
  }

  if (!body.includes('NOCTURNAL_REFRESH_HTML_CACHE')) {
    throw new Error('service-worker.js: expected HTML cache self-heal message handler');
  }

  console.log('Deployed service-worker smoke passed');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
