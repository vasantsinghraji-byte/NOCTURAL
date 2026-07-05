# CodeQL Backlog — Open Alerts on develop

> Working inventory for security triage. Rule: each cluster below is fixed in its **own
> small `fix/` PR against the root originals — never inside a restructure phase**
> (Decision Log 2026-07-03). Snapshot taken 2026-07-03 at develop `e5476b3`
> (31 open alerts). Re-generate with:
> `gh api "repos/<owner>/<repo>/code-scanning/alerts?state=open&ref=refs/heads/develop&per_page=100" --paginate`

## Triage clusters (suggested PR grouping, highest value first)

| Cluster | Alerts | Rules | Files | Notes |
|---|---|---|---|---|
| 1. Payment/patient controller auth bypass | 5 | `js/user-controlled-bypass` (high) | `controllers/paymentController.js` (4), `controllers/patientController.js` (1) | Highest priority: live payment + patient auth paths. |
| 2. Sanitization/validation property injection | 9 | `js/remote-property-injection` (high) | `utils/sanitization.js` (4), `middleware/validation.js` (3), `utils/pagination.js` (2) | Core middleware — fix carefully with regression tests; these utilities defend everything else. |
| 3. Regex hardening | 2 remaining | `js/regex-injection` (high) | `utils/pagination.js`, `routes/duties-paginated-example.js` | The `middleware/validation.js` `js/polynomial-redos` was resolved in the cluster-2 PR (same function). The example-route alert disappears if Phase 6 deletes the file (see `PHASE6_DELETION_CANDIDATES.md`). |
| 4. Incomplete sanitization | 2 | `js/incomplete-sanitization`, `js/incomplete-multi-character-sanitization` (high) | `middleware/validation.js`, `scripts/doctor-local.js`, `client/build.config.js` | Overlaps cluster 2 in `validation.js`; batch together if convenient. |
| 5. Ops-script hygiene | 6 | `js/file-system-race`, `js/biased-cryptographic-random`, `js/indirect-command-line-injection` (high/medium) | `scripts/setup-mongodb-security.js`, `scripts/setup-env.js`, `scripts/rotate-secrets.js`, `scripts/backup-database.js` | Not request-path code, but rotate-secrets/crypto-random findings deserve real fixes. |
| 6. Resource exhaustion | 1 | `js/resource-exhaustion` (high) | `utils/securityMonitor.js` | Single fix. |
| 7. Misc / likely dismissals | 3 | `js/log-injection` (medium), `js/missing-regexp-anchor` (high) | `test-compression.js` (2), `tests/unit/authorization/k8s-security.test.js` (1) | Test/one-off code — candidates for documented dismissal ("used in tests") or Phase 6 deletion (`test-compression.js`). |
| 8. Dependency CVEs | 3 | `CVE-2026-3449` (low), `CVE-2026-31808`, `CVE-2025-5891` (medium) | vendored `app/node_modules/**` (`@tootallnate/once`, `file-type`, `pm2`) | Why is `app/node_modules` committed/scanned? Investigate that first — the right fix may be untracking it, not patching vendored packages. |

## Already resolved (for the record)

- 9 × `js/remote-property-injection` (cluster 2) + 1 × `js/polynomial-redos` (`middleware/validation.js`, cluster 3) — fixed in the cluster-2 PR: allowlist-gated `defineProperty` writes in `utils/sanitization.js`, `middleware/validation.js`, `utils/pagination.js`, and a linear-time tag-strip regex in the same `sanitizeInput` function.
- 5 × `js/user-controlled-bypass` (cluster 1) — fixed by PR #148 (`controllers/paymentController.js`, `controllers/patientController.js` + route-boundary validation).
- 8 × `js/sql-injection` — fixed by PR #144 (`routes/payments.js`, `services/applicationService.js`); auto-close on `main` at next promotion.
- 2 × `js/missing-rate-limiting` — dismissed with documented rationale (unmounted example route; test harness).
- 26 alerts against `apps/duty-shift/**` — parked mirror excluded from scanning (`.github/codeql/codeql-config.yml`); root counterparts tracked here instead.
