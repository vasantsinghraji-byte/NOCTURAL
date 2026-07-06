# apps/duty-shift — PARKED (Phase 2 product)

> **Status: PARKED. Do not build on, edit, or delete this code.**
> Preserved 2026-07-03 during restructure Phase 4 per `docs/PHASE1_SPLIT_RECONCILED.md`.

This folder is a **copy-only preservation snapshot** of the duty-shift staffing
product (duties, applications, shifts, earnings, certifications, achievements,
reviews, hospitals/waitlist, and the admin/doctor/provider frontends).

Facts that matter:

- **The live duty-shift code still runs from the repo root.** The original
  routes remain mounted in `routes/v1/index.js`; these copies are not wired
  into anything and are not loadable standalone (imports were intentionally
  NOT rewritten — Phase 4 is copy-only, no divergence from originals beyond
  this README).
- The originals at the repo root are the source of truth until a separately
  approved cutover (Phase 5 route separation has its own Product Owner gate;
  see the blueprint's Approval Record).
- Nothing here may be deleted, renamed, or "cleaned up" without the explicit
  approvals defined in the blueprint (Phase 6).
- **CodeQL intentionally ignores this folder** (`.github/codeql/codeql-config.yml`):
  findings inherited from the originals cannot be fixed here without breaking
  the hash-identical mirror guarantee. The root originals remain fully scanned,
  and security fixes land at the root (Decision Log, 2026-07-03).

Mirror refreshes (copy-only, root → mirror): `routes/payments.js` and
`services/applicationService.js` re-copied 2026-07-03 to carry the PR #144
NoSQL-injection fixes; byte-identity with root restored and enforced by
`tests/unit/infrastructure/app-mirror-integrity.test.js`.

Contents (mirrored from root at copy time):

| Group | Files |
|---|---|
| `models/` | duty, application, shiftSeries, availability, certification, achievement, earning, hospital, hospitalSettings, hospitalWaitlist, review |
| `controllers/` | dutyController, applicationController |
| `services/` | dutyService, applicationService, analyticsService |
| `routes/` | duties, applications, earnings, certifications, achievements, shiftSeries, reviews, hospitalSettings, hospitalWaitlist, payments |
| `client/public/roles/` | admin, doctor, provider frontends |
