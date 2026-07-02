# Phase 0 Baseline — NOCTURNAL Restructure

> Companion to `PHASE1_SPLIT_RECONCILED.md`. Records the verified repo state at Phase 0 completion.
> No source files were changed in this phase.

## Branch and Repo State

| Field | Value |
|---|---|
| Date | 2026-07-02 |
| Active repo | `D:\NOCTURNAL\NOCTURAL` (confirmed via `git rev-parse --show-toplevel`) |
| Remote | `origin = https://github.com/vasantsinghraji-byte/NOCTURAL.git` |
| Base ref | `origin/develop` @ `df5ec6c` (merge of PR #138, the split blueprint) — fetched fresh before branching |
| Working branch | `restructure/phase1-split` (created from `origin/develop`) |
| Working tree | Clean at branch creation (`git status --short --branch`) |
| Prior branch note | `safety-hardening-unsplit-synced-20260628` was fully merged into develop except one docs-only commit, which was cherry-picked onto this branch (`bb914d0`) |

## Verified Facts (blueprint reconciliation confirmed)

1. `packages/shared/` contains only `src/utils/localFileSystem.js` — no `package.json`, no `index.js`. Must be built in Phase 1.
2. Root `package.json` has **no** `workspaces` field.
3. `services/` is a flat folder of ~38 service modules of the monolith — **not** workspace microservices. `services/patient-booking-service` does **not** exist.
4. `apps/` does not exist.
5. Frontend lives at `client/public/roles/{admin,doctor,patient,provider}/` plus `client/public/js/` (11 `patient-*.js` files).
6. Payment routes are already split (see route mounts below).

## Known Discrepancies

- **`CLAUDE.md` is stale**: it claims npm workspaces (`packages/*`, `services/*`) and a `services/patient-booking-service` workspace with its own package.json/Dockerfile/Jest config. Neither exists in this checkout. Scheduled for correction in Phase 2 (per blueprint).
- Folder name `NOCTURAL` is an intentional typo — do not rename.

## Route Mounts (baseline)

`app.js:330` mounts `routes/v1/index.js` at `/api/v1`. Unversioned `/api/*` redirects via `middleware/apiVersion.js`.

Mounts in `routes/v1/index.js` (line numbers at baseline):

| Mount | Line | Product classification (per blueprint) |
|---|---|---|
| `/auth` | 60 | Shared |
| `/duties` | 61 | Duty-shift |
| `/applications` | 62 | Duty-shift |
| `/calendar` | 63 | Duty-shift |
| `/earnings` | 64 | Duty-shift |
| `/certifications` | 65 | Duty-shift |
| `/reviews` | 66 | Duty-shift |
| `/achievements` | 67 | Duty-shift |
| `/messages` | 68 | Shared/TBD |
| `/analytics` | 69 | Shared/TBD |
| `/admin/metrics` | 72 | Admin |
| `/admin/funnel` | 73 | Admin |
| `/admin/security-audit` | 74 | Admin |
| `/shift-series` | 75 | Duty-shift |
| `/hospital-settings` | 76 | Duty-shift |
| `/uploads` | 77 | Shared |
| `/notifications` | 78 | Shared |
| `/payments` | 79 | Duty-shift/existing (`routes/payments.js`, unconditional) |
| `/security` | 82 | Shared |
| `/patients` | 85 | Patient-health |
| `/bookings` | 86 | Patient-health |
| `/funnel-events` | 87 | Shared/TBD |
| `/hospital-waitlist` | 88 | Duty-shift |
| `/mobile-devices` | 89 | **Root-owned Phase 1** (uses `protectBoth`) |
| `/webauthn` | 90 | **Root-owned Phase 1** (uses `protectBoth`) |
| `/staging` | 91 | Ops/staging smoke |
| `/payments-b2c` | 102 | Patient-health — **feature-flagged** (mounted only when Razorpay env vars set and `RAZORPAY_ENABLED !== 'false'`) |
| `/patient-dashboard` | 108 | Patient-health |
| `/health-records` | 109 | Patient-health |
| `/health-analytics` | 110 | Patient-health |
| `/health-intake` | 111 | Patient-health |
| `/doctor-access` | 112 | Patient-health |
| `/patient-analytics` | 113 | Patient-health |

Rate limiters are applied per-path in `app.js` (lines ~140–167) ahead of the v1 router; any future route relocation must preserve those path prefixes.

## Key Scripts (baseline)

| Purpose | Script |
|---|---|
| Dev server | `npm run dev` (nodemon `server.js`, :5000) |
| Frontend dev | `npm run frontend` / `npm run dev:all` |
| Fast tests (default) | `npm test` (jest.fast.config.js) |
| Full tests | `npm run test:all` |
| Lint | `npm run lint`; warning baseline: `npm run lint:baseline` |
| Pre-PR check | `npm run verify:local` (lint + fast tests) |
| Deploy gate | `npm run test:deploy-gate` (frontend build + contract/smoke list) |

`prepare` installs git hooks from `.githooks/` (blocks direct pushes to `main`/`develop`, enforces Conventional Commits, secret scan). PRs go into `develop`.

## Validation Commands Confirmed for Later Phases

All referenced scripts verified to exist in `package.json`:

```powershell
node --check <changed-file>
node -e "require('./packages/shared')"     # Phase 1
node -e "require('@nocturnal/shared')"     # Phase 2+
npm test
npm run lint:baseline
npm run test:deploy-gate                   # Phase 5
```

## Phase 0 Exit Criteria

- [x] Active repo confirmed: `D:\NOCTURNAL\NOCTURAL`
- [x] `git fetch origin` run; branched from fresh `origin/develop`
- [x] `git status` clean on new branch
- [x] Route mounts, scripts, frontend paths, and discrepancies recorded (this file)
- [x] Validation commands for later phases confirmed
- [x] No product behavior changed (docs-only phase)
