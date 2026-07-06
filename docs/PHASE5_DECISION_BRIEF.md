# Phase 5 Decision Brief — Patient-Health Split Continuation (Duty-Shift Live)

> **Product Owner decision recorded 2026-07-05:** Duty-shift must **not** go dormant. All existing duty-shift routes stay live while Phase 5 continues the patient-health split.
> This supersedes the earlier dormancy/unmounting brief. Phase 5 implementation may not unmount, disable, redirect, pause, or delete duty-shift behavior.
> Prepared against develop `7d41487` (Phases 0-4 and follow-up PRs #145-#150 merged). Companion to `PHASE1_SPLIT_RECONCILED.md` (Phase 5).

## Decision

Duty-shift remains live in the monolith. The `apps/duty-shift` copy remains a parked mirror for ownership clarity and drift protection, not a replacement for the live root route mounts.

Phase 5 therefore becomes **patient-health-only split continuation**. The approved first slice is **Phase 5-A: validation scripts, test coverage, and import ownership cleanup**. It advances patient-health separation without runtime router isolation or staging runtime changes.

## Explicitly preserved route behavior

These mounts must stay available unless a later, separate Product Owner decision changes the product direction.

| Mount | Phase 5 disposition |
|---|---|
| `/api/v1/duties` | Preserve live |
| `/api/v1/applications` | Preserve live |
| `/api/v1/calendar` | Preserve live |
| `/api/v1/earnings` | Preserve live |
| `/api/v1/certifications` | Preserve live |
| `/api/v1/reviews` | Preserve live |
| `/api/v1/achievements` | Preserve live |
| `/api/v1/shift-series` | Preserve live |
| `/api/v1/hospital-settings` | Preserve live |
| `/api/v1/hospital-waitlist` | Preserve live |

**Also preserved:** `/api/v1/payments` (unconditional), feature-flagged `/api/v1/payments-b2c`, all auth routes (`/auth`, `/mobile-devices`, `/webauthn`), `/uploads`, `/notifications`, `/security`, `/staging`, admin mounts, and every patient-health route.

**Shared/TBD mounts remain untouched in Phase 5:** `/messages`, `/analytics`, `/funnel-events`. They are not part of patient-health-only split continuation unless separately approved.

## Allowed Phase 5 work

- Improve patient-health app isolation and validation wiring.
- Keep patient-health imports pointed at approved app-local or `@nocturnal/shared` ownership.
- Add or update tests that prove patient-health behavior remains available.
- Add or update tests that prove duty-shift routes remain mounted.
- Update docs to match the live-duties decision.

## Approved Phase 5-A scope

Phase 5-A is limited to:

1. **Validation scripts** — repeatable checks for patient-health imports, route availability expectations, and no missing modules.
2. **Test coverage** — focused tests that prove patient-health behavior remains reachable and duty-shift routes remain mounted.
3. **Import ownership cleanup** — patient-health-only import path/ownership corrections where they do not change runtime behavior.

Explicitly out of scope for Phase 5-A:

- Router isolation or production route rewiring.
- Staging-only runtime preparation.
- Duty-shift route, controller, service, model, frontend, or mirror changes except documented mirror-drift corrections.
- Auth, payment, schema, package-version, or deployment configuration changes.

## Not allowed in Phase 5

- No duty-shift route unmounting.
- No duty-shift route redirects or maintenance responses.
- No duty-shift deletion.
- No auth, payment, schema, or package-version changes.
- No disabling route/frontend/deploy tests to force progress.
- No edits to `apps/duty-shift` except through documented mirror-drift rules.

## Affected consumers

Because duty-shift stays live, existing doctor/admin/provider and mobile consumers should continue to see the same route behavior.

- **Doctor frontend** — remains expected to call duty/application/earnings endpoints successfully.
- **Shared frontend modules** — continue to expose existing duty-shift endpoint helpers.
- **Mobile app** — released binaries continue using the current PWA/backend behavior.
- **Patient product** — continues to split independently; patient flows must remain unaffected.
- **External/API consumers** — stay compatible because route contracts remain live.

## Rollback plan

1. Phase 5-A changes must be patient-health-only and delivered in reviewable commits.
2. Rollback = revert the Phase 5-A patient-health commits.
3. After rollback, patient-health, duty-shift, payment, and auth route behavior must return to the pre-Phase 5-A baseline.
4. Pause condition: if any duty-shift route behavior changes, payment/auth behavior changes, or contract tests fail unexpectedly, stop and do not broaden the phase.

## Required test list

- `npm run test:deploy-gate` — route/frontend/deploy contracts must stay green.
- `npm test` and `npm run lint:baseline`.
- Payment route gating tests — `/payments` and `/payments-b2c` behavior must remain unchanged.
- Patient flows — login, intake, dashboard, booking, and B2C payment must remain testable.
- Duty-shift route availability checks for the preserved mounts above.

## Scope decision before implementation

1. Phase 5-A starts with validation scripts, test coverage, and import ownership cleanup.
2. The patient-health app remains dev/validation-only in Phase 5-A.
3. Staging-only runtime preparation is deferred.
4. Router isolation is deferred.
5. Mandatory checks before merging Phase 5-A: `npm run test:deploy-gate`, `npm test`, `npm run lint:baseline`, payment route gating tests, patient flow checks, and duty-shift route availability checks.

## Recommendation

Start Phase 5-A only after implementation-start approval is recorded. Keep duty-shift live as a hard constraint throughout the phase.
