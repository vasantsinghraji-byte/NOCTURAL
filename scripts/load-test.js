/**
 * Simple Load Testing Script
 *
 * Usage:
 *   node scripts/load-test.js [url] [requests] [concurrency]
 *
 * Examples:
 *   node scripts/load-test.js                              # Test localhost with defaults
 *   node scripts/load-test.js https://example.com 100 10   # Test specific URL
 *
 * For more comprehensive load testing, consider using:
 *   - Apache Bench: ab -n 1000 -c 10 https://your-url.com/
 *   - Artillery: npx artillery quick --count 100 -n 20 https://your-url.com/
 *   - k6: k6 run script.js
 */

const http = require('http');
const https = require('https');

// Configuration
const DEFAULT_URL = 'http://localhost:5000';
const args = process.argv.slice(2);
const BASE_URL = args[0] || DEFAULT_URL;
const TOTAL_REQUESTS = parseInt(args[1]) || 100;
const CONCURRENCY = parseInt(args[2]) || 10;

// Endpoints to test
const ENDPOINTS = [
  '/api/v1/health',
  '/login.html',
  '/index.html',
  '/api/v1/duties'
];

// Results tracking
const results = {
  total: 0,
  success: 0,
  failed: 0,
  errors: {},
  responseTimes: [],
  startTime: null,
  endTime: null
};

function makeRequest(url) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const client = url.startsWith('https') ? https : http;

    const req = client.get(url, { timeout: 30000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const duration = Date.now() - startTime;
        resolve({
          success: res.statusCode < 400,
          statusCode: res.statusCode,
          duration,
          size: data.length
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        success: false,
        error: err.message,
        duration: Date.now() - startTime
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        error: 'Request timeout',
        duration: Date.now() - startTime
      });
    });
  });
}

async function runBatch(endpoint, count) {
  const url = `${BASE_URL}${endpoint}`;
  const promises = [];

  for (let i = 0; i < count; i++) {
    promises.push(makeRequest(url));
  }

  return Promise.all(promises);
}

async function runLoadTest() {
  console.log('\n🚀 Load Test Starting...\n');
  console.log(`   Target: ${BASE_URL}`);
  console.log(`   Total Requests: ${TOTAL_REQUESTS}`);
  console.log(`   Concurrency: ${CONCURRENCY}`);
  console.log(`   Endpoints: ${ENDPOINTS.length}`);
  console.log('\n' + '─'.repeat(60) + '\n');

  results.startTime = Date.now();

  const requestsPerEndpoint = Math.ceil(TOTAL_REQUESTS / ENDPOINTS.length);

  for (const endpoint of ENDPOINTS) {
    console.log(`📍 Testing: ${endpoint}`);

    const endpointResults = {
      success: 0,
      failed: 0,
      times: []
    };

    // Run in batches of CONCURRENCY
    let remaining = requestsPerEndpoint;
    while (remaining > 0) {
      const batchSize = Math.min(remaining, CONCURRENCY);
      const batchResults = await runBatch(endpoint, batchSize);

      for (const result of batchResults) {
        results.total++;

        if (result.success) {
          results.success++;
          endpointResults.success++;
        } else {
          results.failed++;
          endpointResults.failed++;
          const errorKey = result.error || `Status ${result.statusCode}`;
          results.errors[errorKey] = (results.errors[errorKey] || 0) + 1;
        }

        if (result.duration) {
          results.responseTimes.push(result.duration);
          endpointResults.times.push(result.duration);
        }
      }

      remaining -= batchSize;
    }

    // Endpoint stats
    const avgTime = endpointResults.times.length > 0
      ? Math.round(endpointResults.times.reduce((a, b) => a + b, 0) / endpointResults.times.length)
      : 0;
    const maxTime = endpointResults.times.length > 0
      ? Math.max(...endpointResults.times)
      : 0;
    const minTime = endpointResults.times.length > 0
      ? Math.min(...endpointResults.times)
      : 0;

    console.log(`   ✅ Success: ${endpointResults.success} | ❌ Failed: ${endpointResults.failed}`);
    console.log(`   ⏱️  Avg: ${avgTime}ms | Min: ${minTime}ms | Max: ${maxTime}ms\n`);
  }

  results.endTime = Date.now();
  printSummary();
}

function printSummary() {
  const totalTime = results.endTime - results.startTime;
  const rps = Math.round((results.total / totalTime) * 1000);

  // Calculate percentiles
  const sorted = results.responseTimes.sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
  const p90 = sorted[Math.floor(sorted.length * 0.9)] || 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
  const avg = sorted.length > 0
    ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length)
    : 0;

  console.log('─'.repeat(60));
  console.log('\n📊 LOAD TEST SUMMARY\n');
  console.log('─'.repeat(60));

  console.log(`\n📈 Throughput:`);
  console.log(`   Total Requests:    ${results.total}`);
  console.log(`   Successful:        ${results.success} (${Math.round(results.success/results.total*100)}%)`);
  console.log(`   Failed:            ${results.failed} (${Math.round(results.failed/results.total*100)}%)`);
  console.log(`   Requests/Second:   ${rps}`);
  console.log(`   Total Time:        ${totalTime}ms`);

  console.log(`\n⏱️  Response Times:`);
  console.log(`   Average:           ${avg}ms`);
  console.log(`   P50 (Median):      ${p50}ms`);
  console.log(`   P90:               ${p90}ms`);
  console.log(`   P99:               ${p99}ms`);
  console.log(`   Min:               ${sorted[0] || 0}ms`);
  console.log(`   Max:               ${sorted[sorted.length - 1] || 0}ms`);

  if (Object.keys(results.errors).length > 0) {
    console.log(`\n❌ Errors:`);
    for (const [error, count] of Object.entries(results.errors)) {
      console.log(`   ${error}: ${count}`);
    }
  }

  // Performance assessment
  console.log('\n📋 Assessment:');
  if (results.failed === 0 && avg < 200) {
    console.log('   ✅ EXCELLENT - All requests successful with fast response times');
  } else if (results.failed / results.total < 0.01 && avg < 500) {
    console.log('   ✅ GOOD - High success rate with acceptable response times');
  } else if (results.failed / results.total < 0.05 && avg < 1000) {
    console.log('   ⚠️  ACCEPTABLE - Some failures or slow responses detected');
  } else {
    console.log('   ❌ NEEDS IMPROVEMENT - High failure rate or slow response times');
  }

  console.log('\n' + '─'.repeat(60) + '\n');
}

// Run the test
runLoadTest().catch(console.error);
