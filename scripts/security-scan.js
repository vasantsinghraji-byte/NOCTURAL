/**
 * OWASP ZAP Security Scanning Script
 * Automated security testing using OWASP ZAP API
 *
 * Prerequisites:
 * 1. Install OWASP ZAP: https://www.zaproxy.org/download/
 * 2. Start ZAP in daemon mode: zap.sh -daemon -port 8080 -config api.disablekey=true
 * 3. Install node-zaproxy: npm install zaproxy
 *
 * Usage:
 *   node scripts/security-scan.js --target http://localhost:5000
 *   node scripts/security-scan.js --target http://localhost:5000 --mode full
 */

const fs = require('fs');
const path = require('path');

// Colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m'
};

const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  step: (msg) => console.log(`${colors.blue}→${colors.reset} ${msg}`)
};

/**
 * Run security scan
 */
async function runSecurityScan(options) {
  console.log('\n' + '='.repeat(70));
  console.log('  NOCTURNAL PLATFORM - OWASP ZAP SECURITY SCAN');
  console.log('='.repeat(70) + '\n');

  const { target, mode = 'quick', zapUrl = 'http://localhost:8080', apiKey = '' } = options;

  try {
    // Lazy load zaproxy
    const ZapClient = require('zaproxy');
    const zaproxy = new ZapClient({
      apiKey,
      proxy: zapUrl
    });

    log.info(`Target: ${target}`);
    log.info(`Scan mode: ${mode}`);
    log.info(`ZAP URL: ${zapUrl}\n`);

    // Test ZAP connection
    log.step('Testing ZAP connection...');
    try {
      await zaproxy.core.version();
      log.success('Connected to ZAP\n');
    } catch (error) {
      log.error('Cannot connect to ZAP');
      log.info('Make sure ZAP is running: zap.sh -daemon -port 8080 -config api.disablekey=true');
      process.exit(1);
    }

    // Spider the application
    log.step('Spidering application...');
    const spiderResult = await zaproxy.spider.scan(target);
    const spiderId = spiderResult.scan;
    log.success(`Spider started (ID: ${spiderId})\n`);

    // Wait for spider to complete
    await waitForSpider(zaproxy, spiderId);

    // Get spidered URLs
    const urls = await zaproxy.spider.results(spiderId);
    log.success(`Found ${urls.results.length} URLs\n`);

    // Active scan
    if (mode === 'full') {
      log.step('Running active scan...');
      const scanResult = await zaproxy.ascan.scan(target);
      const scanId = scanResult.scan;
      log.success(`Active scan started (ID: ${scanId})\n`);

      // Wait for scan to complete
      await waitForActiveScan(zaproxy, scanId);
    } else {
      log.step('Skipping active scan (quick mode)\n');
    }

    // Get alerts
    log.step('Retrieving alerts...');
    const alerts = await zaproxy.core.alerts(target);
    log.success(`Found ${alerts.alerts.length} alerts\n`);

    // Generate report
    log.step('Generating report...');
    const report = generateReport(alerts.alerts, target);

    // Save report
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportDir = path.join(__dirname, '..', 'security-reports');

    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportPath = path.join(reportDir, `security-scan-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    log.success(`Report saved: ${reportPath}\n`);

    // Generate HTML report
    const htmlReportPath = path.join(reportDir, `security-scan-${timestamp}.html`);
    const htmlReport = await zaproxy.core.htmlreport();
    fs.writeFileSync(htmlReportPath, htmlReport.replace(/<html/i, '<html'));
    log.success(`HTML report saved: ${htmlReportPath}\n`);

    // Print summary
    printSummary(report);

    // Exit with error code if critical/high alerts found
    const criticalCount = report.summary.critical + report.summary.high;
    if (criticalCount > 0) {
      log.error(`\nScan completed with ${criticalCount} critical/high severity alerts`);
      process.exit(1);
    } else {
      log.success('\nScan completed successfully - no critical/high severity alerts found');
      process.exit(0);
    }

  } catch (error) {
    log.error(`Security scan failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

/**
 * Wait for spider to complete
 */
async function waitForSpider(zaproxy, spiderId) {
  let progress = 0;

  while (progress < 100) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const status = await zaproxy.spider.status(spiderId);
    progress = parseInt(status.status);
    process.stdout.write(`\rSpider progress: ${progress}%`);
  }

  console.log('\n');
  log.success('Spider completed\n');
}

/**
 * Wait for active scan to complete
 */
async function waitForActiveScan(zaproxy, scanId) {
  let progress = 0;

  while (progress < 100) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const status = await zaproxy.ascan.status(scanId);
    progress = parseInt(status.status);
    process.stdout.write(`\rActive scan progress: ${progress}%`);
  }

  console.log('\n');
  log.success('Active scan completed\n');
}

/**
 * Generate report
 */
function generateReport(alerts, target) {
  const summary = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    informational: 0
  };

  const categorized = {
    critical: [],
    high: [],
    medium: [],
    low: [],
    informational: []
  };

  alerts.forEach(alert => {
    const risk = alert.risk.toLowerCase();

    if (summary.hasOwnProperty(risk)) {
      summary[risk]++;
      categorized[risk].push({
        name: alert.alert,
        description: alert.description,
        solution: alert.solution,
        reference: alert.reference,
        url: alert.url,
        evidence: alert.evidence
      });
    }
  });

  return {
    target,
    timestamp: new Date().toISOString(),
    summary,
    totalAlerts: alerts.length,
    alerts: categorized
  };
}

/**
 * Print summary
 */
function printSummary(report) {
  console.log('='.repeat(70));
  console.log('  SCAN SUMMARY');
  console.log('='.repeat(70) + '\n');

  log.info(`Total Alerts: ${report.totalAlerts}`);
  log.error(`Critical: ${report.summary.critical}`);
  log.error(`High: ${report.summary.high}`);
  log.warn(`Medium: ${report.summary.medium}`);
  log.info(`Low: ${report.summary.low}`);
  log.info(`Informational: ${report.summary.informational}\n`);

  // Print critical and high alerts
  if (report.summary.critical > 0) {
    console.log(`${colors.red}CRITICAL ALERTS:${colors.reset}`);
    report.alerts.critical.forEach((alert, i) => {
      console.log(`\n${i + 1}. ${alert.name}`);
      console.log(`   URL: ${alert.url}`);
      console.log(`   Description: ${alert.description.substring(0, 100)}...`);
    });
    console.log('');
  }

  if (report.summary.high > 0) {
    console.log(`${colors.red}HIGH SEVERITY ALERTS:${colors.reset}`);
    report.alerts.high.forEach((alert, i) => {
      console.log(`\n${i + 1}. ${alert.name}`);
      console.log(`   URL: ${alert.url}`);
      console.log(`   Description: ${alert.description.substring(0, 100)}...`);
    });
    console.log('');
  }

  console.log('='.repeat(70));
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i += 2) {
  const key = args[i].replace('--', '');
  const value = args[i + 1];
  options[key] = value;
}

// Validate required options
if (!options.target) {
  console.log('\nUsage: node scripts/security-scan.js --target <url> [options]\n');
  console.log('Options:');
  console.log('  --target <url>     Target URL to scan (required)');
  console.log('  --mode <mode>      Scan mode: quick or full (default: quick)');
  console.log('  --zapUrl <url>     ZAP API URL (default: http://localhost:8080)');
  console.log('  --apiKey <key>     ZAP API key (optional)\n');
  console.log('Examples:');
  console.log('  node scripts/security-scan.js --target http://localhost:5000');
  console.log('  node scripts/security-scan.js --target http://localhost:5000 --mode full\n');
  process.exit(1);
}

// Run scan
runSecurityScan(options).catch(error => {
  log.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
