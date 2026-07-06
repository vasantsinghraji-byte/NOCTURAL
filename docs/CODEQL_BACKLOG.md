# CodeQL Backlog — Open Alerts on develop

> Working inventory for security triage. Rule: each cluster below is fixed in its **own
> small `fix/` PR against the root originals — never inside a restructure phase**
> (Decision Log 2026-07-03). Original snapshot 2026-07-03 at develop `e5476b3` (31 open).
> Last reconciled **2026-07-05 at develop `12026e8`**.
>
> **Reading alert state correctly (important):** GitHub pins each alert's `open/fixed`
> state to the **default branch (`main`)**, so a fix merged to `develop` still shows
> `open` globally until `develop → main` is promoted. Judge progress by the per-ref
> counts, not the global list:
> - `...alerts?state=open&ref=refs/heads/develop` → **4 open** (the real remaining work)
> - `...alerts?state=open&ref=refs/heads/main` → **39 open** (pre-fix baseline; all the
>   merged fixes below auto-close here at the next promotion)
>
> Re-generate the authoritative develop view with:
> `gh api "repos/<owner>/<repo>/code-scanning/alerts?state=open&ref=refs/heads/develop&per_page=100" --paginate --jq '.[]|select(.tool.name=="CodeQL")|"\(.rule.id)\t\(.most_recent_instance.location.path):\(.most_recent_instance.location.start_line)"'`

## Triage clusters (suggested PR grouping, highest value first)

| Cluster | Alerts | Rules | Files | Notes |
|---|---|---|---|---|
| 1. Payment/patient controller auth bypass | 5 | `js/user-controlled-bypass` (high) | `controllers/paymentController.js` (4), `controllers/patientController.js` (1) | Highest priority: live payment + patient auth paths. |
| 2. Sanitization/validation property injection | 9 | `js/remote-property-injection` (high) | `utils/sanitization.js` (4), `middleware/validation.js` (3), `utils/pagination.js` (2) | Core middleware — fix carefully with regression tests; these utilities defend everything else. |
| 3. Regex hardening | Cleared | — | — | `utils/pagination.js` `js/regex-injection` fixed (cluster-3 PR: `safeCaseInsensitiveRegex`); `middleware/validation.js` `js/polynomial-redos` fixed in cluster-2 PR; `routes/duties-paginated-example.js` `js/regex-injection` dismissed (unmounted, Phase 6 deletion candidate). |
| 4. Incomplete sanitization | Cleared | — | — | Fixed in PR #154. (`middleware/validation.js` `js/incomplete-multi-character-sanitization` had already been fixed in the cluster-2 PR #149.) |
| 5. Ops-script hygiene | Cleared | — | — | Fixed in PR #155 (`scripts/setup-mongodb-security.js`, `scripts/setup-env.js`, `scripts/rotate-secrets.js`, `scripts/backup-database.js`), with an ops-script CodeQL-hygiene regression test. |
| 6. Resource exhaustion | Cleared | — | — | Fixed in PR #153 (`utils/securityMonitor.js`). |
| 7. Misc / test-and-one-off | Dismissed | `js/log-injection` (medium), `js/regex/missing-regexp-anchor` (high) | `test-compression.js` (2), `tests/unit/authorization/k8s-security.test.js` (1) | Dismissed 2026-07-05: `test-compression.js` alerts as "won't fix" (Phase 6 deletion candidate); k8s test alert as "used in tests". No code fix warranted. |
| 8. Container-image CVEs | Closed — not active | `CVE-2026-3449` (low), `CVE-2026-31808` (med), `CVE-2025-5891` (med) | Docker image `/app/node_modules` (`@tootallnate/once`, `file-type`, `pm2`) | Investigated 2026-07-05 — see note below. **Nothing committed, nothing to untrack;** these were transient Trivy container-image-scan findings, no longer in the open alert set. |
| 9. Sensitive data in GET query (uncategorized) | Dismissed (false positive) | `js/sensitive-get-query` (medium) | `middleware/healthDataAccess.js:164` | Dismissed 2026-07-05: `patientId` is a REST **path** param (`req.params`), not `req.query` — used only in async audit logging, never a secret, never echoed to a response; `code_flows=0` (syntactic heuristic). Removing the path param would break the route contract. **Judgment-call dismissal on live middleware — reversible if the direction changes.** |

## Cluster 8 investigation (2026-07-05) — closed, no action

The original snapshot mislabelled these as "committed / vendored `app/node_modules`."
That premise is false:

- **Nothing is committed.** `git ls-files app/` → 0 files; `app/` is gitignored
  (`.gitignore` has both `node_modules/` and `app/`). There is no vendored tree
  to untrack.
- **Source is the Trivy container-image scan.** The `Dockerfile` builds into
  `WORKDIR /app`, and `.github/workflows/deploy.yml` runs
  `aquasecurity/trivy-action` against the built image and uploads SARIF. That is
  why the paths read `app/node_modules/...package.json` — they are files *inside
  the Docker image*, not the repo.
- **Not currently open.** As of `develop` today, the only open code-scanning
  alerts are 35 CodeQL (all `main`-pinned); **zero** open alerts reference
  `node_modules` or these CVEs. The Trivy entries were tied to an older image
  scan and have aged out of the open set.
- **They never gated anything.** The Trivy step is `severity: CRITICAL,HIGH` +
  `ignore-unfixed: true` + `exit-code: 1`; these are low/medium, so they do not
  fail the deploy gate.
- **No straightforward dependency bump.** `file-type` is already latest
  (`^22.0.1`); `pm2` and `@tootallnate/once` are image/transitive and not in the
  root lockfile.

**Standing recommendation (not urgent):** keep the Docker base image and deps
current so image scans stay clean; the deploy gate already blocks CRITICAL/HIGH.
Container-image CVE hygiene is image-maintenance work, not a code-scanning
backlog item — de-scoped from this document.

## Remaining on develop (as of 2026-07-05)

**0 open CodeQL alerts on develop.** All clusters are fixed or dismissed with
documented rationale (verified: `...alerts?state=open&ref=refs/heads/develop`
→ 0 CodeQL). The 4 that were open at `12026e8` (3 × cluster 7 test/one-off,
1 × cluster 9 false positive) were dismissed 2026-07-05.

Everything still listed as "open" globally is `main`-pinned and clears at the
next `develop → main` promotion. Cluster 8 (container-image CVEs) was
investigated and closed — nothing committed, transient Trivy findings, de-scoped
as image-maintenance (see the cluster 8 note above). **The CodeQL backlog is now
fully resolved.**

## Already resolved (for the record)

- 1 × `js/resource-exhaustion` (cluster 6) — fixed by PR #153 (`utils/securityMonitor.js`).
- 2 × `js/incomplete-sanitization` (cluster 4) — fixed by PR #154 (`scripts/doctor-local.js`, `client/build.config.js`).
- 6 × ops-script hygiene (cluster 5: `js/file-system-race`, `js/biased-cryptographic-random`, `js/indirect-command-line-injection`) — fixed by PR #155.
- 1 × `js/regex-injection` (cluster 3) — fixed by PR #152: `utils/pagination.js` `paginateWithSearch` now builds its search regex via `safeMongo.safeCaseInsensitiveRegex` (escaped + length-capped). The `routes/duties-paginated-example.js` counterpart was dismissed (unmounted; Phase 6 deletion candidate).
- 9 × `js/remote-property-injection` (cluster 2) + 1 × `js/polynomial-redos` + 1 × `js/incomplete-multi-character-sanitization` (both `middleware/validation.js`, clusters 3–4) — fixed by PR #149: allowlist-gated `defineProperty` writes in `utils/sanitization.js`, `middleware/validation.js`, `utils/pagination.js`, plus a linear, loop-until-stable HTML-tag strip in the same `sanitizeInput` function.
- 5 × `js/user-controlled-bypass` (cluster 1) — fixed by PR #148 (`controllers/paymentController.js`, `controllers/patientController.js` + route-boundary validation).
- 8 × `js/sql-injection` — fixed by PR #144 (`routes/payments.js`, `services/applicationService.js`).
- 2 × `js/missing-rate-limiting` — dismissed with documented rationale (unmounted example route; test harness).
- 26 alerts against `apps/duty-shift/**` — parked mirror excluded from scanning (`.github/codeql/codeql-config.yml`); root counterparts tracked here instead.

> **Promotion note:** all merged fixes above are on develop; their `main`-pinned alerts (39 total)
> auto-close when develop is promoted to main. Confirm via the develop→main checklist in
> `PHASE1_SPLIT_RECONCILED.md`.
