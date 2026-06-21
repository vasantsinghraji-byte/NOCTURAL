/* eslint-disable security/detect-non-literal-fs-filename */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'reports', 'security');
const DEFAULT_TRACKER_PATH = path.join(ROOT, 'docs', 'security', 'codeql-alert-tracker.csv');
const DEFAULT_GROUPED_EXPORT_PATH = path.join(DEFAULT_OUTPUT_DIR, 'codeql-open-alerts.csv');
const DEFAULT_SUMMARY_EXPORT_PATH = path.join(DEFAULT_OUTPUT_DIR, 'codeql-open-alert-summary.csv');
const DEFAULT_TREND_PATH = path.join(DEFAULT_OUTPUT_DIR, 'codeql-alert-trend.json');
const DEFAULT_SNAPSHOT_DIR = path.join(DEFAULT_OUTPUT_DIR, 'codeql-tracker-snapshots');
const DASHBOARD_SOURCE_PATH = path.join(ROOT, 'docs', 'security', 'codeql-alert-dashboard.html');

function getArgValue(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find(argument => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function getRemoteRepository() {
  const output = execFileSync('git', ['remote', 'get-url', 'origin'], {
    cwd: ROOT,
    encoding: 'utf8'
  }).trim();
  const match = output.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
  return match ? match[1] : '';
}

function getRepository() {
  return getArgValue('repo', process.env.GITHUB_REPOSITORY || getRemoteRepository());
}

function getOptionalRef() {
  return getArgValue('ref', process.env.CODEQL_ALERT_REF || '');
}

function getSnapshotName(ref) {
  const fallback = 'default';
  return (ref || fallback)
    .replace(/^refs\/heads\//, '')
    .replace(/^refs\/pull\/(\d+)\/merge$/, 'pr-$1')
    .replace(/[^A-Za-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function getAlertSource(row) {
  return /^CVE-\d{4}-\d+$/i.test(row.ruleId)
    ? 'dependency-cve'
    : 'codeql-query';
}

function readGhJson(endpoint) {
  return JSON.parse(execFileSync('gh', ['api', endpoint], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  }));
}

function listOpenAlerts(repository, ref = '') {
  const alerts = [];
  const refQuery = ref ? `&ref=${encodeURIComponent(ref)}` : '';

  for (let page = 1; page <= 1000; page += 1) {
    const endpoint = `repos/${repository}/code-scanning/alerts?state=open&per_page=100&page=${page}${refQuery}`;
    const batch = readGhJson(endpoint);
    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }

    alerts.push(...batch);
    if (batch.length < 100) {
      break;
    }
  }

  return alerts;
}

function csvEscape(value) {
  const normalized = value === undefined || value === null ? '' : String(value);
  if (/[",\r\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function toCsv(rows, columns) {
  return [
    columns.join(','),
    ...rows.map(row => columns.map(column => csvEscape(row[column])).join(','))
  ].join('\n') + '\n';
}

function parseCsv(source) {
  const lines = source.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return [];
  }

  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
  });
}

function splitCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && inQuotes && nextCharacter === '"') {
      current += '"';
      index += 1;
    } else if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += character;
    }
  }

  values.push(current);
  return values;
}

function getAlertLocation(alert) {
  const location = alert.most_recent_instance && alert.most_recent_instance.location;
  return {
    path: location && location.path ? location.path : '',
    startLine: location && location.start_line ? location.start_line : ''
  };
}

function normalizeAlert(alert) {
  const location = getAlertLocation(alert);
  const normalized = {
    alertNumber: alert.number,
    ruleId: alert.rule && alert.rule.id ? alert.rule.id : '',
    ruleName: alert.rule && alert.rule.name ? alert.rule.name : '',
    severity: alert.rule && alert.rule.severity ? alert.rule.severity : '',
    securitySeverity: alert.rule && alert.rule.security_severity_level ? alert.rule.security_severity_level : '',
    path: location.path,
    startLine: location.startLine,
    state: alert.state || '',
    tool: alert.tool && alert.tool.name ? alert.tool.name : '',
    createdAt: alert.created_at || '',
    updatedAt: alert.updated_at || '',
    htmlUrl: alert.html_url || '',
    source: '',
    groupKey: [
      alert.rule && alert.rule.id ? alert.rule.id : '',
      location.path,
      alert.rule && alert.rule.severity ? alert.rule.severity : ''
    ].join('|')
  };

  normalized.source = getAlertSource(normalized);
  return normalized;
}

function buildGroupedRows(alerts) {
  const rows = alerts.map(normalizeAlert);
  const countsByGroup = new Map();

  for (const row of rows) {
    countsByGroup.set(row.groupKey, (countsByGroup.get(row.groupKey) || 0) + 1);
  }

  return rows
    .map(row => ({ ...row, groupCount: countsByGroup.get(row.groupKey) }))
    .sort((left, right) => (
      left.ruleId.localeCompare(right.ruleId)
      || left.path.localeCompare(right.path)
      || String(left.severity).localeCompare(String(right.severity))
      || Number(left.alertNumber) - Number(right.alertNumber)
    ));
}

function buildSummaryRows(groupedRows) {
  const groups = new Map();

  for (const row of groupedRows) {
    if (!groups.has(row.groupKey)) {
      groups.set(row.groupKey, {
        ruleId: row.ruleId,
        ruleName: row.ruleName,
        severity: row.severity,
        securitySeverity: row.securitySeverity,
        source: row.source,
        path: row.path,
        alertCount: 0,
        alertNumbers: []
      });
    }

    const group = groups.get(row.groupKey);
    group.alertCount += 1;
    group.alertNumbers.push(row.alertNumber);
  }

  return [...groups.values()].sort((left, right) => (
    left.ruleId.localeCompare(right.ruleId)
    || left.path.localeCompare(right.path)
    || String(left.severity).localeCompare(String(right.severity))
  )).map(row => ({
    ...row,
    alertNumbers: row.alertNumbers.join(' ')
  }));
}

function readExistingTracker(trackerPath) {
  if (!fs.existsSync(trackerPath)) {
    return new Map();
  }

  const rows = parseCsv(fs.readFileSync(trackerPath, 'utf8'));
  return new Map(rows.map(row => [String(row.alertNumber), row]));
}

function buildTrackerRows(groupedRows, existingTracker) {
  const openAlertNumbers = new Set(groupedRows.map(row => String(row.alertNumber)));
  const trackerRows = groupedRows.map(row => {
    const existing = existingTracker.get(String(row.alertNumber)) || {};
    return {
      alertNumber: row.alertNumber,
      status: existing.status || 'deferred',
      disposition: existing.disposition || 'needs-review',
      ruleId: row.ruleId,
      severity: row.severity,
      securitySeverity: row.securitySeverity,
      source: row.source,
      path: row.path,
      startLine: row.startLine,
      owner: existing.owner || '',
      notes: existing.notes || '',
      htmlUrl: row.htmlUrl,
      lastSeenOpenAt: new Date().toISOString()
    };
  });

  for (const [alertNumber, existing] of existingTracker.entries()) {
    if (!openAlertNumbers.has(alertNumber)) {
      trackerRows.push({
        ...existing,
        status: existing.status === 'false-positive' ? existing.status : 'fixed',
        disposition: existing.disposition || 'closed-by-codeql',
        lastSeenOpenAt: existing.lastSeenOpenAt || ''
      });
    }
  }

  return trackerRows.sort((left, right) => Number(left.alertNumber) - Number(right.alertNumber));
}

function writeCsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, toCsv(rows, columns));
}

function buildTrendEntry(groupedRows, summaryRows, options = {}) {
  const {
    repository,
    ref,
    generatedAt = new Date().toISOString()
  } = options;
  const byRule = {};
  const bySeverity = {};
  const bySecuritySeverity = {};
  const bySource = {};

  for (const row of groupedRows) {
    byRule[row.ruleId] = (byRule[row.ruleId] || 0) + 1;
    bySeverity[row.severity] = (bySeverity[row.severity] || 0) + 1;
    bySecuritySeverity[row.securitySeverity] = (bySecuritySeverity[row.securitySeverity] || 0) + 1;
    bySource[row.source] = (bySource[row.source] || 0) + 1;
  }

  return {
    generatedAt,
    repository,
    ref: ref || 'all-open-alerts',
    totalOpenAlerts: groupedRows.length,
    groupedAlertCount: summaryRows.length,
    byRule,
    bySeverity,
    bySecuritySeverity,
    bySource
  };
}

const TRACKER_COLUMNS = [
  'alertNumber',
  'status',
  'disposition',
  'ruleId',
  'severity',
  'securitySeverity',
  'source',
  'path',
  'startLine',
  'owner',
  'notes',
  'htmlUrl',
  'lastSeenOpenAt'
];

function writeTrackerSnapshotFiles(snapshotDir, snapshotName, trackerRows) {
  writeCsv(path.join(snapshotDir, `${snapshotName}.csv`), trackerRows, TRACKER_COLUMNS);

  for (const source of [...new Set(trackerRows.map(row => row.source || 'unknown'))]) {
    writeCsv(
      path.join(snapshotDir, `${snapshotName}-${source}.csv`),
      trackerRows.filter(row => (row.source || 'unknown') === source),
      TRACKER_COLUMNS
    );
  }
}

function appendTrendEntry(trendPath, entry) {
  let existing = [];
  try {
    existing = JSON.parse(fs.readFileSync(trendPath, 'utf8'));
    if (!Array.isArray(existing)) {
      existing = [];
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  existing.push(entry);
  fs.mkdirSync(path.dirname(trendPath), { recursive: true });
  fs.writeFileSync(trendPath, JSON.stringify(existing, null, 2) + '\n');
}

function copyDashboardArtifact(outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  try {
    fs.copyFileSync(DASHBOARD_SOURCE_PATH, path.join(outputDir, 'codeql-alert-dashboard.html'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

function main() {
  const repository = getRepository();
  const ref = getOptionalRef();
  if (!repository) {
    throw new Error('Could not resolve GitHub repository. Pass --repo=owner/name or set GITHUB_REPOSITORY.');
  }

  const outputDir = path.resolve(ROOT, getArgValue('output-dir', DEFAULT_OUTPUT_DIR));
  const groupedExportPath = path.resolve(ROOT, getArgValue('alerts-csv', DEFAULT_GROUPED_EXPORT_PATH));
  const summaryExportPath = path.resolve(ROOT, getArgValue('summary-csv', DEFAULT_SUMMARY_EXPORT_PATH));
  const trackerPath = path.resolve(ROOT, getArgValue('tracker', DEFAULT_TRACKER_PATH));
  const trendPath = path.resolve(ROOT, getArgValue('trend-json', DEFAULT_TREND_PATH));
  const snapshotDir = path.resolve(ROOT, getArgValue('snapshot-dir', DEFAULT_SNAPSHOT_DIR));
  const shouldSkipTracker = hasFlag('skip-tracker');
  const shouldWriteSnapshot = hasFlag('write-snapshot') || Boolean(ref);
  const shouldSkipTrend = hasFlag('skip-trend');

  const alerts = listOpenAlerts(repository, ref);
  const groupedRows = buildGroupedRows(alerts);
  const summaryRows = buildSummaryRows(groupedRows);

  writeCsv(groupedExportPath, groupedRows, [
    'groupKey',
    'groupCount',
    'alertNumber',
    'ruleId',
    'ruleName',
    'severity',
    'securitySeverity',
    'source',
    'path',
    'startLine',
    'state',
    'tool',
    'createdAt',
    'updatedAt',
    'htmlUrl'
  ]);

  writeCsv(summaryExportPath, summaryRows, [
    'ruleId',
    'ruleName',
    'severity',
    'securitySeverity',
    'source',
    'path',
    'alertCount',
    'alertNumbers'
  ]);

  if (!shouldSkipTracker) {
    const trackerRows = buildTrackerRows(groupedRows, readExistingTracker(trackerPath));
    writeCsv(trackerPath, trackerRows, [
      'alertNumber',
      'status',
      'disposition',
      'ruleId',
      'severity',
      'securitySeverity',
      'source',
      'path',
      'startLine',
      'owner',
      'notes',
      'htmlUrl',
      'lastSeenOpenAt'
    ]);
  }

  if (shouldWriteSnapshot) {
    const snapshotName = getSnapshotName(ref);
    const snapshotTrackerPath = path.join(snapshotDir, `${snapshotName}.csv`);
    writeTrackerSnapshotFiles(snapshotDir, snapshotName, buildTrackerRows(groupedRows, new Map()));
    console.log(`Snapshot Tracker CSV: ${path.relative(ROOT, snapshotTrackerPath)}`);
  }

  if (!shouldSkipTrend) {
    appendTrendEntry(trendPath, buildTrendEntry(groupedRows, summaryRows, {
      repository,
      ref
    }));
    console.log(`Trend JSON: ${path.relative(ROOT, trendPath)}`);
  }

  copyDashboardArtifact(outputDir);

  console.log(`Exported ${groupedRows.length} open CodeQL alerts for ${repository}${ref ? ` at ${ref}` : ''}.`);
  console.log(`Detailed CSV: ${path.relative(ROOT, groupedExportPath)}`);
  console.log(`Summary CSV: ${path.relative(ROOT, summaryExportPath)}`);
  if (!shouldSkipTracker) {
    console.log(`Tracker CSV: ${path.relative(ROOT, trackerPath)}`);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
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

module.exports = {
  buildGroupedRows,
  buildSummaryRows,
  buildTrackerRows,
  buildTrendEntry,
  copyDashboardArtifact,
  getAlertSource,
  getSnapshotName,
  listOpenAlerts,
  normalizeAlert,
  splitCsvLine,
  parseCsv,
  writeTrackerSnapshotFiles,
  toCsv
};
