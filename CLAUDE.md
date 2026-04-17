# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout Note

The actual project lives at `D:\NOCTURNAL\NOCTURAL\` — the parent `D:\NOCTURNAL\` is a workspace folder containing pitch docs and the code subfolder. The folder name `NOCTURAL` is a known typo retained for stability; do not rename it. All paths and commands below are relative to `NOCTURAL/`.

Project documentation lives at `NOCTURAL/docs/` (notably `ARCHITECTURE.md`, `GETTING_STARTED.md`, `BUG_TRACKER_AND_FIX_BLUEPRINT.md`, and `PHASE*_DEFINITION_OF_DONE.md`).

## Security Policy

When you find a security vulnerability, flag it immediately with a WARNING comment and suggest a secure alternative. Never implement insecure patterns even if asked.

## Common Commands

```bash
# Dev
npm run dev                  # nodemon server.js (backend on :5000)
npm run frontend             # client dev server
npm run dev:all              # backend + frontend concurrently

# Tests — IMPORTANT: `npm test` uses jest.fast.config.js (skips models/smoke/patient-booking-service)
npm test                     # fast suite (default for local iteration)
npm run test:all             # full jest.config.js suite
npm run test:unit            # tests/unit only
npm run test:integration     # tests/integration only
npm run test:smoke           # tests/smoke (requires built frontend)
npm test -- path/to/file.test.js   # run a single test file
npm test -- -t "test name"         # run by test name pattern

# Deploy gate
npm run test:deploy-gate     # builds frontend, then runs the explicit frontend-contract + smoke test list in package.json

# Lint
npm run lint
npm run lint:fix
npm run verify:local         # lint + fast tests (pre-PR check per CONTRIBUTING.md)

# DB / Ops
npm run db:indexes           # create MongoDB indexes (also aliased as db:migrate)
npm run pm2:start:prod       # PM2 cluster mode
```

Git hooks live in `.githooks/` and are auto-installed by `npm install` via the `prepare` script. They block direct pushes to `main`/`develop`, enforce Conventional Commit messages, and run secret scans.

## Architecture

### Entry Points
- `server.js` — process lifecycle only: env validation, DB connect, signal handlers, PM2 ready signal, graceful shutdown. Exports `{ app, startServer, stopServer }` so tests can import `app` without booting a listener.
- `app.js` — Express app assembly. **Middleware order is load-bearing** — see the section dividers in `app.js`. Anything bypassing the rate-limit / security / sanitization stack must be justified.
- Several security middlewares (`ddosProtection`, `fingerprintRequest`, `detectSuspiciousRequests`, `globalRateLimiter`, request tracking) are skipped when `NODE_ENV === 'test'`. Tests run with these disabled.

### API Versioning
All API routes are mounted under `/api/v1` via `routes/v1/index.js`, which composes the per-domain routers in `routes/`. Unversioned `/api/*` requests are redirected to the latest version by `middleware/apiVersion.js`. When adding endpoints, add the per-domain router under `routes/` and wire it into `routes/v1/index.js` — do not mount routes directly in `app.js`.

### Feature-Flagged Routes
`routes/payments.js` is mounted at `/api/v1/payments` unconditionally. `routes/payment.js` is mounted at `/api/v1/payments-b2c` only when `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are set and `RAZORPAY_ENABLED !== 'false'`. Don't conflate the two files.

### Monorepo / Workspaces
This is an npm workspaces repo (`packages/*`, `services/*`):
- `packages/shared/` — `@nocturnal/shared` library (logger, common utilities) consumed by services.
- `services/patient-booking-service/` — extracted microservice with its own `package.json`, `Dockerfile`, and Jest config. The fast Jest config explicitly ignores `services/patient-booking-service/tests/`; run that service's tests via its workspace (`npm test --workspace=@nocturnal/patient-booking-service`).
- The root `server.js` is still the primary monolith; service extraction is incremental.

### Data & Caching
- MongoDB via Mongoose (`config/database.js` handles pooling, `models/` for schemas).
- Redis is optional and degrades gracefully when unavailable (`config/redis.js`). Don't write code that hard-fails when Redis is down.
- Field-level encryption and rate-limit state can flow through Redis when enabled — check `middleware/rateLimitEnhanced.js` before changing limiter behavior.

### Frontend
Vanilla JS PWA in `client/public/`, built via `client/webpack.config.js`. Built assets are served by Express via `utils/frontendStatic.js#resolveFrontendStaticDir` (production-built dir preferred, falls back to source). The deploy-gate test list enforces frontend/backend contract invariants — when a deploy-gate test fails, fix the contract, don't disable the test.

## Conventions

- **Conventional Commits required** (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`) — enforced by the `commit-msg` hook.
- **Branch from `develop`** for normal work; `main` only for hotfixes. Direct pushes to either are blocked.
- ESLint enforces `no-console` (with per-area overrides in `.eslintrc.json`), `unused-imports/no-unused-imports`, and `eslint-plugin-security` rules. Scripts under `scripts/` and top-level `*-*.js` utilities are exempt from `no-console`.
- `no-param-reassign` is on but `req`, `res`, `next`, `user`, `booking`, `duty`, `app`, `schema`, `event`, `query` are whitelisted for property mutation.
