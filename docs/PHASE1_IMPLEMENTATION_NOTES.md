# Phase 1 Implementation Notes — `@nocturnal/shared`

> Companion to `PHASE1_SPLIT_RECONCILED.md` (Phase 1) and `PHASE0_BASELINE.md`.
> Recorded **before** writing the shared package code, per the Phase 1 checklist.

## Chosen Lazy-Export Mechanism (decision record)

**Decision (2026-07-02): lazy getters** — a single `packages/shared/src/index.js` that defines every export as an `Object.defineProperty` getter whose body is a literal `require()` of the existing root module. Nothing is required at package load time; a module is loaded only on first access of its named export, and Node's require cache makes subsequent accesses free.

**Why lazy getters over sub-barrels:**

- One file satisfies Phase 1 (`package.json` + `src/index.js`), matching the approved scope exactly.
- `require('@nocturnal/shared')` is completely side-effect-free; accessing `.logger` loads only the logger's own dependency tree — storage, upload, Redis-backed cache, and notification/WebAuthn services stay unloaded.
- Each getter uses a **literal** `require()` path, keeping `eslint-plugin-security`'s non-literal-require rule satisfied.
- Sub-barrels (`@nocturnal/shared/logger`, …) remain possible later as a purely **additive** change (subpath files or a package `exports` map) without breaking the getter API.

## Export Inventory

Path depth: `packages/shared/src/index.js` is three levels below repo root → all re-exports use `../../../`. All 27 paths verified case-exact against the git index on 2026-07-02.

| Export name | Root module |
|---|---|
| `logger` | `utils/logger.js` |
| `responseHelper` | `utils/responseHelper.js` |
| `errors` | `utils/errors.js` |
| `encryption` | `utils/encryption.js` |
| `mobileAuth` | `utils/mobileAuth.js` |
| `authCookies` | `utils/authCookies.js` |
| `safeMongo` | `utils/safeMongo.js` |
| `queryUpdateOptions` | `utils/queryUpdateOptions.js` |
| `requestSecurityMetadata` | `utils/requestSecurityMetadata.js` |
| `monitoring` | `utils/monitoring.js` |
| `number` | `utils/number.js` |
| `pagination` | `utils/pagination.js` |
| `tenantScope` | `utils/tenantScope.js` |
| `pickAllowedFields` | `utils/pickAllowedFields.js` |
| `auth` | `middleware/auth.js` |
| `validation` | `middleware/validation.js` |
| `queryCache` | `middleware/queryCache.js` |
| `rateLimiter` | `middleware/rateLimiter.js` |
| `idempotency` | `middleware/idempotency.js` |
| `upload` | `middleware/upload.js` |
| `storage` | `config/storage.js` |
| `User` | `models/user.js` |
| `notificationService` | `services/notificationService.js` |
| `refreshSessionService` | `services/refreshSessionService.js` |
| `securityAuditService` | `services/securityAuditService.js` |
| `passwordSecurityService` | `services/passwordSecurityService.js` |
| `compromisedPasswordService` | `services/compromisedPasswordService.js` |

## Explicitly Excluded (patient-owned — per blueprint)

- `middleware/patientAuth.js`
- `middleware/healthDataAccess.js`
- `models/bookingCompletionOutbox.js`
- `models/refundOutbox.js`
- `utils/bookingReviewAggregate.js`

Also note: `packages/shared/src/utils/localFileSystem.js` (the pre-existing lone file) is left untouched and is **not** exported in Phase 1 — its classification is deferred; adding it later is additive.

## Validation Results

_To be appended when Phase 1 validation runs._
