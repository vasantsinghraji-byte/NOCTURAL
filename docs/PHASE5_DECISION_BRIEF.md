# Phase 5 Decision Brief — Duty-Shift Dormancy (Product Owner Approval Packet)

> **Decision requested from the Product Owner:** May duty-shift go dormant — i.e., may its API routes be unmounted from the live monolith?
> Until this is approved and recorded in the blueprint's Approval Record, **no route separation work may start.**
> Prepared 2026-07-03 against develop `e5476b3` (Phases 0–4 merged). Companion to `PHASE1_SPLIT_RECONCILED.md` (Phase 5).

## What "dormant" means here

Route unmounting only. The code is already preserved twice (live at repo root, parked mirror in `apps/duty-shift`). Nothing is deleted; no schema, auth, or payment logic changes. Dormancy is reversible by a single revert.

## Exact routes that would be disabled

All mounted in `routes/v1/index.js`; unmounting is an explicit wiring change there (and, optionally, the now-inert rate-limiter mounts in `app.js`).

| Mount | Disposition |
|---|---|
| `/api/v1/duties` | Disable |
| `/api/v1/applications` | Disable |
| `/api/v1/calendar` | Disable |
| `/api/v1/earnings` | Disable |
| `/api/v1/certifications` | Disable |
| `/api/v1/reviews` | Disable |
| `/api/v1/achievements` | Disable |
| `/api/v1/shift-series` | Disable |
| `/api/v1/hospital-settings` | Disable |
| `/api/v1/hospital-waitlist` | Disable |

**Explicitly preserved (blueprint-mandated):** `/api/v1/payments` (unconditional) and feature-flagged `/api/v1/payments-b2c`; all auth (`/auth`, `/mobile-devices`, `/webauthn`), `/uploads`, `/notifications`, `/security`, `/staging`, admin mounts, and every patient-health route.

**Needs a classification decision before wiring (currently "Shared/TBD" in the Phase 0 baseline):** `/messages`, `/analytics`, `/funnel-events`. Recommend deciding these in the same approval so the wiring change is done once.

## Affected consumers (verified 2026-07-03)

- **Doctor frontend** — 7 pages under `client/public/roles/doctor/` reference duty/application/earnings endpoints. These pages break (404s) once routes unmount unless they are parked/redirected at the same time.
- **Shared frontend modules** — `client/public/api.js`, `js/unified-nav.js`, `js/pagination.js`, `js/config.js`, `js/resource-hints.js` reference duty-shift endpoints; admin/provider pages consume through this shared layer.
- **Mobile app** — the Capacitor app wraps this same PWA, so mobile doctor/provider users are equally affected. App-store releases lag web deploys; dormancy timing must account for released binaries still calling these endpoints.
- **Patient product — zero references** to duty endpoints (verified by grep across `client/public/roles/patient/` and `js/patient-*.js`). Patient-health is unaffected.
- **External/API consumers** — none known, but not provable from the repo. If any hospital partner scripts call these endpoints directly, dormancy breaks them silently. PO should confirm from the product side.

## Rollback plan

1. Dormancy is delivered as **one wiring commit** touching only `routes/v1/index.js` (and optionally `app.js` limiter mounts).
2. Rollback = `git revert <that commit>` — no data, schema, or dependency changes to unwind.
3. Route/frontend-contract tests re-run after revert must return to the pre-dormancy baseline.
4. Pause condition (blueprint): if any contract test fails unexpectedly or payment/auth behavior changes, stop — do not disable tests.

## Required test list (gate: all green or explicitly waived by the PO)

- `npm run test:deploy-gate` — includes `frontend-admin-doctor-api-contract`, `frontend-provider-admin-booking-contract`, `admin-route-contract`, `frontend-canonical-nav-contract`, production smoke tests. **Expect failures here to be the real signal** — these encode the admin/doctor frontend contracts that dormancy deliberately changes; each failure needs a contract fix or a conscious PO-approved contract change, never a disabled test.
- `npm test` (fast suite) and `npm run lint:baseline`.
- Payment route gating tests — `/payments` and `/payments-b2c` behavior must be byte-for-byte unchanged.
- Patient flows (login, intake, dashboard, booking, B2C payment) — must be unaffected.
- Manual smoke of doctor/admin/provider pages to catalogue the expected breakage against the intended UX (redirect? banner? parked pages?).

## Open questions for the Product Owner

1. Are duty-shift routes safe to park now, or after a sunset notice to doctors/hospitals?
2. What should released mobile binaries and open doctor sessions see — 404, a "product paused" response, or a redirect?
3. Classification of `/messages`, `/analytics`, `/funnel-events` (park with duty-shift / keep as shared)?
4. Any external consumers (partner scripts, integrations) the repo can't see?

## Recommendation

Defer wiring until questions 1–3 are answered in writing. The technical work is small and fully reversible; the product blast radius (doctor/admin/provider UX and released mobile builds) is the real decision.
