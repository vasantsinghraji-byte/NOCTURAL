# Phase 6 Deletion-Candidate Inventory

> **Status: PROPOSED ONLY — nothing here may be deleted.** Phase 6 has its own approval gate
> (Tech Lead / Owner, per-batch) which is **Pending** in the blueprint's Approval Record.
> This inventory exists so the Phase 6 review can start instantly once approved.
> Prepared 2026-07-03 against develop `e5476b3`; all listed files verified to exist.

| # | Candidate | Evidence / rationale | Risk if deleted | Status |
|---|---|---|---|---|
| 1 | `routes/duties-paginated-example.js` | Not mounted anywhere (verified: no require in `routes/v1/index.js` or `app.js`; only referenced in a script's file list). Carries an open `js/regex-injection` CodeQL alert and a dismissed rate-limiting alert. | Low — dead code. Remove its entry from `scripts/replace-hardcoded-constants.js` in the same batch. | Proposed |
| 2 | `packages/shared/src/utils/localFileSystem.js` | Stray pre-Phase-1 copy. The `@nocturnal/shared` facade exports the root `utils/localFileSystem.js`; nothing imports this copy. | Low — verify no deep import (`@nocturnal/shared/src/utils/...`) exists before batch. | Proposed |
| 3 | `fix-mongodb-auth.bat` | Blueprint-named one-off ops script (root). | Owner must confirm not used in local ops runbooks. | Proposed |
| 4 | `enable-mongodb-auth.ps1`, `enable-mongodb-auth-fixed.ps1`, `enable-mongodb-auth-manual.txt` | Blueprint-named one-offs. Note `-fixed` variant violates the no-`fixed`-suffix naming rule — at minimum the pair should be reconciled. `scripts/enable-mongodb-auth.bat` is referenced by the `db:enable-auth` npm script and is **NOT** a candidate. | Owner confirmation needed; keep the npm-wired script. | Proposed |
| 5 | `verify-and-fix-auth.js`, `fix-auth-with-localhost-exception.js`, `recreate-dev-prod-users.js` | Blueprint-named one-off auth-repair scripts at repo root. | Owner must confirm the incidents they served are closed. | Proposed |
| 6 | `test-compression.js` | Ad-hoc root script (not under `tests/`); carries 2 open `js/log-injection` CodeQL alerts. | Low — not referenced by any npm script. | Proposed |
| 7 | Inert jest ignore pattern `'/services/patient-booking-service/tests/'` in `jest.fast.config.js` | The service was de-extracted; the path matches nothing (documented in `CLAUDE.md`). Config-line removal, not file deletion. | None. | Proposed |

## Rules for the eventual Phase 6 batch

- Explicit approval per batch, recorded in the blueprint's Approval Record.
- One PR, cleanup only, no mixed purposes.
- After deletion: `npm test`, `npm run lint:baseline`, and a final diff review confirming only approved items were removed.
