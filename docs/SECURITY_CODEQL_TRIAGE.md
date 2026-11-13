# CodeQL triage: PR #216 (feature/nabz-care-marketplace → main)

Reviewed 2 November 2026. The "CodeQL Alert Gate" fails when a PR has more open alerts than its base. `main` has 0, and this PR adds the whole Nabz product, so the gate has been red since October. This page records what each alert is, what was fixed, and the decision left for the repo owner.

## Summary

| Rule | Alerts | Verdict | Action |
|---|---|---|---|
| `js/sql-injection` (NoSQL) | 77 | **Mitigated at runtime** by the central sanitiser; no exploitable path found | Owner decision: dismiss as "false positive" with this page as the reason, or harden site by site (below) |
| `js/remote-property-injection` | 2 | **Real (admin-only):** inherited names such as `constructor` passed the settings allowlist | **Fixed:** own-property checks plus a path guard (`services/settingsService.js`); test `tests/unit/services/settings-unsafe-paths.test.js` |
| `js/polynomial-redos` | 2 | **Real (minor):** the email pattern could backtrack on crafted input with no length cap | **Fixed:** bounded, non-overlapping pattern in `onboardingTeamService.js` and `partnerApplicationService.js` |
| `js/unvalidated-dynamic-method-call` | 1 | Heat map layer looked up by a caller-supplied key | **Fixed:** two fixed layers, no lookup (`services/heatmapService.js`) |
| `js/resource-exhaustion` | 1 | Keep-alive timer duration came from the server unchecked | **Fixed:** clamped to 10 s–60 min (`frontends/shared/src/realtime.ts`) |
| `js/user-controlled-bypass` | 3 | False positive. `authController.js:102`: the portal choice can only narrow access. `adminMfaService.js:177`: both factor types are fully verified. `rateLimitEnhanced.js:88`: the token only picks the rate-limit bucket and is HMAC-verified | Dismiss: false positive |
| `js/weak-cryptographic-algorithm` | 1 | HMAC-SHA1 for TURN credentials is what the TURN REST credential scheme (coturn) requires; HMAC-SHA1 is not broken | Dismiss: won't fix (protocol requirement) |
| `js/clear-text-storage-of-sensitive-data` | 1 | The website remembers the delivery pin in `localStorage` (`frontends/web/lib/location.ts`). It's the user's own location on their own device, by design | Dismiss: won't fix (intended) |
| `js/sensitive-get-query` | 1 | `routes/careMarketplace.js:602`: the query value is a status checked against a fixed list | Dismiss: false positive |
| `js/http-to-file-access` | 1 | Development-only local upload write; already annotated | Dismiss: false positive |
| Notes (unused code, etc.) | 18 | Code quality | **Fixed** where in product code (unused imports and a dead function removed). Test-file notes remain |

## Why the 77 NoSQL alerts are not exploitable today

CodeQL follows request data into Mongoose queries but can't see the global middleware that cleans it. What happens at runtime:

1. **JSON bodies:** `utils/sanitization.js` runs for every request (`app.js`) and removes keys beginning with `$`, at any depth.
2. **Query strings:** Express 5's default "simple" parser keeps `status[$ne]=x` as a flat string key, so it never becomes an operator object.
3. **Route params** are always strings, and most are also validated (`isMongoId`, `isIn`).

`tests/unit/security/nosql-operator-stripping.test.js` proves all three. If someone removes the sanitiser or switches on the extended query parser, the test fails.

**Files with these alerts:**

| Alerts | Files |
|---|---|
| 14 | `pharmacyBatchService` |
| 13 | `pharmacyService` |
| 7 each | `careStoreService`, `carePlanService` |
| 5 each | `pharmacyAdminService`, `adService` |
| 4 | `pharmacySubstitutionService` |
| 3 | `careAdminService` |
| 2 each | `refillService`, `pharmacyStockAlertService`, `pharmacyCatalogService`, `partnerVerificationService`, `labOrderService`, `adminOpsService` |
| 1 each | `supportService`, `pharmacyComplianceService`, `payoutService`, `partnerPostService`, `partnerApplicationService`, `membershipService`, `chatService` |

## Owner decision (not taken automatically)

Dismissing security alerts hides signals, so it is left to a human reviewer.

**Option A: dismiss with this page as the reason** (fast; the gate goes green). After reviewing, run:

```bash
for n in $(gh api --paginate "repos/vasantsinghraji-byte/NOCTURAL/code-scanning/alerts?ref=refs/pull/216/merge&state=open&per_page=100" \
  --jq '.[] | select(.rule.id=="js/sql-injection") | .number'); do
  gh api -X PATCH "repos/vasantsinghraji-byte/NOCTURAL/code-scanning/alerts/$n" \
    -f state=dismissed -f dismissed_reason="false positive" \
    -f dismissed_comment="Global operator stripping (utils/sanitization.js) + Express 5 flat query parser; see docs/SECURITY_CODEQL_TRIAGE.md and tests/unit/security/nosql-operator-stripping.test.js"
done
```

**Option B: harden site by site** (slower; defence in depth). Wrap each request-derived value in `{ $eq: value }`, or check `typeof value === 'string'` at the query, starting with `pharmacyBatchService` and `pharmacyService`. CodeQL recognises both patterns. This is worth doing gradually as those files are touched anyway.

**Recommendation:** dismiss the false positives in the table now, and take option A for the NoSQL alerts. Adopt option B in files as they're edited.
