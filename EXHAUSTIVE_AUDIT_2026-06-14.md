# NOCTURAL Full-Spectrum Audit

Date: 2026-06-14  
Scope: 447 backend, frontend, Android/mobile, configuration, script, and test files; 279 Express route declarations.

## Executive Assessment

Overall risk: **High**.

The application has a broad automated test suite and good baseline controls around headers, authentication middleware, upload signatures, idempotency, and production builds. However, several route modules treat the global `admin` role as equivalent to authorization over every hospital's records. That creates high-risk cross-tenant IDOR and privilege-boundary failures. There are also mass-assignment surfaces, non-atomic financial/booking identifiers and state transitions, upload persistence inconsistencies, and many frontend HTML injection sinks.

## Verification Performed

- Full suite: **102 suites, 727 tests passed**.
- Security gate: **15 tests passed**.
- Lint: **0 errors, 294 warnings**.
- Production frontend build: **passed**.
- Root dependency audit: **0 known vulnerabilities**.
- Client production dependency audit: **0 known vulnerabilities**.
- Client complete/build dependency audit: **32 known vulnerabilities**: 1 critical, 14 high, 16 moderate, 1 low.
- Strict inline-style scan: **passed**.
- Local unauthenticated probes: protected auth, notification, upload-adjacent, certification, and settings endpoints returned `401`; metrics returned fail-closed `503` when its secret was absent.
- Development-mode auth limiter: requests 1-5 returned `400`; requests 6-10 returned `429`.
- Degraded-health load probe: 200 concurrent requests completed in 243 ms wall time, p95 118 ms, all correctly returned `503` because MongoDB was unavailable.
- Security headers observed: CSP, HSTS, and `X-Content-Type-Options: nosniff`.

## Confirmed Findings

### Bug 1: Global Admin Role Permits Cross-Hospital Mutations

**Status: Fixed and regression-tested.** Hospital-scoped mutations now bind and query immutable `hospitalId` when available, with a controlled hospital-name fallback for pre-migration accounts. Credential verification is restricted to `platform_admin`, shift-series creation/mutations are tenant-scoped, and earning creation validates its duty/application/user references.

- Category: Authorization / IDOR / multi-tenant isolation
- Location: `routes/certifications.js:151`, `routes/earnings.js:146`, `routes/earnings.js:172`, `routes/shiftSeries.js:75`, `routes/shiftSeries.js:146`, `routes/shiftSeries.js:184`
- Root cause: Routes authorize the `admin` role but do not constrain target records to `req.user.hospital` or another explicit tenant identifier.
- Impact: **Critical**. An administrator from hospital A can potentially verify certifications, create/update earnings, or mutate shift-series records belonging to hospital B by supplying their IDs.
- Reproduction: Authenticate as an admin from one hospital and submit a target ID owned by another hospital.
- Recommended fix: Add a reusable tenant-scope middleware/service predicate and include hospital ownership in every query, for example `findOne({ _id: id, hospital: req.user.hospital })`. Add two-hospital integration tests for every admin mutation.

### Bug 2: Mass Assignment on Sensitive Models

**Status: Fixed and regression-tested.** Certification, earning, shift-series, and review creation/update routes now use explicit DTO allowlists. Ownership, tenant, verification, payment, status, computed, and audit fields are controlled server-side. Required earning and shift-series derived values are calculated before model validation.

- Category: Security / privilege escalation / data integrity
- Location: `routes/certifications.js:63`, `routes/certifications.js:101`, `routes/earnings.js:148`, `routes/shiftSeries.js:78`, `routes/reviews.js:84`
- Root cause: Request bodies are spread directly into models or applied through `Object.assign`.
- Impact: **High**. Callers can set fields that were not intended to be client-controlled, including ownership, verification, status, payment, visibility, and audit fields.
- Reproduction: Include an extra protected model field in an otherwise valid request.
- Recommended fix: Use route-specific allowlists or validated DTOs and overwrite ownership/audit fields server-side.

### Bug 3: Users Can Self-Verify Certifications

**Status: Fixed and regression-tested.** Certification create/update routes allowlist provider-editable fields and bind ownership server-side. Provider edits now invalidate any prior verification and clear verifier audit fields. Only the dedicated `platform_admin` workflow can set verification state, and it accepts only `VERIFIED` or `REJECTED`.

- Category: Security / mass assignment / verification integrity
- Location: `routes/certifications.js:76`, `routes/certifications.js:103`, `routes/certifications.js:178`
- Root cause: Certification creation and updates previously accepted broad request-body fields, and edits to verified certificate content did not invalidate the prior verification decision.
- Impact: **Critical**. Users could potentially set verification fields or modify verified credential content while retaining a trusted verification state.
- Reproduction: Submit protected verification fields during create/update, or edit the license/document fields of an already verified certification.
- Recommended fix: Completed. Explicitly allowlist user-editable fields, bind ownership server-side, invalidate verification after provider edits, and restrict verification mutations to the platform-admin workflow.

### Bug 4: Analytics Mutation and Hospital Dashboard Lack Correct Authorization

- Category: Authorization / IDOR / sensitive-data exposure
- Location: `routes/analyticsOptimized.js:170`, `routes/analyticsOptimized.js:283`
- Root cause: `update-doctor/:userId` and hospital dashboard require authentication but not the required role and tenant relationship.
- Impact: **Critical**. Authenticated non-admin users may mutate another user's analytics or access hospital-level analytics.
- Reproduction: Call these routes with a doctor/patient token and another user's ID.
- Recommended fix: Require the appropriate admin/provider role, scope to the caller's hospital, cast aggregate IDs to `ObjectId`, and add cross-role/cross-tenant tests.

### Bug 5: Hospital Settings Are Not Admin-Only

- Category: Authorization / configuration tampering
- Location: `routes/hospitalSettings.js:7`, `routes/hospitalSettings.js:18`, `routes/hospitalSettings.js:57`, `routes/hospitalSettings.js:94`
- Root cause: Routes use `protect` without `authorize('admin')`; nested request objects are merged directly.
- Impact: **High**. Any authenticated provider can potentially read or change settings, preferred doctors, budgets, forecasting, and notification configuration.
- Reproduction: Submit settings changes with a doctor or nurse token.
- Recommended fix: Require admin authorization, tenant-scope every settings query, and validate nested fields with explicit schemas.

### Bug 6: Public Reviews Leak Hospital-Only Reviews

- Category: Sensitive-data exposure
- Location: `routes/reviews.js:13`
- Root cause: The public query includes both `PUBLIC` and `HOSPITAL_ONLY` visibility.
- Impact: **High**. Internal review content can be disclosed without authentication.
- Reproduction: Call `GET /reviews/user/:userId` without a token.
- Recommended fix: Public route must query only `visibility: 'PUBLIC'`; create a separate tenant-authorized route for hospital-only reviews.

### Bug 7: Generic Runtime Tokens Do Not Enforce Identity Type

- Category: Authentication / identity confusion
- Location: `middleware/auth.js`; compare unused identity-aware helpers in `utils/authTokens.js`
- Root cause: Runtime authentication accepts generic JWTs without a mandatory audience/identity type, while `protectBoth` resolves Patient before User.
- Impact: **High**. Colliding identifiers or incorrectly issued tokens can cross the patient/provider boundary.
- Reproduction: Issue or reuse a token whose subject exists in the other identity collection.
- Recommended fix: Require issuer, audience, token version, and `identityType`; query only the declared identity collection.

### Bug 7A: Password Changes Do Not Invalidate Refresh Sessions

**Status: Fixed and regression-tested.** Provider and patient password changes revoke every active refresh session and clear current auth cookies. Refresh rotation rejects sessions or refresh tokens issued before `passwordChangedAt`, and rechecks after replacement creation to close concurrent password-change/rotation races.

- Category: Authentication / session security
- Location: `controllers/authController.js`, `controllers/patientController.js`, `services/authService.js`, `services/patientService.js`, `services/refreshSessionService.js`
- Root cause: Access-token middleware enforced `passwordChangedAt`, but refresh-session rotation did not independently enforce it.
- Impact: **High**. A stolen refresh token could remain usable after a password change.
- Reproduction: Capture a refresh token, change the account password, then attempt refresh-token rotation.
- Recommended fix: Completed. Revoke all identity sessions on password changes, clear current cookies, reject stale refresh sessions/tokens, and recheck after replacement creation.

### Bug 8: Upload Routes Persist Incorrect Paths and Skip Local Magic-Byte Validation

**Status: Fixed and regression-tested.** Local and GCS uploads now produce one opaque storage-key contract. Persisted URLs use an authenticated download route that verifies the requested key exists on the caller's stored user record. Local and investigation-report uploads run magic-byte validation, GCS streams validate before persistence, and replacements/failures/deletions remove underlying objects.

- Category: Functional / security / integration
- Location: `middleware/upload.js:45`, `middleware/upload.js:121`, `middleware/upload.js:339`; `routes/uploads.js:67-298`; `config/storage.js:52-124`
- Root cause: Exported route middleware does not compose `setUploadType` or `validateFileType`. Local files therefore default to `uploads/general`, while database URLs claim typed folders. GCS results expose `key/location` but routes expect `filename`.
- Impact: **High**. Broken file URLs, orphaned objects, inconsistent local/GCS behavior, and local MIME-spoofing exposure.
- Reproduction: Upload a valid local document and inspect actual disk path versus stored URL; enable GCS and inspect `req.file.filename`.
- Recommended fix: Export composed middleware chains per upload type, normalize storage results to one contract, and use `storageConfig.getFileUrl`.

### Bug 9: Upload Deletion Does Not Delete Stored Objects

**Status: Fixed and regression-tested.** Supported user-document deletion now removes the persisted metadata and its underlying local/GCS object. Upload replacement also deletes the superseded object after the new metadata saves successfully.

- Category: Resource leak / privacy / storage cost
- Location: `routes/uploads.js`; `config/storage.js:245`
- Root cause: Routes clear database references without consistently calling the storage deletion abstraction.
- Impact: **High**. Deleted sensitive documents remain on disk or in GCS.
- Reproduction: Delete a document then check the backing storage object.
- Recommended fix: Use a transactional/outbox-style deletion workflow and audit orphan cleanup.

### Bug 10: Booking Completion Is Not Atomic

**Status: Fixed and regression-tested.** Completion now atomically claims the transition with `{ _id, serviceProvider, status: 'IN_PROGRESS' }`. On a connected replica set, the claim, patient accounting, and a durable completion outbox commit in one transaction. Health metrics and booking-capture records have database unique indexes, and failed derived writes are retried by reconciliation. Concurrent losers fail without performing dependent side effects.

- Category: Race condition / data integrity
- Location: `services/bookingService.js:628-637`
- Root cause: Status is read before an unconstrained `findByIdAndUpdate`; dependent patient counters are updated separately.
- Impact: **High**. Concurrent completion requests can both succeed and double-apply dependent updates.
- Reproduction: Send two simultaneous completion requests for the same booking.
- Recommended fix: Completed. Use a guarded compare-and-set transaction, durable reconciliation outbox, and unique booking-derived record indexes.

### Completed Optional Hardening

- Required persisted idempotency keys now protect booking completion, password changes, uploads, and all B2C payment mutations.
- Refresh sessions now track token families, detect rotated-token reuse, and revoke the affected family.
- Provider and patient session APIs/UI list active devices and support individual revocation or logout-everywhere.
- Durable security audit events cover password changes, session revocations, stale/reused refresh tokens, and booking completion claims/failures.
- `scripts/reconcile-data-integrity.js` reports or repairs stale sessions, patient booking totals, pending completion outbox work, and orphaned uploads.
- `tests/live/booking-completion-concurrency.live.test.js` provides a replica-set-only parallel completion verification gate.

### Bug 11: Sequential and Random Business Identifiers Can Collide

- Category: Race condition / data integrity
- Location: `models/payment.js:137`, `models/investigationReport.js:309`, earning invoice generation, patient referral-code generation
- Root cause: IDs are derived from `countDocuments() + 1` or small/random values without a collision-safe allocation strategy.
- Impact: **High** for payments/reports, **Medium** for referrals. Concurrent inserts can fail or associate the wrong business process.
- Reproduction: Create multiple records concurrently.
- Recommended fix: Use database-generated IDs, atomic counters, UUID/ULID identifiers, and unique indexes with retry-on-duplicate.

### Bug 12: Redis Cache and Rate-Limit Administration Uses Blocking `KEYS`

- Category: Performance / availability
- Location: `config/redis.js:222`, `config/rateLimit.js:183`, `middleware/queryCache.js:191-259`, `middleware/rateLimitEnhanced.js:380`
- Root cause: Administrative and invalidation paths call Redis `KEYS`.
- Impact: **High** at scale. `KEYS` blocks Redis while scanning the entire keyspace.
- Reproduction: Populate a large Redis keyspace and trigger cache invalidation or stats.
- Recommended fix: Use cursor-based `SCAN`, tagged sets, or versioned cache namespaces.

### Bug 13: Enhanced Rate Limiter Discards Per-User Key Generators

- Category: Security / rate-limit design
- Location: `middleware/rateLimitEnhanced.js:34-98`, options declared at `:166-217`
- Root cause: `createRateLimiter` does not destructure or pass `keyGenerator`, so API/upload/search/payment limiters fall back to IP-only keys.
- Impact: **Medium**. Users behind one NAT share limits, while distributed attackers can rotate IPs; intended per-user controls are not active.
- Reproduction: Inspect rate-limit keys or compare two authenticated users on one IP.
- Recommended fix: Pass an IPv6-safe key generator that uses authenticated identity when available and normalized IP otherwise.

### Bug 14: Error Details Are Returned to Clients

- Category: Information disclosure
- Location: `routes/analytics*.js`, `routes/certifications.js`, `routes/earnings.js`, `routes/payments.js`, `routes/reviews.js`, `routes/shiftSeries.js`, `middleware/errorHandler.js`
- Root cause: Numerous `500` responses include raw `error.message`.
- Impact: **Medium**. Database, validation, and provider details can leak and assist attackers.
- Reproduction: Trigger a database cast/provider error and inspect the response.
- Recommended fix: Return stable public error codes/messages and log detailed errors with a request ID.

### Bug 15: Frontend Contains Numerous Unescaped HTML Injection Sinks

- Category: XSS
- Location: Examples include `client/public/js/admin-settings.js:145`, `doctor-dashboard.js:189`, `doctor-duty-details.js:177`, `patient-booking-form.js:184`, `patient-health-dashboard.js:167-260`, `patient-report-details.js:91-366`, `provider-dashboard.js:89-141`
- Root cause: API/user/provider-controlled values are interpolated into `innerHTML` or `insertAdjacentHTML`.
- Impact: **High**. A stored or reflected value can execute in authenticated users' browsers if it reaches one of these renderers.
- Reproduction: Store HTML/event-handler payloads in fields rendered by these modules.
- Recommended fix: Render text with `textContent`, build elements with DOM APIs, validate URLs, and use one reviewed escaping helper when HTML templates are unavoidable.

### Bug 16: Metrics Accumulators Can Grow Without Bound

- Category: Memory leak / observability availability
- Location: `routes/admin/metrics.js`
- Root cause: In-memory arrays and high-cardinality original URLs are retained without strict bounds; one endpoint assumes `.entries()` on serialized data.
- Impact: **Medium**. Long-running instances can consume increasing memory and metrics endpoints can fail.
- Reproduction: Send many unique URLs and observe process memory/cardinality.
- Recommended fix: Use bounded histograms/counters, normalize route labels, and export metrics to the monitoring backend.

### Bug 17: Server Accepts Traffic Before Database Connection Completes

- Category: Availability / startup correctness
- Location: `server.js:130-136`
- Root cause: `connectDB()` is invoked without awaiting it before `app.listen`.
- Impact: **Medium**. The instance can appear started and accept requests while its core dependency is unavailable.
- Reproduction: Start with an unreachable MongoDB URI; the server listens and health returns degraded `503`.
- Recommended fix: Await required startup dependencies before readiness, or deliberately separate liveness from readiness and prevent traffic routing until ready.

### Bug 18: CI Dependency Audit Cannot Fail and Misses Client Build Dependencies

- Category: Supply-chain / regression prevention
- Location: `.github/workflows/ci.yml:184`; client dependency graph
- Root cause: Root audit was followed by `|| true`, and the client build dependency tree was not gated.
- Impact: **Resolved**. Root and client dependency graphs contain zero known vulnerabilities, and CI now fails on high/critical findings in either graph.
- Reproduction: Run `npm --prefix client audit --json`.
- Resolution: Added separate failing root and client dependency audit gates and removed the unconditional bypass.

### Bug 19: Environment Documentation and CI Secrets Drift From Runtime Contract

- Category: Configuration / deployment compatibility
- Location: `.env.example:23-52`, `.github/workflows/ci.yml:100-119`, `config/validateEnv.js:71-84`, `config/storage.js:7`
- Root cause: Documentation/CI use `JWT_EXPIRE`, `USE_S3`, and a non-hex encryption-key example while runtime expects access/refresh settings, `USE_GCS`, and exactly 64 hexadecimal characters.
- Impact: **Medium**. Fresh deployments and CI can fail or start with unintended defaults.
- Reproduction: Configure only documented variables and run startup validation.
- Recommended fix: Generate `.env.example` and CI test env from the runtime validation schema.

### Bug 20: Overnight Shift Durations Can Become Negative

- Category: Logic / financial calculation
- Location: earning optimizer and shift-series duration calculations
- Root cause: End times earlier than start times are not consistently treated as next-day times.
- Impact: **Medium**. Incorrect hours and earnings recommendations.
- Reproduction: Create a shift from 22:00 to 06:00.
- Recommended fix: Normalize end time to the next day when appropriate and centralize duration calculation.

### Bug 21: Messaging Does Not Enforce a Business Relationship

- Category: Authorization / abuse
- Location: `routes/messaging.js`
- Root cause: Authenticated users can target recipient IDs without consistently proving a shared booking/duty/hospital relationship.
- Impact: **Medium**. Spam, harassment, and disclosure of account existence.
- Reproduction: Send a message to an unrelated valid user ID.
- Recommended fix: Require a valid conversation scope derived from a shared authorized resource.

### Bug 22: Provider Dashboard Polling Has No Teardown

- Category: Resource/performance
- Location: `client/public/js/provider-dashboard.js:294`
- Root cause: An unconditional interval is created without visibility/page-unload cleanup.
- Impact: **Low/Medium**. Duplicate polling and unnecessary requests in long-lived navigation contexts.
- Reproduction: Reinitialize the module or keep the page backgrounded.
- Recommended fix: Store the interval handle, pause on hidden state, and clear it on teardown.

### Bug 23: Test Harness Masks Open Handles

- Category: Regression prevention
- Location: `jest.fast.config.js:6`
- Root cause: `forceExit: true` terminates Jest despite open handles.
- Impact: **Medium**. Connection, timer, and worker leaks can remain undetected.
- Reproduction: Full suite ends with Jest's open-handle warning.
- Recommended fix: Remove `forceExit`, use `--detectOpenHandles` temporarily, and close database, Redis, worker, timer, and server resources in test teardown.

## Repairs Completed During Audit

- Repaired stale/deleted-module tests and aligned tests with current route/service contracts.
- Replaced new encryption writes with versioned AES-256-GCM authenticated encryption, retained legacy CBC read compatibility, and enforced a hexadecimal key.
- Revoked all refresh sessions after provider or patient password changes and added the patient change-password route.
- Added booking service/city availability validation.
- Centralized mobile device API requests through the shared route/fetch configuration.
- Made frontend static selection deterministic.
- Standardized unauthorized auth-controller responses.
- Added notification input/action URL sanitization and safer notification rendering coverage.
- Excluded generated Android/build artifacts from lint and restored a zero-error lint baseline.
- Added an isolated Docker MongoDB replica-set verification workflow and successfully ran database indexes, reconciliation dry run, and live booking-completion concurrency tests.
- Replaced obsolete vulnerable client development servers, upgraded build plugins, and reduced both root and client dependency audits to zero known vulnerabilities.
- Added failing root and client dependency-audit CI gates to prevent silent high/critical vulnerability regressions.
- Enforced tenant/admin boundaries on analytics, hospital settings, reviews, and messaging relationships.
- Enforced versioned provider/patient JWT identities with issuer- and audience-specific verification.
- Routed API-driven frontend markup through a sanitizer that removes executable elements, handlers, styles, and unsafe URLs.
- Made storage deletion failures visible, added additional-certificate deletion, and scheduled orphan-upload reconciliation alerts.
- Added fail-fast database startup, optional required-Redis readiness, scheduled reconciliation, and operational Prometheus signals.
- Added safe production index migration backup/preflight/rollback/post-verification and corrected the application uniqueness index to use `applicant`.
- Removed Jest `forceExit`, repaired the exposed Redis reconnect leak, and added a CI lint-warning ceiling currently set to 302.
- Extended disposable integration and CI verification with Redis, replica-set indexes, reconciliation, live concurrency, and cross-tenant tests.

## Blocked Live Checks

The following could not be truthfully completed in this environment:

- Authenticated browser/mobile workflows against a live test database.
- Cross-tenant dynamic requests using two real hospital accounts.
- Real Razorpay, email/SMTP, GCS, Redis, Gemini, and Firebase delivery.
- Android device/emulator workflows.
- OWASP ZAP active scan.

Reason: No real test accounts or payment, GCS, SMTP, Gemini, or Firebase credentials are exposed. MongoDB replica-set index creation, Redis startup, reconciliation, and live booking-completion concurrency behavior are verified using the isolated test workflow. Existing mock/contract tests for payment security, GCS magic-byte validation, Redis rate limiting, push notifications, auth, mobile ownership, CSP, XSS, and idempotency pass.

## Priority Order

1. Enforce tenant ownership on every admin/hospital route and add cross-tenant tests.
2. Remove mass assignment and protect analytics/settings/review/messaging boundaries.
3. Repair upload storage contracts and deletion.
4. Make booking/financial/report state transitions and identifiers atomic.
5. Remove frontend HTML injection sinks.
6. Replace Redis `KEYS`, bound metrics, and fix startup readiness.
7. Gate client build dependency vulnerabilities in CI and remove Jest `forceExit`.
