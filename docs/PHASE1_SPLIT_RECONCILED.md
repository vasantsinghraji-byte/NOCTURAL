# Canonical Repo Blueprint

This repo copy is the canonical Phase 1 monorepo-split blueprint. The original plan under `C:\Users\MSI\.claude\plans\` is now historical only; future implementation sessions should follow and update this file.

# NOCTURNAL Restructure Roadmap

> Status: **PHASES 0-4 RELEASED TO PRODUCTION; PHASE 5-A COMPLETE AND MERGED TO `develop`; PHASE 6 BLOCKED PENDING SEPARATE OWNER DELETION APPROVAL; duty-shift routes stay live.**
> Active repo: `D:\NOCTURNAL\NOCTURAL` (typo'd folder name is intentional; do not rename).
> Production release state: `main` is live on Render at `a68a5ba` (PR #173 render-smoke origin matrix, on top of PR #170 CORS hotfix `bc1d1de`, PR #160 `8a43326`, and PR #158 promotion `13b704c`); both services verified reporting `deploymentCommit=a68a5ba8deaa79e2b7a023d91259330685b81b91` via `/api/v1/health` on 2026-07-14 — see the Hotfix / incident record below.
> Note (2026-07-13): "Render" means the canonical `nocturnal-api` service. A second legacy service, `NOCTURAL` (`noctural.onrender.com`), also auto-deploys `main`; it was stuck on `e7b220b` after two exit-1 deploys on 2026-07-06 and was recovered on 2026-07-13 (`REDIS_ENABLED=false` — the first fix attempt saved `False`, which the strict `=== 'false'` guard rejects — plus explicit `ALLOWED_ORIGINS` and a `/api/v1/health` health check). See the Decision Log and `docs/ops/render-post-deploy-smoke.md`.
> Phase 5-A scope baseline: `7d41487` = PR #150 (Phase 5 duty-shift-live roadmap revision) on top of PR #148 (`3d65758`, CodeQL user-controlled-bypass fixes), PR #147 (`1ca204d`, tracker update), PR #146 (`17ca90f`, pre-commit hook speedup + password-pattern fix), PR #145 (`2fd19d0`, governance + mirror guard), and PR #143 (`3de2a2b`, Phase 4). Phases 0-4 and approved follow-ups are merged and released to production.

## Document Control

| Field | Value |
|---|---|
| Document Name | NOCTURNAL Restructure Roadmap |
| Status | In Execution — Phases 0-4 released to production; Phase 5-A complete and merged; Phase 6 not approved |
| Version | v1.13 |
| Owner | VASANT SINGH RAJI |
| Last Updated | 2026-07-14 |
| Next Review Date | Only after separate Owner approval identifies an explicit Phase 6 deletion batch |
| Approved For Execution | Phases 0-5-A plus approved governance/hook follow-ups. Phase 5-A merged through PR #177 (`ab2046a`). Phase 6 planning/deletion is **not approved**; see Approval Record. |

## Current Phase Tracker

| Field | Value |
|---|---|
| Current Phase | Between phases — Phase 5-A complete and merged through PR #177 (`ab2046a`); Phase 6 blocked pending separate Owner deletion approval |
| Execution Status | Phases 0-4 merged and released to production: PR #141 (Phases 0-2), PR #142 (Phase 3), PR #143 (Phase 4, `3de2a2b`), PR #144 (standalone duty-shift NoSQL-injection fixes, `e5476b3`), PR #145 (governance + mirror guard, `2fd19d0`), PR #146 (hook speedup + password-pattern fix, `17ca90f`), PR #147 (tracker update, `1ca204d`), PR #148 (CodeQL user-controlled-bypass fixes, `3d65758`), PR #150 (duty-shift-live roadmap revision, `7d41487`), PR #158 (develop to main promotion, `13b704c`), and PR #160 (Render startup hotfix, `8a43326`). Phase 5-A validation scripts, route coverage, and import-ownership enforcement merged to `develop` through PR #177 (`ab2046a`) |
| Current Owner | VASANT SINGH RAJI |
| Last Validation Result | PR #177 final head `1e7fc5f`: CI, CodeQL, CodeQL Alert Gate, deployment gate, public-funnel E2E, container smoke build, lint, tests, secret scan, security audit, and governance gate all green; merged to `develop` at `ab2046a` on 2026-07-14 |
| Next Required Approval | Separate Tech Lead / Owner approval naming the exact Phase 6 deletion batch; no Phase 6 planning or deletion is authorized yet |

## Approval Record

Canonical record of gate approvals. A phase may not start until its row says **Approved** with a date and approver. "Phase N complete" never implies "Phase N+1 approved" — check this table.

| Gate | Status | Date | Approver |
|---|---|---|---|
| Phase 1 Start (Tech Lead) | **Approved** | 2026-07-02 | VASANT SINGH RAJI (Owner / Tech Lead) — instructed start of Phase 1 |
| Phase 2 Start (Tech Lead) | **Approved** | 2026-07-02 | VASANT SINGH RAJI (Owner / Tech Lead) — instructed start of Phase 2 (workspaces) |
| Phase 3 Start (Tech Lead) | **Approved** | 2026-07-02 | VASANT SINGH RAJI (Owner / Tech Lead) — instructed via "do the Next Steps"; gate precondition met (shared package validated, no-eager-load regression test in place) |
| Phase 4 Start (Tech Lead) | **Approved** | 2026-07-03 | VASANT SINGH RAJI (Owner / Tech Lead) — instructed copy-only Phase 4 from fresh develop; gate preconditions met (Phase 3 merged via PR #142, develop clean) |
| Phase 5 Direction (Product Owner — duty-shift stays live) | **Approved** | 2026-07-05 | VASANT SINGH RAJI (Owner / Product Owner) — explicitly rejected duty-shift dormancy; continue patient-health split only |
| Phase 5-A Scope (Tech Lead — validation/test/import cleanup) | **Approved** | 2026-07-05 | VASANT SINGH RAJI (Owner / Tech Lead) — chose validation scripts, test coverage, and import ownership cleanup before implementation |
| Phase 5-A Implementation Start (Tech Lead — patient-health-only split) | **Approved** | 2026-07-14 | VASANT SINGH RAJI (Owner / Tech Lead) — instructed "begin the approved 5-A scope"; readiness score 9/10 recorded; start from `origin/develop` `952d806` (PR #174) on branch `refactor/restructure-phase5a-validation` |
| Phase 5-A Completion | **Complete** | 2026-07-14 | PR #177 merged to `develop` at `ab2046a`; all scoped exit criteria and required checks passed |
| Phase 6 Start (Tech Lead / Owner — deletion batches) | Pending | — | — |

## Open Questions

| Question | Impact | Owner | Status |
|---|---|---|---|
| Which lazy export mechanism will be used? | Affects Phase 1 implementation | Tech Lead | **Resolved 2026-07-02: lazy getters** (see `docs/PHASE1_IMPLEMENTATION_NOTES.md`) |
| Are duty-shift routes safe to park? | Affects Phase 5 | Product Owner | **Resolved 2026-07-05: No. Duty-shift routes must stay live** |
| Which patient-health-only cutover steps are approved for Phase 5? | Affects implementation scope | Tech Lead / Owner | **Resolved 2026-07-05: Phase 5-A = validation scripts, test coverage, import ownership cleanup only** |

## PR Strategy

- One PR per phase.
- No mixed-purpose PRs.
- No cleanup inside copy phases.
- PR title format: `restructure/phase-X-short-summary`.
- Every PR must include validation output.
- Every PR must reference the phase exit criteria.

## Executive Summary

**Objective:** Convert NOCTURNAL into a clean monorepo without breaking the existing app.

**Current Mode:** Phases 0-4 and approved follow-up hardening are merged and released. Phase 5-A is complete on `develop` through PR #177 (`ab2046a`). Duty-shift routes remain live. Phase 6 is blocked until the Owner separately approves an explicit deletion batch.

**Core Strategy:** Copy first, verify, then cut over later.

**Primary Risk:** Breaking auth, payments, route contracts, or shared dependencies.

**Success Definition:** Patient-health becomes cleanly separated, duty-shift is preserved, and the monolith keeps working during transition.

## Summary
This roadmap converts NOCTURNAL into a clean monorepo in small, reviewable phases:

- `packages/shared` = shared toolkit used by both products
- `apps/patient-health` = Phase 1 active product
- `apps/duty-shift` = parked mirror; live duty-shift product remains mounted in the monolith

The guiding rule is: **copy first, verify, then cut over later.** Nothing is deleted or rewritten during early phases. Work proceeds as small PRs, one phase per session.

## What Success Looks Like

This blueprint is successful when:

- Patient-health is separated into its own app folder.
- Duty-shift is preserved and parked.
- Shared code is routed through `packages/shared`.
- Existing app behavior remains unchanged during early phases.
- Tests, imports, routes, auth, and payments remain stable.
- Cleanup happens only after explicit approval.

## How to Use This Blueprint

1. Read the current phase only.
2. Confirm the exit criteria before moving forward.
3. Do not start the next phase until the previous phase is approved.
4. Use the risk checklist before making changes.
5. If any file is missing, obsolete, or unclear, stop and report.
6. No deletion, renaming, or behavior change is allowed unless explicitly approved.

## Non-Negotiable Rules

- No production behavior changes during copy phases.
- No deletion until explicit approval.
- No auth, payment, schema, or package-version changes.
- No `enhanced`, `v2`, `fixed`, `backup`, or duplicate files.
- Copy first, verify, cut over later.
- If unsure, stop and report.

## Stop Conditions

Stop immediately if:

- A required file is missing.
- An import causes unexpected side effects.
- Auth behavior changes.
- Payment route behavior changes.
- Tests fail unexpectedly.
- A developer needs to delete or rename files.
- The plan requires assumptions not written in this blueprint.

## Approval Gates

| Gate | Required Before Moving Forward | Approver |
|---|---|---|
| Phase 1 Start | Branch confirmed, repo clean, baseline documented | Tech Lead |
| Phase 3 Start | Shared package validated and no eager-loading confirmed | Tech Lead |
| Phase 4 Start | Phase 3 merged, patient-health copy validated, develop clean | Tech Lead |
| Phase 5 Start | Duty-shift-live decision recorded; patient-health-only implementation scope approved | Tech Lead / Owner |
| Phase 6 Start | Duplicate files and one-off scripts reviewed | Tech Lead / Owner |

## Validation Commands

Use these commands as applicable to the phase:

```powershell
node --check <changed-file>
node -e "require('./packages/shared')"
node -e "require('@nocturnal/shared')"
npm test
npm run lint:baseline
```

**Minimum Validation Rule:** No phase is complete until all required validation commands pass or failures are documented with a reason.

## Decision Log

| Date | Decision | Reason | Approved By |
|---|---|---|---|
| 2026-06-29 | Use copy-first strategy | Avoid breaking the monolith during restructure | User |
| 2026-06-29 | Keep a duty-shift copy parked, not deleted | Preserve Phase 2 work while live root routes remain available | User |
| 2026-06-29 | Use lazy exports or sub-barrels for shared package | Avoid import-time side effects | User |
| 2026-06-29 | Keep `mobileDevices.js` and `webAuthn.js` root-owned during Phase 1 | They use `protectBoth` from root `patientAuth` | User |
| 2026-07-02 | Add `spamTrap`, `authTokens`, `localFileSystem` to `@nocturnal/shared` (30 exports) | Phase 3 dependency trace surfaced them; root usage shows they are genuinely shared; app-local copies would duplicate shared security code | Owner / Tech Lead (Phase 3 execution) |
| 2026-07-03 | Keep Phase 3 CodeQL fix scoped to `apps/patient-health` copy | PR #142 was the split-app phase; monolith originals can be cleaned separately to avoid mixing phases | Owner / Tech Lead (Phase 3 closeout) |
| 2026-07-03 | Exclude `apps/duty-shift/**` from CodeQL via `.github/codeql/codeql-config.yml` | PR #143 CodeQL flagged 26 inherited alerts in the parked mirror; fixing them in place would break the copy-only hash-identity guarantee. Root originals remain fully scanned; alerts are fixed at the root | Owner / Tech Lead (Phase 4 closeout) |
| 2026-07-04 | Add mirror-integrity guard and Phase 5/6 governance packets before route cutover | PR #145 caught real duty-shift mirror drift from PR #144, restored hash identity, and made Phase 5/6 decisions explicit without starting Phase 5 | Owner / Tech Lead (follow-up hardening) |
| 2026-07-04 | Speed up the pre-commit secret scan and fix the generic password detector | PR #146 reduced hook runtime and corrected the POSIX character-class bug that made the password pattern miss valid assignments | Owner / Tech Lead (follow-up hardening) |
| 2026-07-05 | Supersede duty-shift dormancy plan; keep all duty-shift routes live | Product direction is to split patient-health from the current monolith without parking or unmounting the duty-shift product. Phase 5 is now patient-health-only continuation; no duty-shift route behavior may change | Owner / Product Owner |
| 2026-07-05 | Select Phase 5-A scope: validation scripts, test coverage, import ownership cleanup | This advances patient-health separation without runtime route isolation, staging runtime preparation, duty-shift changes, auth/payment/schema changes, or deletion risk | Owner / Tech Lead |
| 2026-07-06 | Release Phases 0-4 and approved follow-ups to production | PR #158 promoted `develop` to `main` at `13b704c`; Render auto-deploy initially failed because `REDIS_ENABLED=false` was configured but `middleware/rateLimitEnhanced.js` still required `REDIS_URL`; PR #160 fixed the startup guard and Render deployed `main@8a43326` live | Owner / Tech Lead |
| 2026-07-06 | Add deployed-commit identity to Render Smoke | PR #159 added a strict `/api/v1/health.deploymentCommit` smoke assertion so future post-deploy smokes fail when production is healthy but not running the expected commit | Owner / Tech Lead |
| 2026-07-13 | Keep the legacy `NOCTURAL` Render service (`noctural.onrender.com`) and fix it with `REDIS_ENABLED=false`; repoint all smoke targets at canonical `nocturnal-api` | The legacy service failed both 2026-07-06 deploys (exit 1: `REDIS_ENABLED` unset + no `REDIS_URL` trips the production guard in `middleware/rateLimitEnhanced.js`) and was still serving `e7b220b` (2026-06-28, pre-security-fix code) against the production DB. The `RENDER_SMOKE_BASE_URL`/`RENDER_SMOKE_ORIGIN` repo variables and workflow dispatch defaults also pointed monitoring at the legacy service; all were repointed to `https://nocturnal-api.onrender.com` (see `docs/ops/render-post-deploy-smoke.md`) | Owner / Tech Lead |
| 2026-07-14 | Start Phase 5-A implementation | Owner instructed start; readiness template filled (branch verified from `origin/develop` `952d806`, clean worktree, required files confirmed, rollback = revert Phase 5-A commits, validation commands known, approval received) — score 9/10, above the 8/10 gate. Deduction: develop advanced past the `7d41487` scope baseline (PRs #151–#174), so blueprint assumptions are re-verified against current code during execution | Owner / Tech Lead |
| 2026-07-14 | Codify Phase 5-A import ownership as validation instead of code changes | The import audit came back clean: all 143 app-local requires in `apps/patient-health` resolve, no duty-shift-owned imports anywhere, and the only root-reaching requires are the 8 approved wiring imports in `app.js`/`server.js`. Rather than expanding `@nocturnal/shared` exports (which would touch shared code without separate approval), the clean state is enforced by `scripts/validate-patient-health-split.js` (`npm run validate:patient-health-split`) and `tests/unit/infrastructure/phase5a-route-availability.test.js` | Owner / Tech Lead |
| 2026-07-14 | Complete Phase 5-A and merge PR #177 to `develop` | Final head `1e7fc5f` passed CI, CodeQL and alert gate, deployment gate, public-funnel E2E, container smoke, lint, tests, secret scan, security audit, and governance checks; PR #177 merged at `ab2046a`. No runtime route, auth, payment, schema, package-version, or duty-shift behavior changed. Phase 6 remains blocked pending a separate Owner-approved deletion batch | Owner / Tech Lead |

## Next Course of Action

1. Phases 0-4 and approved follow-ups are released to production. Current recorded production is `main@a68a5ba`; Phase 5-A is merged only to `develop` and is **not** promoted by this reconciliation.
2. Do not unmount, disable, pause, redirect, or otherwise change duty-shift routes in Phase 5.
3. Phase 5-A completed through PR #177 (`ab2046a`): validation script, route-availability tests, CI enforcement, and a clean import-ownership audit.
4. Reconcile `main` into `develop` before any later production promotion; reconciliation must not itself promote `develop` to `main`.
5. Keep Phase 6 planning and deletion blocked until the Owner separately approves an explicit deletion batch; duty-shift remains live.
6. Track the WebAuthn outbox-worker test flake separately in issue #178 and any remediation in a `fix/` branch, outside restructure phases.

## Develop → Main Promotion Checklist

Run through this whenever develop is next promoted to `main`:

- [ ] All restructure-phase PRs intended for the release are merged and the tracker above reflects reality.
- [ ] `npm run test:deploy-gate` green on the promotion candidate.
- [ ] After the promotion merge, confirm the **8 `js/sql-injection` alerts pinned to `refs/heads/main`** (alerts 50–54, 56, 57, 59 — fixed on develop by PR #144) **auto-close** once main's CodeQL analysis completes. If they remain open, investigate before announcing the release.
- [ ] Re-check open alert counts on `main` vs `develop` refs match expectations (`gh api .../code-scanning/alerts?ref=...`).
- [ ] After Render deploys, a manual Render Smoke run (`gh workflow run render-smoke.yml --ref main`) passes against the canonical `nocturnal-api` service **before announcing the release**. (Added 2026-07-13: the July 6 promotion shipped a CORS regression that broke cross-origin login for a week because the scheduled smoke was pointed at the legacy service — see PRs #169/#170.)

**Latest promotion record (2026-07-06):**

- [x] PR #158 promoted `develop` to `main` at `13b704c`.
- [x] PR #160 fixed the Render production startup blocker and moved `main` to `8a43326`.
- [x] Render `nocturnal-api` deploy `dep-d95pg399rddc73bf1340` is live for `8a43326`.
- [x] `/api/v1/health` returned healthy with `deploymentCommit=8a43326d5d50b504c36bd798be7d1c45ad2fb86c`.
- [x] `main` CodeQL open alert count is 0.

**Hotfix / incident record (2026-07-13 → 2026-07-14):**

- [x] Legacy `NOCTURAL` Render service recovered from two exit-1 deploys: `REDIS_ENABLED=false` (exact lowercase — a saved `False` failed the strict guard), explicit `ALLOWED_ORIGINS`, and `/api/v1/health` health check set; redeployed to `8a43326` (see Decision Log 2026-07-13).
- [x] Smoke monitoring repointed from the legacy service to canonical `nocturnal-api` (PR #167: workflow defaults, repo variables, legacy-parity check).
- [x] The repointed smoke immediately exposed a production CORS regression from the 2026-07-06 promotion: `d37dc9a` changed the API CORS mount to a prefix-only regex, which Express 5 use-mounts never match, so every non-preflight `/api/*` response lost its CORS headers (cross-origin login broken). Fixed in PR #169 (develop) and hotfixed to `main` via PR #170 → `main@bc1d1de`, admin-merged because the required post-deploy smoke tests live production and could not pass until the fix itself deployed.
- [x] Both services verified live at `bc1d1de` with CORS headers restored.
- [x] Second smoke pass exposed that `nocturnal-api`'s Render build command never built the frontend (served raw `client/public` source via the static fallback). Build command changed to `npm install --legacy-peer-deps && npm run build:frontend`; built service worker (`nocturnal-v4`) verified in production.
- [x] Full Render Smoke green end-to-end 2026-07-14 (run 29335343110), including the legacy-parity check.

## Glossary

**Monorepo:** One repository containing multiple related projects.

**Shared Package:** A common toolkit used by more than one app.

**Cutover:** The moment traffic, route mounting, or imports switch from the old structure to the new structure.

**Exit Criteria:** The conditions that prove a phase is complete.

**Approval Gate:** A required checkpoint before risky work begins.

**Temporary Mirrored Copy:** A copied file that should match the original except for approved import-path or app-wiring changes.

## Change Classification

Classify every change before it is made:

**Safe:**
- Copying files.
- Adding documentation.
- Adding workspace metadata without dependency version changes.

**Controlled:**
- Import-path adjustments.
- App-local wiring.
- Shared package exports.

**High Risk:**
- Route unmounting.
- Auth behavior changes.
- Payment behavior changes.
- Schema changes.
- Deleting files.

**Rule:** High-risk changes require separate approval and must not be bundled with safe copy phases.

## Reviewer Checklist

- [ ] Does this PR modify only the current phase files?
- [ ] Are there any business logic changes?
- [ ] Are auth, payment, schema, and package versions untouched?
- [ ] Are copied files mirrored correctly?
- [ ] Are shared imports justified?
- [ ] Were validation commands run?
- [ ] Are failures documented?
- [ ] Is the next phase still blocked until approval?

## AI Agent Instructions

- Do not improvise architecture.
- Do not rename folders.
- Do not create duplicate files with names like `enhanced`, `fixed`, `v2`, `backup`, `final`, or `new`.
- Do not delete files.
- Do not change package versions.
- Do not change auth, payment, database, or security behavior.
- If a required file is missing, stop and report.
- If a dependency path is unclear, ask for confirmation or document the uncertainty.
- Complete one phase only.

## Definition of Done

A phase is considered complete only when:

- All listed tasks are completed.
- No unapproved files were changed.
- Required validation commands pass.
- Any failures are documented.
- Exit criteria are satisfied.
- Review notes are recorded.
- Approval is given before moving to the next phase.

## Phase Completion Report Template

Use this format after each phase:

```text
Phase:
Date:
Branch:
Files changed:
Summary of work:
Validation commands run:
Results:
Risks discovered:
Open questions:
Recommendation:
Ready for next phase: Yes / No
```

## Dependency Ownership Matrix

| Area | Owner Location | Notes |
|---|---|---|
| Shared auth/session utilities | `packages/shared` | Only generic auth helpers |
| Patient auth | `apps/patient-health` or root during transition | Not shared unless separately approved |
| Health records | `apps/patient-health` | Patient-owned |
| Duty-shift models | `apps/duty-shift` | Parked Phase 2 |
| Payment B2C | Patient-health / existing route distinction | Do not merge with `/payments` |
| WebAuthn/mobile device routes | Root-owned for Phase 1 | Deferred classification |

## Do Not Touch Without Separate Approval

- Authentication behavior.
- Payment route behavior.
- Database schemas.
- Package versions.
- Production deployment configuration.
- Existing route contracts.
- Duty-shift route availability.
- Folder name `D:\NOCTURNAL\NOCTURAL`.

## Phase Readiness Score Template

Before starting any phase, fill this out:

```text
Branch verified: Yes / No
Working tree clean: Yes / No
Required files confirmed: Yes / No
Rollback approach known: Yes / No
Validation commands known: Yes / No
Approval received: Yes / No

Readiness Score: __ / 10
```

**Rule:** Do not begin the phase if readiness is below 8/10.

## Context — why this change

NOCTURNAL is really two products in one codebase: a **patient-health** product (Phase 1 priority) and a **duty-shift** staffing product (Phase 2, to be preserved but parked). Everything currently sits in flat top-level folders, so it is hard to tell which file belongs to which product, and shared login/security code is easy to edit in the "wrong copy." The goal is one monorepo with three clearly-labelled internal projects, **without breaking the running app** and **without deleting any duty-shift work**.

This supersedes the earlier `NOCTURNAL SPLIT.txt`, which was written against a stale snapshot. A read-only inspection plus a full `require()` dependency trace corrected six facts that shape the phases below:

| # | Old plan assumed | Reality | Consequence |
|---|---|---|---|
| 1 | `packages/shared` is a working toolkit | Holds one file; no `package.json`/`index.js`/exports | Must be **built first** (Phase 1) |
| 2 | `services/patient-booking-service` exists | **Absent**; de-extraction in progress | Excluded from this plan |
| 3 | No root `workspaces` (add it) | Correct; but `CLAUDE.md` wrongly claims it exists | Add workspaces; fix `CLAUDE.md` |
| 4 | `payment.js`/`payments.js` collide | Already split: `/api/v1/payments` vs feature-flagged `/api/v1/payments-b2c` | Preserve the distinction |
| 5 | Frontend at root `public/` | Real path `client/public/roles/patient/` + `client/public/js/patient-*.js` | Corrected source paths |
| 6 | ~15 clean shared imports | Larger, deeply-coupled surface; `patientAuth`/`healthDataAccess` depend on patient models (circular risk) | Patient-coupled modules are **patient-owned**, not shared |

**Mechanism for Phase 1:** `@nocturnal/shared` is created as a real package whose `src/index.js` **re-exports the shared modules that already exist in their current folders** (a single "front desk"). Nothing physically relocates yet; the monolith is untouched, and apps gain one clean import path. Physical relocation is deferred to a later, gradual cutover.

## Phase-Wise Blueprint

### Phase 0: Baseline and Safety - Risk Level: Low

**Phase Goal:** Establish a safe working branch and verified baseline.
**Allowed Changes:** Branch creation and documentation of current state.
**Not Allowed:** Source edits, route changes, dependency changes, deletion, or renaming.
**Main Tasks:** Fetch latest refs, branch from `origin/develop`, confirm repo path, record baseline.
**Validation Required:** `git status --short --branch`; route/script/frontend path notes captured.
**Risks:** Starting from stale `develop` or the wrong sibling worktree.
**Rollback / Pause Condition:** Pause if the repo is dirty, `origin/develop` cannot be fetched, or the active checkout is not `D:\NOCTURNAL\NOCTURAL`.
**Exit Criteria:** Branch ready; current repo state documented; no product behavior changed.
**Approval Required:** Tech Lead approval before Phase 1.
**Confidence Level:** High - documentation-only and branch/baseline work.
**Expected Deliverables:** Restructure branch, clean status confirmation, baseline notes.
**Phase Readiness Score:** Fill the readiness template; do not start below 8/10.
**Rollback Plan:** Stop, record the failed command/state, return to the previous branch if needed, and confirm no tracked files changed.
**Before Starting:** Confirm active repo, fetch origin, confirm working tree is clean.
**During Execution:** Run only branch/baseline commands; do not edit source files.
**After Completion:** Record branch/status, confirm exit criteria, and request Phase 1 approval.

**Phase 0 Checklist:**
- [x] Confirm active repo is `D:\NOCTURNAL\NOCTURAL`.
- [x] Run `git fetch origin`.
- [x] Branch from fresh `origin/develop`.
- [x] Confirm `git status` is clean.
- [x] Record current route mounts, scripts, frontend paths, and discrepancies.
- [x] Confirm validation commands to use in later phases.

**Why:** Prevent work in the wrong checkout or on an unsafe branch.
**What to do:**
- Work only inside `D:\NOCTURNAL\NOCTURAL`.
- **`git fetch` first, then branch from `origin/develop`** (not the possibly-stale local `develop`, which is checked out in another worktree): `git fetch origin && git checkout -b refactor/restructure-phase1-split origin/develop`. If branching from local `develop` instead, first verify it equals `origin/develop`.
- Record current route mounts, package scripts, frontend paths, and known discrepancies.
- Confirm current tests and lint commands before changing structure.

**Exit criteria:** Branch ready; current repo state documented; no product behavior changed.

### Phase 1: Build the Shared Foundation - Risk Level: Medium

**Phase Goal:** Make `@nocturnal/shared` resolvable without moving existing shared files.
**Allowed Changes:** Add `packages/shared/package.json`, `packages/shared/src/index.js`, and implementation notes for the lazy export mechanism.
**Not Allowed:** Physical relocation of shared modules, eager side-effectful imports, auth/payment/schema/package-version behavior changes.
**Main Tasks:** Choose lazy getters or sub-barrels, create shared package metadata, expose curated shared modules, exclude patient-owned modules.
**Validation Required:** `node -e "require('./packages/shared')"` and checks proving one export does not initialize unrelated subsystems.
**Risks:** Import-time side effects from storage/upload/Redis/WebAuthn or accidental circular dependency through patient-owned modules.
**Rollback / Pause Condition:** Pause if importing a single shared member initializes unrelated subsystems, changes runtime behavior, or requires moving source files.
**Exit Criteria:** `@nocturnal/shared` path import resolves; existing monolith still runs; no behavior changed.
**Approval Required:** Tech Lead approval before Phase 2.
**Confidence Level:** Medium - controlled shared-export work with import side-effect risk.
**Expected Deliverables:** `packages/shared/package.json`, lazy export structure, implementation note, passing import validation.
**Phase Readiness Score:** Fill the readiness template; do not start below 8/10.
**Rollback Plan:** Stop, record the failing import/command, revert only Phase 1 files, confirm the monolith still loads, and do not continue until the side effect is understood.
**Before Starting:** Confirm branch/status, choose lazy getters or sub-barrels, and list exact shared exports.
**During Execution:** Touch only shared package files; avoid eager `require()` of side-effectful modules.
**After Completion:** Run import validation, document export mechanism, and request Phase 2 approval.

**Phase 1 Checklist:**
- [x] Confirm branch is correct.
- [x] Record chosen lazy-export mechanism before coding.
- [x] Create `packages/shared/package.json`.
- [x] Create shared export structure.
- [x] Use correct `../../../` re-export depth from `packages/shared/src/index.js`.
- [x] Confirm no eager loading.
- [x] Exclude patient-specific modules.
- [x] Run `node -e "require('./packages/shared')"`.
- [x] Confirm monolith still runs.
- [x] Record implementation notes.

**Why:** Patient-health files cannot safely import `@nocturnal/shared` until that package exists and exports the correct modules.
**What to do:**
- Create a real `packages/shared` package with `package.json` (`"name": "@nocturnal/shared"`) and `src/index.js`.
- Export only genuinely shared pieces (re-pointing to existing root files): logger, response helpers, auth/session helpers, safe Mongo helpers, Redis/cache helpers, shared user/notification/security utilities. Representative existing files: `utils/logger.js`, `utils/responseHelper.js`, `utils/errors.js`, `utils/encryption.js`, `utils/mobileAuth.js`, `utils/authCookies.js`, `utils/safeMongo.js`, `utils/queryUpdateOptions.js`, `utils/requestSecurityMetadata.js`, `utils/monitoring.js`, `utils/number.js`, `utils/pagination.js`, `utils/tenantScope.js`, `utils/pickAllowedFields.js`, `middleware/auth.js`, `middleware/validation.js`, `middleware/queryCache.js`, `middleware/rateLimiter.js`, `middleware/idempotency.js`, `middleware/upload.js`, `config/storage.js`, `models/user.js`, `services/notificationService.js`, `services/refreshSessionService.js`, `services/securityAuditService.js`, `services/passwordSecurityService.js`, `services/compromisedPasswordService.js`.
- **Correct re-export path depth:** `packages/shared/src/index.js` sits **three** levels below repo root, so re-exports reach root files via `../../../` (e.g. `require('../../../utils/logger')`), **not** `../../`.
- **Do not eager-load every module from one `index.js`.** A barrel that immediately `require()`s storage, upload, Redis-backed cache, notification/WebAuthn services, etc. can trigger side effects merely by importing `@nocturnal/shared`. Instead use **lazy named getters or small sub-barrels** (e.g. `@nocturnal/shared/logger`, `@nocturnal/shared/auth`) so importing `logger` does not pull in storage/upload/WebAuthn/Redis. The chosen mechanism (lazy getters vs sub-barrels) is settled at execution time; the requirement is: **no side-effectful eager loading.**
  - **Implementer note (do this before writing code):** at the start of Phase 1, **explicitly record the chosen lazy-export mechanism** (lazy getters *or* sub-barrels) in the implementation notes. Either is acceptable, provided importing one export does not initialise unrelated subsystems.
- **Keep patient-specific items OUT of shared:** patient auth (`patientAuth`), health data access (`healthDataAccess`), booking completion outbox (`models/bookingCompletionOutbox`), refund outbox (`models/refundOutbox`), and booking review aggregation (`utils/bookingReviewAggregate`).

**Exit criteria:** `@nocturnal/shared` imports resolve (`node -e "require('./packages/shared')"`); importing a single member does not eagerly initialise unrelated subsystems; existing monolith still runs; no auth, payment, schema, or package-version behavior changed.

### Phase 2: Enable Monorepo Workspaces - Risk Level: Medium

**Phase Goal:** Officially link `packages/*` and `apps/*` as workspaces.
**Allowed Changes:** Root `package.json`, expected `package-lock.json` workspace linkage, stale workspace documentation.
**Not Allowed:** Dependency version changes, source behavior changes, route changes, or app folder copy work.
**Main Tasks:** Add workspace configuration, run install, review lockfile diff, fix stale `CLAUDE.md` claims.
**Validation Required:** `node -e "require('@nocturnal/shared')"`, `npm test`, lockfile diff review.
**Risks:** Accidental package-version bumps or lockfile churn beyond workspace registration.
**Rollback / Pause Condition:** Pause if `package-lock.json` changes dependency versions or install changes runtime packages unexpectedly.
**Exit Criteria:** Workspace package resolves by name; tests still pass; behavior unchanged.
**Approval Required:** Tech Lead approval before Phase 3.
**Confidence Level:** Medium - metadata-only intent, but lockfile/install churn needs review.
**Expected Deliverables:** Updated root `package.json`, workspace-linked `package-lock.json`, corrected `CLAUDE.md`.
**Phase Readiness Score:** Fill the readiness template; do not start below 8/10.
**Rollback Plan:** Stop, record install/test output, revert Phase 2 metadata files, and restore the pre-workspace lockfile if versions drift.
**Before Starting:** Confirm Phase 1 exports pass and working tree contains only approved Phase 1 changes.
**During Execution:** Add workspace metadata only; do not modify dependency versions.
**After Completion:** Review lockfile diff, run package-name import validation, and request Phase 3 approval.

**Phase 2 Checklist:**
- [x] Add root `workspaces`.
- [x] Run install once.
- [x] Confirm no dependency version changes in `package.json`.
- [x] Review `package-lock.json` for workspace linkage only.
- [x] Fix stale `CLAUDE.md` workspace/service text.
- [x] Add focused Jest regression test for `@nocturnal/shared` no-eager-load invariant.
- [x] Run `node -e "require('@nocturnal/shared')"`.
- [x] Run `npm test`.

**Why:** The repo needs official workspace wiring before apps can live under `apps/*`.
**What to do:**
- Add root `"workspaces": ["packages/*", "apps/*"]`.
- Fix stale documentation that claims nonexistent workspaces or services already exist (`CLAUDE.md`).
- Do not change dependency **versions**. Note that `npm install` will likely **rewrite `package-lock.json`** to register the workspaces — this lockfile change is **expected and allowed**, as long as no dependency version in `package.json` changes. Review the lockfile diff to confirm it only adds workspace linkage.

**Exit criteria:** Install/test commands still work; `package-lock.json` diff contains only workspace wiring (no version bumps); workspace structure recognized (`node -e "require('@nocturnal/shared')"` resolves by name); existing behavior unchanged.

### Phase 3: Create `apps/patient-health` - Risk Level: Medium-High

**Phase Goal:** Create a self-contained patient-health app copy while keeping the monolith working.
**Allowed Changes:** Temporary mirrored copies under `apps/patient-health`, import-path adjustments to real shared exports, dev/validation-only app wiring.
**Not Allowed:** Business-logic edits, production deployment switch, schema/auth/payment behavior changes, moving/deleting originals.
**Main Tasks:** Copy confirmed patient files, copy patient-owned support files, rewrite shared imports only, add isolated boot/import validation entrypoint.
**Validation Required:** No missing local imports; patient auth, health intake, dashboard, booking, and B2C payment paths remain testable.
**Risks:** Missing support files, accidental logic drift between copies, or entrypoint diverging from existing middleware/security posture.
**Rollback / Pause Condition:** Pause if a copied file needs business logic changes, a required file is missing, or isolated boot changes auth/security behavior.
**Exit Criteria:** Patient-health code resolves locally; root monolith still works during transition.
**Approval Required:** Tech Lead approval before Phase 4.
**Confidence Level:** Medium - copy-first, but import rewiring and entrypoint validation require care.
**Expected Deliverables:** `apps/patient-health` mirrored copy, adjusted shared imports, dev/validation entrypoint, no missing imports.
**Phase Readiness Score:** Fill the readiness template; do not start below 8/10.
**Rollback Plan:** Stop, record missing import or behavior change, revert only `apps/patient-health` and related wiring files from this phase, confirm root monolith still works.
**Before Starting:** Confirm shared package resolves, file list exists, and no approval gate is pending.
**During Execution:** Copy exact files, change only shared import paths and app-local wiring, stop on unexpected dependency.
**After Completion:** Run node checks/import validation, record changed files, and request Phase 4 approval.

**Phase 3 Checklist:**
- [x] Create `apps/patient-health` folders.
- [x] Copy confirmed routes/controllers/services/models/validators/constants.
- [x] Copy patient frontend HTML and JS from `client/public`.
- [x] Copy patient-owned support files from dependency trace.
- [x] Rewrite only shared imports to `@nocturnal/shared`.
- [x] Keep intra-app imports relative.
- [x] Add dev/validation-only entrypoint/router.
- [x] Run `node --check` on changed JS files.
- [x] Confirm no `Cannot find module` errors.
- [x] Verify patient login, health intake, dashboard, booking, and B2C payment paths remain testable.
- [x] Resolve PR #142 CodeQL findings without broadening Phase 3 scope.
- [x] Merge PR #142 into `develop` and fast-forward local `develop` to `cefba40`.

**Why:** Patient-health is the Phase 1 product and should become independently understandable without duty-shift clutter.
**What to do:**
- Copy patient-health routes, controllers, services, models, validators, constants, and frontend files into `apps/patient-health` as **temporary mirrored copies**. The **only** permitted divergence from the originals is (a) import-path adjustment for shared modules and (b) app-local wiring (the entrypoint/router). **No business-logic edits** to copied files during the split.
- Source frontend from `client/public/roles/patient/*.html` and `client/public/js/patient-*.js`.
- Copy patient-specific support files surfaced by the dependency trace, including the now patient-owned `patientAuth`, `healthDataAccess`, `bookingCompletionOutbox`, `refundOutbox`, `bookingReviewAggregate`, and `authValidator` (required by the health validators).
- Rewrite **only** imports that point to real shared exports → `require('@nocturnal/shared')`; intra-app relative imports stay unchanged.
- **Patient-health entrypoint (`apps/patient-health/server.js` + router):** for Phase 1 this is **dev/validation-only — for isolated boot/import validation first, not a production deployment target** unless that becomes an explicit later decision. It must **reuse the existing app's middleware/security stack and patterns** (mirroring `app.js` ordering, not reinventing it) and **connect through the existing DB config** (`config/database.js`) — **no schema changes, no auth-behavior changes, no new security posture.**
- **Mobile/WebAuthn ownership decision (verified):** `routes/mobileDevices.js` and `routes/webAuthn.js` both `require('{ protectBoth }')` from `middleware/patientAuth`. `protectBoth` authenticates **both** user types, so it is shared auth infrastructure, not patient-only. **Decision for Phase 1: these two routes remain root-owned/shared-auth edge cases in the monolith** and keep using the **root copy** of `patientAuth` (which still exists, since Phase 3 copies rather than moves). They are **not moved into patient-health unless separately approved**; final classification is deferred to a later phase.

**Confirmed file set (all exist):** routes `patient, patientAnalytics, patientDashboard, healthData, healthAnalytics, healthIntake, doctorAccess, booking, payment`; controllers `patient, patientAnalytics, patientDashboard, healthData, healthAnalytics, healthIntake, doctorAccess, booking, payment`; services `patient, patientDashboard, healthRecord, healthMetric, healthIntake, healthTracker, investigationReport, emergencySummary, geminiAnalysis, doctorAccess, booking, payment`; models `patient, healthRecord, healthMetric, healthTarget, healthAccessToken, healthDataAccessLog, doctorNote, investigationReport, emergencySummary, nurseBooking, serviceCatalog, payment`; constants folder (`index, healthConstants, enums, errors, roles, statuses`); validators `healthDataValidator, healthIntakeValidator, authValidator`.

**Exit criteria:** No missing local imports; patient login, health intake, dashboard, booking, and B2C payment paths remain testable; root monolith still works during transition.

### Phase 4: Park `apps/duty-shift` - Risk Level: Low-Medium

**Phase Goal:** Preserve duty-shift as Phase 2 parked code without changing live behavior.
**Allowed Changes:** Temporary mirrored copies under `apps/duty-shift` and labels/docs marking it parked.
**Not Allowed:** Route unmounting, behavior changes, deletion, renaming, or duty-shift rewrites.
**Main Tasks:** Copy confirmed duty-shift backend and frontend groups; keep originals in place.
**Validation Required:** Duty-shift files exist under `apps/duty-shift`; original root files remain; patient app still runs.
**Risks:** Accidentally treating copy work as cutover work or editing duty-shift behavior.
**Rollback / Pause Condition:** Pause if a copy requires behavior edits, source files are missing, or anyone proposes deleting originals.
**Exit Criteria:** Duty-shift preserved and recoverable; no duty-shift behavior rewritten; no files deleted.
**Approval Required:** Tech Lead approval before any route-separation discussion.
**Confidence Level:** High - copy-only preservation phase.
**Expected Deliverables:** `apps/duty-shift` mirrored copy and clear parked-code labeling.
**Phase Readiness Score:** Fill the readiness template; do not start below 8/10.
**Rollback Plan:** Stop, record the copy issue, revert only `apps/duty-shift` files from this phase, and confirm originals remain untouched.
**Before Starting:** Confirm Phase 3 is approved and source duty-shift files exist.
**During Execution:** Copy only; do not unmount routes, edit logic, or delete originals.
**After Completion:** Confirm copies and originals exist, document changed files, and request route-separation discussion only if needed.

**Phase 4 Checklist:**
- [x] Create `apps/duty-shift` folders.
- [x] Copy duty-shift models.
- [x] Copy duty-shift routes.
- [x] Copy duty-shift controllers/services.
- [x] Copy admin/doctor/provider frontend folders.
- [x] Confirm originals still exist.
- [x] Confirm no route unmounting happened.
- [x] Confirm patient app still runs.
- [x] Add parked-code README and CodeQL mirror exclusion rationale.
- [x] Add mirror-integrity guard for parked copies.
- [x] Merge Phase 4 and follow-ups into `develop` through PR #146 (`17ca90f`).

**Why:** Duty-shift must be preserved, not deleted, while Phase 1 focuses on patient-health.
**What to do:**
- Copy duty, application, hospital, shift, earnings, review, and admin/doctor/provider code into `apps/duty-shift` (models `duty, application, shiftSeries, availability, certification, achievement, earning, hospital, hospitalSettings, hospitalWaitlist, review`; controllers/services `duty, application, dutyService, applicationService, analyticsService`; routes `duties, applications, earnings, certifications, achievements, shiftSeries, reviews, hospitalSettings, hospitalWaitlist, payments`; frontend `client/public/roles/{admin,doctor,provider}`).
- Keep original files in place until cutover is proven.
- Clearly label duty-shift as Phase 2 parked code.

**Exit criteria:** Duty-shift code preserved and recoverable; no duty-shift behavior rewritten; no duty-shift files deleted.

### Phase 5: Patient-Health Split Continuation — Duty-Shift Live - Risk Level: Medium-High

**Phase Goal:** Continue separating patient-health from the monolith by hardening validation, tests, and import ownership while keeping all existing duty-shift route behavior live.
**Allowed Changes:** Patient-health validation scripts, focused tests, documentation, app-local import ownership cleanup, and read-only/audit-style checks that do not change runtime route behavior.
**Not Allowed:** Unmounting, disabling, redirecting, parking, deleting, or changing duty-shift routes; changing payment/auth/schema behavior; disabling failing tests to force progress.
**Main Tasks:** Record the selected Phase 5-A scope, add/adjust patient-health validation coverage, audit and clean patient-health import ownership where safe, preserve payment route distinction, prove duty-shift routes remain mounted, and rerun contract checks.
**Validation Required:** Route/frontend-contract tests, deploy-gate checks, patient-health routes, duty-shift route availability checks, payment route gating.
**Risks:** Accidentally changing shared route behavior, payment/auth behavior, or duty-shift contracts while isolating patient-health.
**Rollback / Pause Condition:** Pause if any duty-shift route behavior changes, contract tests fail unexpectedly, payment/auth behavior changes, or patient-health isolation requires broader route cutover than this phase allows.
**Exit Criteria:** Duty-shift routes remain live; patient-health split work is advanced within the approved scope; contract/deploy-gate tests green; no payment/auth/schema behavior changed.
**Approval Required:** Tech Lead / Owner approval before implementation; Product Owner duty-shift-live direction already recorded.
**Confidence Level:** Medium - patient-health-only continuation avoids duty-shift dormancy blast radius but still touches app/route boundaries.
**Expected Deliverables:** Recorded duty-shift-live decision, approved Phase 5-A scope, patient-health validation/test/import-ownership improvements, passing route/frontend/deploy-gate validation.
**Phase Readiness Score:** Fill the readiness template; do not start below 8/10.
**Rollback Plan:** Stop, record the failing endpoint/test, revert only Phase 5 patient-health changes, confirm previous route behavior returns, and do not continue without root cause.
**Before Starting:** Confirm fresh `origin/develop`, clean worktree, approved Phase 5-A implementation start, and duty-shift-live route preservation list.
**During Execution:** Change only approved patient-health validation/test/import-ownership files; do not change duty-shift route mounts, auth/payment logic, schemas, package versions, production router wiring, or staging runtime behavior.
**After Completion:** Run contract/deploy-gate checks, document route behavior, and request final cleanup approval only if validation stays green.

**Phase 5 Checklist — Complete (PR #177, merge `ab2046a`):**
- [x] Record explicit Product Owner decision that duty-shift routes stay live.
- [x] Approve exact patient-health-only implementation scope: validation scripts, test coverage, import ownership cleanup.
- [x] Confirm no duty-shift route mounts will change. *(2026-07-14: no route files touched; mounts guarded by `scripts/validate-patient-health-split.js` + `tests/unit/infrastructure/phase5a-route-availability.test.js`)*
- [x] Confirm duty-shift frontend/API contracts remain expected to pass. *(2026-07-14: fast suite 1096 passed / 0 failed)*
- [x] Preserve `/api/v1/payments`. *(untouched; unconditional mount now asserted by route-availability tests)*
- [x] Preserve feature-flagged `/api/v1/payments-b2c`. *(untouched; both enabled and disabled gate sides now tested)*
- [x] Preserve all existing duty-shift route mounts. *(all 10 preserved mounts sentinel-tested against their owning route modules)*
- [x] Implement only approved Phase 5-A validation/test/import-ownership changes. *(diff = docs, validation script, npm alias, one test file; import audit came back clean — no code cleanup needed)*
- [x] Run route/frontend-contract tests. *(2026-07-14: deploy-gate jest list 15 suites / 58 tests passed; one non-reproducible flake in the first run — `securitynotificationoutboxes.find()` buffering timeout in the WebAuthn outbox worker — passed in isolation and on full rerun)*
- [x] Run deploy-gate-relevant tests. *(2026-07-14: `build:prod`, `scan:inline-styles:strict`, contract jest list, and `test:e2e:csp` (6 passed) all green)*
- [x] Fix contracts or pause; do not disable tests. *(no contract failures; no tests disabled)*
- [x] Merge the completed Phase 5-A scope to `develop`. *(PR #177 merged 2026-07-14 at `ab2046a`; final CI and security gates green)*

**Why:** The Product Owner decision is that duty-shift must remain live. Phase 5 therefore continues the patient-health split without any duty-shift dormancy, route unmounting, or deletion.
**Gate:** Do **not** begin implementation until Phase 5-A implementation-start approval is recorded. The duty-shift-live decision and Phase 5-A scope are already recorded; they are constraints, not permission to touch duty-shift behavior.
**What to do:**
- Keep patient-health routes active and continue isolating patient-health through validation, tests, and import ownership only.
- Keep all duty-shift routes mounted through existing router wiring (`routes/v1/index.js` / `app.js`).
- Preserve the current payment distinction: `/api/v1/payments` and feature-flagged `/api/v1/payments-b2c`.
- Do not implement router isolation or staging runtime preparation in Phase 5-A; those require separate approval.
- Re-run the route/frontend-contract and deploy-gate tests; if any contract test fails, fix the contract or pause — do not disable the test.

**Exit criteria — satisfied 2026-07-14 via PR #177 (`ab2046a`):** Duty-shift-live decision recorded; Phase 5-A validation/test/import-ownership work completed only within approved scope; duty-shift routes remain live; contract/deploy-gate tests green; no payment/auth/schema logic changed.

### Phase 6: Cleanup and Final Cutover - Risk Level: Medium

**Phase Goal:** Clean root duplicates only after the new structure is proven.
**Allowed Changes:** Approved deletion of reviewed obsolete files, docs updates, final PR cleanup.
**Not Allowed:** Unapproved deletion, broad refactors, deleting duty-shift work, or cleanup before validation.
**Main Tasks:** List obsolete scripts/duplicates, get explicit approval, remove approved items only, update README/docs.
**Validation Required:** `npm test`, `npm run lint:baseline`, focused checks for affected areas, clean PR diff review.
**Risks:** Deleting locally useful operational scripts or removing files still referenced by tests/deploy tooling.
**Rollback / Pause Condition:** Pause if a file's ownership/use is unclear, a deletion is not approved, or validation fails.
**Exit Criteria:** Tests pass; documentation matches reality; old duplicates removed only with approval.
**Approval Required:** Tech Lead / Owner approval for every deletion batch.
**Confidence Level:** Medium - cleanup is safe only after ownership and deletion approval are clear.
**Expected Deliverables:** Reviewed duplicate list, approved deletion batch, docs updates, clean validation.
**Phase Readiness Score:** Fill the readiness template; do not start below 8/10.
**Rollback Plan:** Stop, record the failing check, restore only the approved-deletion files from git or backup, and confirm validation returns to the prior state.
**Before Starting:** Confirm the revised Phase 5 patient-health-only split is approved/complete and each deletion candidate has owner approval.
**During Execution:** Delete only approved files; keep cleanup separate from feature/refactor work.
**After Completion:** Run validation, review final diff, and prepare PR/merge handoff.

**Phase 6 Checklist:**
- [ ] List obsolete root duplicates and one-off scripts.
- [ ] Review each candidate with owner/usage notes.
- [ ] Get explicit approval for deletion batch.
- [ ] Delete only approved files.
- [ ] Update README/docs.
- [ ] Run `npm test`.
- [ ] Run `npm run lint:baseline`.
- [ ] Confirm final diff contains only approved cleanup.

**Why:** Cleanup is safest only after the new structure is proven.
**What to do:**
- List obsolete root duplicates and one-off scripts for review (`fix-mongodb-auth.bat`, `enable-mongodb-auth*.ps1`, `verify-and-fix-auth.js`, `fix-auth-with-localhost-exception.js`, `recreate-dev-prod-users.js`, etc.).
- Delete only after explicit approval.
- Update README and docs to state: Phase 1 = patient-health active; duty-shift remains live in the monolith with a parked mirror under `apps/duty-shift`; shared code belongs in `packages/shared`.

**Exit criteria:** Tests pass; documentation matches reality; old duplicates removed only with approval.

## Interfaces and Structural Changes
- Add `@nocturnal/shared` as the shared internal package.
- Add root workspace support for `packages/*` and `apps/*`.
- Add app folders `apps/patient-health` and `apps/duty-shift` as **temporary mirrored copies** (import-path + wiring changes only; no logic edits).
- Add app-level entrypoints only after shared imports are stable; the patient-health entrypoint is dev/staging-oriented for Phase 1 and reuses existing middleware/security + DB config.
- Expected lockfile change: `package-lock.json` updates when workspaces are enabled (linkage only).
- Do not change database schemas, payment contracts, auth behavior, or package **versions** during this restructure.

## Validation Plan
- After each phase: check changed JS files with `node --check`; confirm no missing imports; run focused tests relevant to touched areas.
- Before route separation: patient auth tests, health intake tests, booking tests, payment route gating tests, frontend route contract tests.
- Before final merge: `npm test`, `npm run lint:baseline`, relevant deploy-gate/frontend contract tests. Open a PR into `develop` (direct pushes are hook-blocked).

## Assumptions
- Work is done in small PRs, not one large restructure PR.
- Early phases copy files instead of moving/deleting them.
- Duty-shift remains preserved for Phase 2.
- Any obsolete file is reported first and deleted only after explicit approval.
- `services/patient-booking-service` is excluded because it is not present in the current checkout.

## Working rule for every future session
> "Edit or move only the exact files named in the current phase. Do **not** create `enhanced`/`v2`/`fixed`/`backup`/duplicate files. Do **not** delete duty-shift code. If shared code is needed, route it through `packages/shared`. If a file seems obsolete or missing, **stop and report** — do not invent or delete it."
