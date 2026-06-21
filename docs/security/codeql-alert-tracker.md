# CodeQL Alert Tracker

The canonical tracker is `docs/security/codeql-alert-tracker.csv`.

Refresh it with:

```bash
npm run security:codeql:export
```

The export writes:

- `reports/security/codeql-open-alerts.csv`: every open alert, sorted by rule, file, and severity.
- `reports/security/codeql-open-alert-summary.csv`: grouped counts by rule, file, and severity.
- `reports/security/codeql-alert-trend.json`: append-only alert counts for graphing over time.
- `reports/security/codeql-tracker-snapshots/*.csv`: branch/ref-specific tracker snapshots.
- `docs/security/codeql-alert-tracker.csv`: triage tracker keyed by CodeQL alert number.

Use `--skip-tracker` for temporary PR-ref exports where only generated CSV
artifacts are needed.

Examples:

```bash
npm run security:codeql:export -- --ref=refs/heads/main
npm run security:codeql:export -- --ref=refs/heads/develop
npm run security:codeql:export -- --ref=refs/pull/123/merge --skip-tracker
```

## Status Values

- `deferred`: open alert still needs a fix or a reviewed dismissal decision.
- `fixed`: alert was previously tracked but is no longer returned by GitHub as open.
- `false-positive`: alert was reviewed and should be dismissed in GitHub with a documented reason.

Keep `owner` and `notes` updated before dismissing or deferring an alert.
The dismissal script rejects false-positive rows unless they use the
`reviewed-false-positive` disposition and include a numeric alert number,
rule, path, owner, and non-empty review notes.

## Dismissing False Positives

Mark reviewed false positives in `docs/security/codeql-alert-tracker.csv`:

```csv
alertNumber,status,disposition,ruleId,severity,securitySeverity,path,startLine,owner,notes,htmlUrl,lastSeenOpenAt
123,false-positive,reviewed-false-positive,js/example,warning,medium,path/file.js,10,@owner,Reason reviewed by owner,https://github.com/...,2026-06-16T00:00:00.000Z
```

Preview dismissals:

```bash
npm run security:codeql:dismiss-false-positives
```

Apply dismissals after review:

```bash
node scripts/dismiss-codeql-false-positives.js
```

## Post-Push Verification

After pushing a branch and opening a PR, verify checks and alert closure with:

```bash
gh pr checks
npm run security:codeql:export
gh api "repos/vasantsinghraji-byte/NOCTURAL/code-scanning/alerts?state=open&per_page=100" --paginate
```

Expected result after CodeQL has re-analyzed the pushed branch:

- Fixed alerts disappear from the open-alert export and are marked `fixed` in the tracker on the next export.
- Remaining true positives stay `deferred` until fixed.
- Reviewed false positives should be dismissed in GitHub and marked `false-positive` with notes.
