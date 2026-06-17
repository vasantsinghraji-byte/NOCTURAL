const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildGroupedRows,
  buildSummaryRows,
  buildTrackerRows,
  buildTrendEntry,
  getAlertSource,
  getSnapshotName,
  parseCsv,
  splitCsvLine,
  toCsv
} = require('../../../scripts/export-codeql-alerts');
const {
  getFalsePositiveRows
} = require('../../../scripts/dismiss-codeql-false-positives');

function makeAlert(number, ruleId, filePath, severity = 'warning', securitySeverity = 'high') {
  return {
    number,
    state: 'open',
    rule: {
      id: ruleId,
      name: ruleId,
      severity,
      security_severity_level: securitySeverity
    },
    tool: {
      name: 'CodeQL'
    },
    most_recent_instance: {
      location: {
        path: filePath,
        start_line: number + 10
      }
    },
    created_at: '2026-06-16T00:00:00Z',
    updated_at: '2026-06-16T00:00:00Z',
    html_url: `https://github.test/security/code-scanning/${number}`
  };
}

describe('CodeQL alert export helpers', () => {
  it('round-trips CSV values with commas and quotes', () => {
    const csv = toCsv([
      {
        alertNumber: 1,
        notes: 'quoted "value", with comma'
      }
    ], ['alertNumber', 'notes']);

    expect(splitCsvLine(csv.trim().split(/\r?\n/)[1])).toEqual([
      '1',
      'quoted "value", with comma'
    ]);
    expect(parseCsv(csv)).toEqual([
      {
        alertNumber: '1',
        notes: 'quoted "value", with comma'
      }
    ]);
  });

  it('groups alerts by rule, path, and severity', () => {
    const groupedRows = buildGroupedRows([
      makeAlert(2, 'js/sql-injection', 'routes/a.js'),
      makeAlert(1, 'js/sql-injection', 'routes/a.js'),
      makeAlert(3, 'js/xss-through-dom', 'client/a.js')
    ]);

    expect(groupedRows.map(row => ({
      alertNumber: row.alertNumber,
      groupCount: row.groupCount,
      groupKey: row.groupKey
    }))).toEqual([
      {
        alertNumber: 1,
        groupCount: 2,
        groupKey: 'js/sql-injection|routes/a.js|warning'
      },
      {
        alertNumber: 2,
        groupCount: 2,
        groupKey: 'js/sql-injection|routes/a.js|warning'
      },
      {
        alertNumber: 3,
        groupCount: 1,
        groupKey: 'js/xss-through-dom|client/a.js|warning'
      }
    ]);
  });

  it('builds summary rows and trend entries for graphing', () => {
    const groupedRows = buildGroupedRows([
      makeAlert(1, 'js/sql-injection', 'routes/a.js'),
      makeAlert(2, 'js/sql-injection', 'routes/a.js'),
      makeAlert(3, 'js/missing-rate-limiting', 'routes/b.js', 'error', 'medium')
    ]);
    const summaryRows = buildSummaryRows(groupedRows);

    expect(summaryRows).toEqual([
      {
        ruleId: 'js/missing-rate-limiting',
        ruleName: 'js/missing-rate-limiting',
        severity: 'error',
        securitySeverity: 'medium',
        source: 'codeql-query',
        path: 'routes/b.js',
        alertCount: 1,
        alertNumbers: '3'
      },
      {
        ruleId: 'js/sql-injection',
        ruleName: 'js/sql-injection',
        severity: 'warning',
        securitySeverity: 'high',
        source: 'codeql-query',
        path: 'routes/a.js',
        alertCount: 2,
        alertNumbers: '1 2'
      }
    ]);

    expect(buildTrendEntry(groupedRows, summaryRows, {
      repository: 'owner/repo',
      ref: 'refs/heads/main',
      generatedAt: '2026-06-16T00:00:00.000Z'
    })).toEqual({
      generatedAt: '2026-06-16T00:00:00.000Z',
      repository: 'owner/repo',
      ref: 'refs/heads/main',
      totalOpenAlerts: 3,
      groupedAlertCount: 2,
      byRule: {
        'js/missing-rate-limiting': 1,
        'js/sql-injection': 2
      },
      bySeverity: {
        error: 1,
        warning: 2
      },
      bySecuritySeverity: {
        high: 2,
        medium: 1
      },
      bySource: {
        'codeql-query': 3
      }
    });
  });

  it('preserves reviewed tracker metadata and marks disappeared alerts fixed', () => {
    const groupedRows = buildGroupedRows([
      makeAlert(1, 'js/sql-injection', 'routes/a.js')
    ]);
    const existingTracker = new Map([
      ['1', {
        alertNumber: '1',
        status: 'deferred',
        disposition: 'needs-review',
        owner: '@owner',
        notes: 'needs route allowlist'
      }],
      ['2', {
        alertNumber: '2',
        status: 'deferred',
        disposition: 'needs-review',
        ruleId: 'js/xss-through-dom',
        path: 'client/a.js'
      }]
    ]);

    const trackerRows = buildTrackerRows(groupedRows, existingTracker);

    expect(trackerRows[0]).toMatchObject({
      alertNumber: 1,
      status: 'deferred',
      disposition: 'needs-review',
      owner: '@owner',
      notes: 'needs route allowlist'
    });
    expect(trackerRows[1]).toMatchObject({
      alertNumber: '2',
      status: 'fixed',
      disposition: 'needs-review',
      ruleId: 'js/xss-through-dom',
      path: 'client/a.js'
    });
  });

  it('normalizes branch and PR refs into snapshot file names', () => {
    expect(getSnapshotName('refs/heads/main')).toBe('main');
    expect(getSnapshotName('refs/heads/feature/security/audit')).toBe('feature-security-audit');
    expect(getSnapshotName('refs/pull/123/merge')).toBe('pr-123');
    expect(getSnapshotName('')).toBe('default');
  });

  it('classifies CodeQL query and dependency CVE alert sources', () => {
    expect(getAlertSource({ ruleId: 'js/sql-injection' })).toBe('codeql-query');
    expect(getAlertSource({ ruleId: 'CVE-2026-3449' })).toBe('dependency-cve');
  });

  it('selects only tracker rows marked false-positive for dismissal', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeql-tracker-'));
    const trackerPath = path.join(tempDir, 'tracker.csv');

    // Test writes only to a freshly-created temporary directory.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.writeFileSync(trackerPath, toCsv([
      {
        alertNumber: 1,
        status: 'false-positive',
        disposition: 'reviewed-false-positive',
        ruleId: 'js/example',
        notes: 'safe test fixture'
      },
      {
        alertNumber: 2,
        status: 'deferred',
        disposition: 'needs-review',
        ruleId: 'js/sql-injection',
        notes: ''
      }
    ], ['alertNumber', 'status', 'disposition', 'ruleId', 'notes']));

    expect(getFalsePositiveRows(trackerPath)).toEqual([
      {
        alertNumber: '1',
        status: 'false-positive',
        disposition: 'reviewed-false-positive',
        ruleId: 'js/example',
        notes: 'safe test fixture'
      }
    ]);
  });
});
