# Nabz QA strategy and test inventory (Phase 2)

Prepared 1 November 2026 from a read-only review of branch `feature/nabz-care-marketplace` (HEAD `39955d5`, plus uncommitted dispatch work). Every case points to code that exists today or is marked as an assumption, not built, or blocked. Companion to `Quick_Commerce_QA_Engineering_Playbook.docx` and the Phase 1 discovery report.

## Contents

1. [Product under test](#1-product-under-test)
2. [What changes because Razorpay is not added yet](#2-what-changes-because-razorpay-is-not-added-yet)
3. [Risk model](#3-risk-model)
4. [Test levels and where each test lives](#4-test-levels-and-where-each-test-lives)
5. [Environments and test data](#5-environments-and-test-data)
6. [Suites and when they run](#6-suites-and-when-they-run)
7. [Release gates](#7-release-gates)
8. [Test debt to clear first](#8-test-debt-to-clear-first)
9. [How to read the inventory](#9-how-to-read-the-inventory)
10. [Test inventory](#10-test-inventory)
11. [Coverage summary](#11-coverage-summary)
12. [Not built, so not tested](#12-not-built-so-not-tested)
13. [Open questions](#13-open-questions)

---

## 1. Product under test

| Surface | Code | Users |
|---|---|---|
| Nabz app (customer) | `frontends/mobile`, `APP_VARIANT=customer` | Customers: medicines, home visits, lab tests, Plus |
| Nabz Partner app | `frontends/mobile`, partner variant, `app/(partner)/*` | Stores (`pharmacy_vendor`), riders (`delivery_partner`), nurses and physios, labs and phlebotomists |
| Website | `frontends/web` (Next.js 15) | Customers; stores at `/vendor`; admins at `/admin`; onboarding reviewers at `/onboarding`; staff at `/staff` |
| API | `app.js`, `routes/`, `services/` (Express 5, Mongoose 9) | Everything above, under `/api/v1` |
| Background work | `services/cronService.js` (minute tick under a MongoDB lease), `workers/` | Store acceptance timeouts, expiries, refunds, rider assignment, surge |
| Legacy (still mounted) | `client/`, legacy routes in `routes/v1/index.js`, `apps/*` | Old Nocturnal hospital product. **In scope** (confirmed 2 Nov 2026); its test cases come in the next revision |

**Business model:** independent chemists, not dark stores. A customer's basket is matched to one store, or split across two. The store packs it, and a Nabz rider (or the store itself) delivers. There is no picker or bin workflow, so "picking" means the store's accept → preparing → ready steps.

## 2. What changes because Razorpay is not added yet

- **Prepaid is switched off in code.** The API refuses prepaid orders when the gateway has no keys (`services/pharmacyService.js:294`). Cash on delivery is the only live payment path. COD tests are P0 now.
- **Online-payment tests are split:**
  - Unit tests with a mocked gateway can run today (`tests/unit/pharmacy/pharmacy-payment-service.test.js`).
  - End-to-end and sandbox cases are **BLOCKED** until Razorpay **test-mode** keys exist on staging. Live keys are never used for testing.
- **A gate before Razorpay goes live:**
  - Payment confirmation today relies on the app calling "verify". There is no webhook.
  - Lab orders are cancelled at their payment hold without asking Razorpay (`services/labOrderService.js:676-691`). A payment captured just before an app crash would be kept, with nothing delivered.
  - PAY-015, PAY-016 and PAY-017 must pass before prepaid is switched on ([section 7](#7-release-gates)).

## 3. Risk model

Priority follows the playbook. These are the Nabz areas behind each priority.

| Priority | Nabz areas | Why |
|---|---|---|
| **P0** | COD order placement, repeat-tap and retry safety, stock for the last unit, store and rider state machines, delivery code, cross-account access (IDOR), roles, admin MFA, prescription-only and banned medicines | Money, overselling, a wrongly "delivered" order, data exposure, regulatory exposure (Schedule H/H1/X) |
| **P0 (dormant until Razorpay)** | Prepaid capture, verify, refund, reconciliation, webhook | Charged twice, or charged without an order |
| **P1** | Serviceability and zones, delivery fee, substitutions, partial fulfilment, refunds, rider assignment and batching, nurse dispatch, notifications, onboarding and verification, store operations | Failed deliveries, wrong charges, lost trust |
| **P2** | Search quality, empty and error states, analytics, cosmetic UI | Experience and polish |

**Phase 1 findings that drive specific cases:**

| Finding | Test cases |
|---|---|
| C1 (no webhook; lab expiry without reconcile) | PAY-015 to PAY-017 |
| H1 (idempotency replay broken in tests) | PAY-004, RES-002 |
| H2 (CI ignores `frontends/`) | UX-001, CART-004, PAY-006, ADM-009 |
| M1 (rate limits off in tests) | API-003 |
| M2 (stock leak on crash) | INV-009 |
| M4 (legacy routes mounted) | API-008 |
| L1 (default-allow order lookup) | ORD-010 |

## 4. Test levels and where each test lives

| Layer | Runner today | Location | Notes |
|---|---|---|---|
| Unit | Jest 30 | `tests/unit/**` | Pure rules: pricing, dispatch maths, serviceability, contracts |
| API / integration | Jest + Supertest against a **real MongoDB** | `tests/integration/**` | The default for business rules. Each suite creates its own data with a run-id suffix and deletes it in `afterAll` |
| Concurrency | Jest, `Promise.all` of parallel Supertest calls | `tests/integration/double-tap-safety.test.js` pattern | Last unit, double tap, assignment races |
| Mobile logic | `node:test` through sucrase | `frontends/mobile/lib/*.test.ts` | Tab rules, repeat guard |
| Web E2E | Not in the repo for the Next.js site (a Playwright script exists only outside the repo) | — | Tool choice in Phase 3 |
| Mobile E2E | None | — | Tool choice in Phase 3. Device matrix is manual for now |
| Performance and DAST | None | — | Blocked: needs targets and staging authorisation |

**Rule:** a business rule is tested at the lowest layer that can prove it. A UI test only checks that the screen shows what the API decided.

## 5. Environments and test data

| Environment | Use | Data | Not allowed |
|---|---|---|---|
| Local | Unit, integration, concurrency | mongod replica set `rs0`, database `nocturnal_test`, created by each test | — |
| CI (GitHub Actions) | PR checks | `mongo:6.0` **single node**. Must become a replica set for transaction paths | Real keys |
| Staging (App Runner, `NODE_ENV=production`) | Smoke after deploy, manual and device testing, later performance and DAST | Synthetic accounts only. The account list lives outside the repo; passwords never go in tests or reports | Real customer data. Load or DAST without written approval |
| Razorpay | — | **Test mode only**, once added | Live keys in any test |
| Production | Post-release health check only | — | Any test that writes data |

**Test data rules:**
- **Unique names:** names and emails carry a run id (`qa.<run>@nabz.test`). Phone numbers come from a reserved test range.
- **Location:** geography is isolated per suite. For example, the dispatch suite uses Ahmedabad so its zones never overlap the Jaipur suites.
- **Clocks:** time is controlled by writing milestones directly (as `nabz-dispatch-heatmap.test.js` does), never by sleeping.
- **Isolation:** no shared mutable accounts between suites. Run integration suites with `--runInBand`, because they share one database.

**Default cleanup:**
- **Integration tests:** delete every document they created in `afterAll`, by id or run-id.
- **Staging:** cancel or close every order created and set test riders offline.
- **Exceptions** are stated in the case.

## 6. Suites and when they run

| Suite | Contents | Trigger | Must pass |
|---|---|---|---|
| PR (fast) | Lint, `npm test` (fast config), mobile tests, web and mobile type-check | Every PR | Yes |
| Regression | Full Jest config, real-database integration, concurrency | Nightly and on each release candidate | Yes, or each failure triaged with an owner |
| Staging smoke | Health, CORS and auth, store listing, COD order to delivered with synthetic accounts | After every staging deploy | Yes |
| Release (manual) | Device matrix, exploratory sessions on P0 and P1 journeys, accessibility pass | Each app release | P0 journeys must pass |
| Scheduled | Dependency audit, performance baseline, DAST baseline | Weekly or before release, once authorised | Per agreed thresholds |

## 7. Release gates

**Every release:**
1. No open S1 defects. S2 defects are fixed or signed off by the accountable lead.
2. All P0 cases in this inventory that are AUTO or READY pass on the release candidate.
3. Regression has no untriaged failures. **The 113 currently failing tests count against this until triaged ([section 8](#8-test-debt-to-clear-first)).**
4. The staging smoke passes after deploy.
5. The rollback path (previous App Runner image) is known and tested once per quarter.

**Before Razorpay is switched on** (in addition):
6. A webhook endpoint exists with signature check, idempotent handling and out-of-order safety (PAY-017).
7. Lab orders and care plans reconcile with Razorpay before expiring, and refund captured payments (PAY-015, PAY-016).
8. PAY-010 to PAY-022 pass against Razorpay test mode on staging.

## 8. Test debt to clear first

These make the current results untrustworthy. Fix them before adding new tests.

| # | Problem | Evidence | Effect |
|---|---|---|---|
| D1 | **Fixed 2 Nov 2026.** Test fixture encryption key was 34 characters (must be 64 hex); CI's fallback was 31. Now derived with SHA-256 in `tests/setup.js`; CI uses the secret if set, otherwise the derived key. Also fixed: the nurse ×6 test booked "today 23:30" from the UTC date, which is in the past whenever India is already on the next day | `tests/setup.js:18`, `.github/workflows/ci.yml:106,124`, `tests/integration/double-tap-safety.test.js:163` | `double-tap-safety` 5/5 passing |
| D2 | **Fixed 2 Nov 2026.** The full suite was red: 8 suites, 113 tests. The legacy hospital modules are in scope, so their tests were fixed, not retired. Causes, with fixes in [section 8.1](#81-what-was-fixed-on-2-november-2026) | Legacy model and page tests, CSP contract, `shared-package-lazy-load`, Playwright smoke | Real failures were hiding among old ones |
| D3 | **Fixed 2 Nov 2026.** CI MongoDB was a single node | `.github/workflows/ci.yml` test job now starts `docker-compose.replica-test.yml` and runs `scripts/init-test-replica-set.js` | Transaction paths can now run in CI |
| D4 | **Fixed 2 Nov 2026.** CI didn't build, type-check or test `frontends/` | New CI job "Website & App Checks" | Website and app regressions now fail the PR |
| D5 | **Fixed 2 Nov 2026.** Rate limits were never exercised (off whenever `NODE_ENV=test`) | `tests/integration/rate-limits-enabled.test.js` builds the app with limits on | API-003 automated; it also exposed customer sign-in having no strict limit (fixed) |

### 8.1 What was fixed on 2 November 2026

**Result:** `npx jest -c jest.config.js --runInBand` (full config, local MongoDB replica set `rs0`, test database `nocturnal_test`, legacy client built with `npm run build:prod`, Playwright Chromium installed):

| | Before | After |
|---|---|---|
| Suites | 8 failed, 196 passed, 4 skipped | **207 passed, 4 skipped, 0 failed** (after the dependency and CodeQL fixes) |
| Tests | 113 failed, 1578 passed, 7 skipped | **1704 passed, 7 skipped, 0 failed** |

The 4 skipped suites and 7 skipped tests are opt-in: they need flags such as `RUN_LIVE_CONCURRENCY_TESTS` or a staging target. The website build, web and app type-checks, and app unit tests (15/15) also pass locally with the commands the new CI job runs.

| Area | Problem found | Fix | Type |
|---|---|---|---|
| Test environment | Fixture encryption key was 34 characters; CI fallback 31 | Key derived with SHA-256 (always 64 hex) in `tests/setup.js`; CI uses its secret or the derived key | Test infrastructure |
| Test environment | A developer `.env` with `WEB_REDIRECT_URL` redirected legacy pages during tests | `tests/setup.js` blanks it | Test infrastructure |
| Nurse ×6 test | Booked "today 23:30" from the UTC date: already past whenever India is on the next day | Books tomorrow (India date) at 11:00 | Test bug |
| **Sign-up (staff and customers)** | Email rule rejected valid addresses with `+` (Gmail aliases) and top-level domains longer than 4 letters | Pattern widened in all 5 copies (`models/user.js`, `models/patient.js`, `constants/index.js`, and the `apps/patient-health` mirrors) | **Product bug** |
| User model test | Created a hospital admin without a hospital, which the model forbids by design | Test supplies `hospitalId` | Stale test |
| Duty and application model tests | Helper created "Test Hospital" before every test; hospital names are unique, so every test after the first failed | Unique names in `tests/helpers.js`; hospitals cleaned up after each test | Test bug |
| Shared package test | Asserted exactly 30 exports; there are now 46 | Asserts every export is a lazy getter (the real invariant) | Brittle test |
| Legacy page smoke test | Merged from `main` with expectations no branch's pages ever had | Aligned to the real pages, keeping each check's intent; pinned to the source pages (the built site has its own suite) | Stale test |
| **Service worker** | `sendFile` with an absolute path returned 404 from any checkout inside a hidden folder | `sendFile('service-worker.js', { root })` | **Product bug (environment-dependent)** |
| Built-site smoke | Playwright browser not downloaded locally | `playwright install chromium` (CI already does this) | Environment |
| **Customer sign-in** | `/patients/login` and `/patients/register` had only the general API limit (750 per 15 min per IP) | New `customerAuthRateLimiter`: 30 failed attempts per 15 min per IP. It is higher than staff (5) because carrier IPs are shared, and the per-account lock still applies | **Security fix** |
| Monitoring | A counter-reset timer kept processes from exiting | `unref()` | Product bug (minor) |
| CI | Single-node MongoDB; no checks on `frontends/` | Replica set from the repo's compose file; new "Website & App Checks" job. Both **passed on GitHub** (PR #216 run, 2 Nov) | CI |
| CI lint (red since Oct) | `apps/patient-health/services/bookingService.js` required `./carePlanService`, which isn't in the app copy | Routed through `@nocturnal/shared` like the other shared modules | Mirror drift |
| CI security audit (red since Oct) | Root: 5 critical and 7 high advisories. Client: 1 critical and 9 high | `npm audit fix` (no breaking upgrades); `follow-redirects` pin 1.16.0 → 1.16.2; client `js-yaml` pin 4.2.0 → ^4.3.2. Both audits pass the high gate | **Dependencies** |
| Git hooks | This worktree's hooks path pointed at the repo's old folder, so pre-commit secret scans never ran | Stale worktree override removed (repo setting `.githooks` applies) | Tooling |
| CodeQL | Alerts on PR #216 | 6 real issues fixed (settings allowlist, 2× email ReDoS, heat map lookup, timer clamp, unused code); 77 NoSQL alerts shown to be mitigated, with a regression test. Owner decision in `docs/SECURITY_CODEQL_TRIAGE.md` | **Security** |

## 9. How to read the inventory

**Fields in each row:**
- **ID:** a stable ID.
- **P:** priority.
- **Preconditions and data:** what must exist before the test.
- **Steps:** API paths are under `/api/v1`.
- **Expected:** the result that must hold.
- **Layer:** U unit, API, INT integration with a real database, CONC concurrency, E2E-W web, E2E-M mobile, MAN manual, PERF, SEC.
- **Status:** see the legend below.
- **Source:** file and line, route, or a named assumption.

**Owner and cleanup:**
- Each area's heading names its default owner. A row overrides it in brackets, e.g. "(MOB-QA)".
- Cleanup follows the default rule in [section 5](#5-environments-and-test-data) unless the row says otherwise.

| Status | Meaning |
|---|---|
| **AUTO** | An existing repo test covers it; the file is named |
| **AUTO-FAIL** | Covered, but failing today |
| **PARTIAL** | An existing test touches the function; the exact case is confirmed in Phase 5 |
| **READY** | Can be automated now with existing tools (Jest, Supertest, real MongoDB, node:test) |
| **TOOLING** | Needs a tool not yet in the repo (chosen in Phase 3) |
| **BLOCKED** | Needs something missing: Razorpay test keys, SMS provider, SMTP, staging approval, targets |
| **MANUAL** | Device, exploratory or judgement-based |

**Owners:**
- BE-SDET: backend test engineer
- WEB-SDET
- MOB-QA
- SEC: security
- PLAT: platform / DevOps
- PROD: product decision

---

## 10. Test inventory

### 10.1 Authentication, OTP, sessions and roles (AUTH) · owner BE-SDET

| ID | P | Preconditions and data | Steps | Expected | Layer | Status | Source |
|---|---|---|---|---|---|---|---|
| AUTH-001 | P0 | New email and phone | `POST /patients/register`, then `POST /patients/login` | 201 then 200 with tokens; no password or hash in either response | API | AUTO `partner-identity-customer-block` | `routes/patient.js` |
| AUTH-002 | P0 | One registered customer | Log in with a wrong password, then with an unknown email | Same status and same message for both (no account enumeration) | API | READY | `services/patientService.js` login |
| AUTH-003 | P0 | A partner account (email and phone) | Customer sign-up and sign-in with the partner's email, phone with and without +91, and Google | 403 `PARTNER_ACCOUNT` with the "use the Partner app" message | API | AUTO `partner-identity-customer-block` | `services/partnerAccountGuard.js` |
| AUTH-004 | P0 | Test env, SMS sender stubbed | `POST /auth/social/phone/start`, then `/phone/verify` with the code | New customer signed up; signing in again reuses the account | API | AUTO `nabz-matching-trust` | `services/socialAuthService.js` |
| AUTH-005 | P0 | Active OTP challenge | Verify with a wrong code 5 times, then the right code | Attempts 1–5 refused; the right code is also refused after lockout | API | READY | `socialAuthService.js:27` (5 attempts) |
| AUTH-006 | P0 | Challenge created 5 min ago (write `createdAt`) | Verify with the right code | Refused as expired | API | READY | `socialAuthService.js` (5-minute expiry) |
| AUTH-007 | P1 | Same phone | Request 4 codes inside the window; then 21 from one IP in an hour | 4th request returns 429; the IP cap returns 429 | API | READY | `socialAuthService.js:29-31,199-210` |
| AUTH-008 | P0 | A code already used successfully | Verify the same code again | Refused (no replay) | API | READY | `socialAuthService.js` |
| AUTH-009 | P1 | Google client ids unset / set with a stubbed verifier | `POST /auth/social/google` with a bad id token | Unset: clean "not available" error. Set: 401 for a bad token | API | PARTIAL `nabz-matching-trust` (unset case) | `socialAuthService.js:139` |
| AUTH-010 | P0 | Customer token: valid, expired, malformed, missing | `GET /pharmacy/orders` with each | 200 for valid; 401 for the rest; no stack traces | API | READY | `middleware/patientAuth.js:37` |
| AUTH-011 | P0 | One customer token and one staff token | Customer token on `/rider/jobs` and `/pharmacy/vendor/orders`; staff token on `/pharmacy/orders` | 401/403 in every cross case | API | READY | `middleware/auth.js:93`, `patientAuth.js` |
| AUTH-012 | P0 | Staff user | Change password, then use the old token | Old token refused | API | AUTO `auth-change-password` | `middleware/auth.js` (password-changed check) |
| AUTH-013 | P1 | Customer signed in on 2 devices | `GET /patients/me/sessions`; `DELETE /me/sessions/:id`; `DELETE /me/sessions` | Revoked session's token refused; the others keep working until "all" | API | READY | `routes/patient.js` |
| AUTH-014 | P1 | Valid refresh token | `POST /auth/refresh` twice with the same refresh token | **Assumption to confirm:** second use refused (rotation). Record the actual behaviour | API | READY | `routes/auth.js:26` |
| AUTH-015 | P0 | Rider, store and reviewer accounts | `POST /auth/login` with the wrong `portal` for each role; reviewer with a non-allowed email domain | Refused; reviewer needs an authenticator code and an allowed domain | API | READY | `controllers/authController.js`, `ONBOARDING_LOGIN_DOMAINS` |
| AUTH-016 | P0 | Platform admin | Password only; enrol; replay a code; recovery code twice; 5 wrong codes; session past max age | Challenge only; replay refused; recovery works once; 15-minute lock; session ends | API | AUTO `nabz-admin-mfa` | `services/adminMfaService.js` |
| AUTH-017 | P1 | Known and unknown emails | `POST /auth/password/forgot`, `/check`, `/reset` | Same reply for both; link single-use; old sessions end; hourly link cap | API | AUTO `nabz-password-reset` (email delivery on staging: BLOCKED, SMTP not set) | `routes/passwordReset.js` |
| AUTH-018 | P1 | Customer with a delivered order and one in transit | Delete the account | Refused while an order is in transit; then personal data erased and history kept | API | AUTO `nabz-account-deletion` | — |
| AUTH-019 | P1 | Signed-in partner | Admin suspends the account; partner calls any API | Next call returns 401 | API | PARTIAL `nabz-admin-ops` | `middleware/auth.js` (deactivated-account check) |
| AUTH-020 | P1 | Signed in on a device (MOB-QA) | Kill and reopen the app; sign out; reopen | Session restored after restart; cleared after sign-out; Partner app shows only that role's tabs | U + MAN | PARTIAL `frontends/mobile/lib/partnerTabs.test.ts` | `frontends/mobile/lib/auth.tsx:49` |
| AUTH-021 | P2 | Device (MOB-QA) | Kill the app while waiting for an OTP; switch Wi-Fi ↔ mobile data mid sign-in | Recovers with a clear state; no duplicate accounts | MAN | MANUAL | — |

### 10.2 Location, address and serviceability (LOC) · owner BE-SDET

| ID | P | Preconditions and data | Steps | Expected | Layer | Status | Source |
|---|---|---|---|---|---|---|---|
| LOC-001 | P0 | Approved, open store; customer point inside its radius | `GET /pharmacy/vendors/nearby?lat&lng` | Store listed with `distanceKm`, `effectiveRadiusKm`, `eta` | INT | AUTO `pharmacy-store-network` | `services/serviceabilityService.js` `findServiceableVendors` |
| LOC-002 | P0 | Point beyond every store's radius | Same call | `serviceable:false`, reason `NO_STORE_IN_RANGE` | INT | READY | `serviceabilityService.js:229-233` |
| LOC-003 | P0 | Zone with `isActive:false` around the point | Nearby call, then place a COD order there | `ZONE_PAUSED`; order refused | INT | READY | `serviceabilityService.js:180` |
| LOC-004 | P1 | Store radius 5 km | Points at 4.99, 5.00 and 5.01 km | Inside, inside, outside (documented boundary) | U | READY | `effectiveRadiusKm` |
| LOC-005 | P1 | Zone stress HIGH (×0.85); store at 90% of its radius | Nearby call | Store not listed while stress lasts; listed again after `until` | U | AUTO `tests/unit/pharmacy/serviceability.test.js` | `serviceabilityService.js:67` |
| LOC-006 | P0 | Cart built for address A (in range) | Place the order with address B (out of range) | Refused; nothing reserved | INT | READY | `pharmacyService.js:331-336` `assessDelivery` |
| LOC-007 | P1 | Store closed, paused, outside hours, licence expired | Nearby call | Store not listed in any of these states | INT | PARTIAL `pharmacy-store-network`, `nabz-partner-verification` | `tradingStoreQuery` |
| LOC-008 | P1 | — | Nearby call with lat 91, lng "abc", and nothing | 400 validation error | API | READY | `serviceabilityService.js` `toPoint` |
| LOC-009 | P1 | Customer (MOB-QA, WEB-SDET) | Add, edit, delete and default an address; set a map pin | Saved address used at checkout; pin coordinates stored | E2E-M / E2E-W | TOOLING | `app/addresses.tsx`, `app/map.tsx` |
| LOC-010 | P1 | Location permission denied (MOB-QA) | Open the pharmacy tab | Manual address path works; no crash; clear prompt | MAN | MANUAL | `app/permissions.tsx` |
| LOC-011 | P2 | Two active zones overlapping at one point | Resolve the zone for that point 20 times | **Risk:** `findOne` without a sort may pick either zone. Expected: one deterministic zone. Product to decide the rule | INT | READY | `serviceabilityService.js:57` |

### 10.3 Catalogue, search and price display (CAT) · owner BE-SDET

| ID | P | Preconditions and data | Steps | Expected | Layer | Status | Source |
|---|---|---|---|---|---|---|---|
| CAT-001 | P1 | Medicines "Dolo 650", "Paracetamol 500mg" | `GET /pharmacy/medicines/search` with exact, partial, upper case, `.*`, `$where`, and 61 characters | Relevant results; regex and operator input treated as text; >60 characters returns 400. Misspellings: record current behaviour (fuzzy search not built) | API | READY | `routes/pharmacy.js` search |
| CAT-002 | P0 | Schedule X and banned medicines in stock | Search, availability, place order | Never sold online | INT | AUTO `pharmacy-store-network` | `models/medicine.js:42` `onlineSaleBlockReason` |
| CAT-003 | P0 | Prescription-only medicine in the cart | Order without a prescription; with one; store tries to pack before the pharmacist verifies | Refused; accepted; packing blocked until verified (H1 register written) | INT | AUTO `pharmacy-store-network-phase2` | `/prescriptions`, `/vendor/orders/:id/prescription/verify` |
| CAT-004 | P1 | Store inventory row | `PUT /pharmacy/vendor/inventory` with sellingPrice > MRP, negative price, negative stock | **Assumption to confirm:** each rejected | API | READY | `pharmacyService.js:697` `upsertInventoryItem` |
| CAT-005 | P1 | Same medicine at 3 nearby stores | `GET /medicines/:id/availability` | Only stores that can sell now, with honest confidence | INT | AUTO `pharmacy-store-network` | — |
| CAT-006 | P1 | Cold-chain medicine; one store with a fridge, one without | Plan a cart | Only the fridge store is offered | INT | AUTO `pharmacy-store-network` | — |
| CAT-007 | P1 | Out-of-stock medicine | `POST /medicines/:id/notify-me`, restock, restock again | Notified once | INT | AUTO `pharmacy-store-network-phase2` | — |
| CAT-008 | P2 | Store with hidden and out-of-stock rows | `GET /pharmacy/vendors/:vendorId` | Hidden rows absent; out-of-stock shown as unavailable | API | READY | `routes/pharmacy.js` |
| CAT-009 | P2 | API returns 500 / empty (WEB-SDET, MOB-QA) | Open pharmacy and search screens | Clear empty and error states with retry; no blank screen | E2E-W / MAN | TOOLING | `app/(tabs)/pharmacy.tsx`, `web/app/pharmacy` |

### 10.4 Cart, quantity and stock revalidation (CART) · owner BE-SDET

| ID | P | Preconditions and data | Steps | Expected | Layer | Status | Source |
|---|---|---|---|---|---|---|---|
| CART-001 | P1 | Medicine with `maxQtyPerOrder` 2; duplicate lines in the cart | Order 3; order 1+1 as two lines | 3 refused with a message; duplicate lines merged | INT | AUTO `pharmacy-store-network` | `pharmacyService.js:314` |
| CART-002 | P0 | Basket items spread across stores | `POST /pharmacy/cart/plan` | One store with everything preferred; otherwise a split across two | INT | AUTO `pharmacy-store-network` | — |
| CART-003 | P1 | Store minimum order ₹99; basket ₹80 | Place a COD order; open checkout on the web | API refuses with the minimum; web shows "add ₹19 more" and blocks placing | INT + E2E-W | READY (API) / TOOLING (web) | `minOrderValue` |
| CART-004 | P1 | Web, signed in (WEB-SDET) | Add items, reload, place the order | Cart survives reload (`localStorage`); emptied after the order | E2E-W | TOOLING | `frontends/web/lib/cart.tsx:33` |
| CART-005 | P1 | App with items in the cart (MOB-QA) | Kill and reopen the app | **Today the cart is lost** (component state). PROD to decide whether that's acceptable | MAN | MANUAL | `app/(tabs)/pharmacy.tsx:40` |
| CART-006 | P0 | Price changes after add-to-cart | Place the order with the old expected price | Refused with the new price; no silent change | INT | AUTO `pharmacy-store-network` | — |
| CART-007 | P0 | Stock drops to 0 after add-to-cart | Place the order | 409 "out of stock"; no order; no stock change | INT | READY | `pharmacyService.js:249-251` |
| CART-008 | P2 | Not signed in (WEB-SDET) | Build a cart, sign in at checkout | **Assumption:** cart kept after sign-in. Record actual | E2E-W | TOOLING | — |

### 10.5 Pricing and fees (PRICE) · owner BE-SDET

| ID | P | Preconditions and data | Steps | Expected | Layer | Status | Source |
|---|---|---|---|---|---|---|---|
| PRICE-001 | P0 | Subtotals ₹248.99, ₹249.00, ₹249.01 | `quoteDeliveryFee` | Fee for 248.99; free at 249.00 and above; `amountToFreeDelivery` correct | U | PARTIAL `tests/unit/pharmacy/pricing-service.test.js` (confirm boundaries) | `services/pricingService.js`, `config/revenue.js` |
| PRICE-002 | P0 | Below ₹249; distances 0, 2.0, 2.1, 5, 20 km | Same | ₹20 up to 2 km, +₹8 per km beyond, capped at ₹80 | U | PARTIAL `pricing-service.test.js` | `config/revenue.js` |
| PRICE-003 | P1 | Plus member, ₹150 basket | Quote and place the order | Delivery fee waived per policy | U + INT | READY | `pricingService.quoteDeliveryFee` `isMember` |
| PRICE-004 | P0 | Basket and address | `POST /pharmacy/delivery-quote`, then place the order | Fee on the order equals the quote | INT | READY | `pharmacyService.quoteDelivery` |
| PRICE-005 | P0 | Order body tampered: `amounts`, `total`, `deliveryFee:0`, `sellingPrice:1` | `POST /pharmacy/orders` | Server values used, or 400; never the client's | API / SEC | READY | `createOrderValidation` |
| PRICE-006 | P1 | Care visit; member and non-member | Quote | Platform fee and GST on (base + fee); member fee waived | U | PARTIAL `tests/unit/services/care-marketplace-pricing.test.js` | `pricingService.js:88-96` |
| PRICE-007 | P1 | Split checkout across 2 stores | `POST /pharmacy/checkouts` | Per-store fees and totals add up; all or nothing | INT | AUTO `pharmacy-store-network-phase2` | — |
| PRICE-008 | P1 | Substitute cheaper / dearer | Accept each | Cheaper lowers the bill; dearer refused on prepaid | INT | AUTO `nabz-pharmacy-substitution` | — |
| PRICE-009 | P1 | Fractional prices (₹33.335) | Quote → order → partial refund | Rounding is the same in quote, order and refund (paise) | U | READY | `round2` usages |

### 10.6 Checkout and payment (PAY) · owner BE-SDET

COD and repeat-tap cases run now. Prepaid cases run as unit tests with a mocked gateway now; staging cases are **BLOCKED until Razorpay test keys**.

| ID | P | Preconditions and data | Steps | Expected | Layer | Status | Source |
|---|---|---|---|---|---|---|---|
| PAY-001 | P0 | Razorpay keys unset | `GET /pharmacy/payment-options`; place a prepaid order | COD only; prepaid refused with a clear message | API | READY | `pharmacyService.js:294` |
| PAY-002 | P0 | COD order, rider assigned | Deliver with the code | Order delivered; cash booked against the rider in the ledger | INT | AUTO `nabz-rider-delivery` | `services/settlementService.js` |
| PAY-003 | P0 | Valid COD basket | Send "place order" 6 times at once with one key | Exactly one order; stock reduced once | CONC | AUTO `double-tap-safety` | `middleware/idempotency.js` |
| PAY-004 | P0 | An order just placed with key K | Send the same request with K again | Same order returned (201), not a new one and not a 409 | INT | AUTO `double-tap-safety` (passing since the D1 fix) | `idempotency.js:89,140` |
| PAY-005 | P0 | Key K used for basket A | Send basket B with K | 422; nothing created | INT | AUTO `double-tap-safety` | `idempotency.js` |
| PAY-006 | P0 | Web checkout (WEB-SDET) | Double-click "Place order" | One order created | E2E-W | TOOLING (script exists outside the repo) | `frontends/shared/src/repeatGuard.ts` |
| PAY-010 | P0 | Prepaid order (mock gateway) | Create the payment order twice | Same Razorpay order reused | U | PARTIAL `pharmacy-payment-service.test.js` | `pharmacyPaymentService.js:133` |
| PAY-011 | P0 | Valid signature | Verify twice | Marked paid once; second verify changes nothing | U | PARTIAL `pharmacy-payment-service.test.js` | `pharmacyPaymentService.js:295` |
| PAY-012 | P0 | Missing, wrong or other-order signature | Verify | Refused; order unchanged | U | PARTIAL | `utils/razorpayGateway.js:55` |
| PAY-013 | P0 | Order already paid by payment P1 | Capture payment P2 for the same order | P2 refunded automatically; alert if the refund fails | U | AUTO `pharmacy-payment-service.test.js` | `pharmacyPaymentService.js` `refundDuplicatePayment` |
| PAY-014 | P0 | Captured at Razorpay, verify never called (app crashed) | Run `expireUnpaidOrders` after the hold | Order reconciled to paid, not cancelled | U / BLOCKED staging | PARTIAL | `pharmacyPaymentService.js:511-538` |
| PAY-015 | P0 | Lab order: captured, verify never called | Run the lab sweep after the hold | **Expected to fail today (C1).** Must reconcile and either confirm or refund | U | READY | `labOrderService.js:676-691` |
| PAY-016 | P0 | Care plan, same situation | Run the plan sweep after the hold | Same expectation as PAY-015. **Behaviour not yet read** | U | READY | `carePlanService.js` sweep |
| PAY-017 | P0 | Webhook endpoint (not built) | Valid event; duplicate event; out-of-order events; bad signature | Applied once; order of arrival doesn't matter; bad signature 401 | API | BLOCKED (not built) | Gate 6 |
| PAY-018 | P0 | Prepaid order never paid | Pass `paymentExpiresAt`, run the tick | Cancelled; stock restored once; store never alerted | INT | READY | `pharmacyPaymentService.js:511` |
| PAY-019 | P1 | Payment window open for order A (WEB-SDET) | Click Pay for order B | Refused: "Another payment is already open" | E2E-W | TOOLING / BLOCKED | `frontends/web/lib/razorpay.ts` `onePayment` |
| PAY-020 | P0 | Paid order | Cancel 6 times at once | One full refund; stock restored once | CONC | PARTIAL `double-tap-safety` (stock half) / BLOCKED (sandbox refund) | `pharmacyService.js:505-535` |
| PAY-021 | P1 | Paid order; one item unavailable | Store marks the item unavailable; refund API fails once | Partial refund for that line; retried later; never twice | INT | PARTIAL `pharmacy-store-network` | `pharmacyPaymentService.retryPartialRefunds` |
| PAY-022 | P1 | Membership, lab, plan and ads payments (mock gateway) | Verify twice; tamper with the amount | Applied once; amount always from the server | U | READY | `membershipService.js:133`, `labOrderService.js:664`, `carePlanService.js:661`, `adService.js:414` |
| PAY-023 | P1 | Partner with an available balance | Request a withdrawal 6 times at once | One withdrawal | CONC | READY | `routes/partners.js` `/me/withdrawals` |

### 10.7 Orders, state machine and fulfilment (ORD) · owner BE-SDET

| ID | P | Preconditions and data | Steps | Expected | Layer | Status | Source |
|---|---|---|---|---|---|---|---|
| ORD-001 | P0 | One order per starting status | Try every transition not in the table (e.g. PLACED→READY, DELIVERED→anything) | 409 for each; order unchanged | INT (table-driven) | READY | `pharmacyService.js:52-58` |
| ORD-002 | P0 | 3 stores; store 1 silent | Wait past `acceptBy` (set the clock) | Moves to the next store, never a dearer one; cancelled when none accept | INT | AUTO `pharmacy-store-network` | `services/pharmacyAssignmentService.js` |
| ORD-003 | P0 | Order offered to a store | Store accepts | Clock stops; no reassignment | INT | AUTO `pharmacy-store-network` | — |
| ORD-004 | P0 | Accepted order, 3 lines | Store marks 1 line unavailable | That line dropped, bill lowered, prepaid partial refund | INT | AUTO `pharmacy-store-network` | `/vendor/orders/:id/items/unavailable` |
| ORD-005 | P0 | Prescription-only order | Store rejects the prescription | Cancelled, not offered to other stores | INT | AUTO `pharmacy-store-network` | — |
| ORD-006 | P0 | Orders in each status | Customer cancels in each; store rejects while the customer cancels | Allowed only in PLACED/ACCEPTED; a race restocks and refunds once | INT + CONC | PARTIAL `double-tap-safety` | `pharmacyService.js:505-535` |
| ORD-007 | P1 | Store proposes a substitute | Customer accepts / declines / ignores for 15 min | Line swapped / refunded / treated as declined; nobody else can answer | INT | AUTO `nabz-pharmacy-substitution` | `services/pharmacySubstitutionService.js` |
| ORD-008 | P0 | Out for delivery | Deliver with the wrong code 5 times; with the right code; with no code plus a reason | Locked after 5; delivered; delivered but flagged for review | INT | AUTO `pharmacy-store-network-phase2`, `nabz-rider-delivery` | `pharmacyService.js:629` |
| ORD-009 | P1 | Customer with 25 orders | `GET /pharmacy/orders?page=2&limit=500` | Only own orders; limit capped at 100 | API | READY | `getPatientOrders` |
| ORD-010 | P0 | Customers A and B; stores X and Y | B opens A's order; store Y opens X's order; store X opens an unpaid prepaid order | 403, 403, 404 | API / SEC | READY | `pharmacyService.js:464-475`, `routes/pharmacy.js:218,292` |
| ORD-011 | P1 | Customer near monthly limits | Order a capped medicine across two stores | Monthly cap enforced across stores; risky patterns flagged | INT | AUTO `pharmacy-store-network-phase2` | `services/pharmacyComplianceService.js:39-64` |
| ORD-012 | P1 | Delivered order | Wait for the refill reminder | Refill created; reminded once, two days before | INT | AUTO `nabz-rider-delivery` | `services/refillService.js` |
| ORD-013 | P1 | Split checkout; second store fails | Place | Nothing placed in either store | INT | AUTO `pharmacy-store-network-phase2` | — |
| ORD-014 | P1 | One order taken through all states | Read `milestones` and `timeline` | Each milestone written once; timeline shows every change with actor | INT | READY | `STATUS_MILESTONES` `pharmacyService.js:66` |
| ORD-015 | P2 | Delivered order | Look for an invoice or receipt | **Unknown whether one exists.** PROD to confirm | MAN | MANUAL | — |

### 10.8 Inventory and concurrency (INV) · owner BE-SDET

| ID | P | Preconditions and data | Steps | Expected | Layer | Status | Source |
|---|---|---|---|---|---|---|---|
| INV-001 | P0 | Stock = 1 | 2 customers, then 10 customers, place at the same moment | Exactly one order; stock 0, never negative; the rest get 409 | CONC | READY | `pharmacyService.js:232-262` |
| INV-002 | P0 | Basket of 3 lines; line 3 short | Place | 409; lines 1 and 2 restored; no order | INT | READY | `reserveStock` rollback |
| INV-003 | P0 | Order using batch B1 | Cancel, reject, expire | Units back to B1, once each | INT | AUTO `pharmacy-store-network-phase2` | `pharmacyService.js:89-94` |
| INV-004 | P1 | Batches expiring in 20 and 200 days | Order | Earliest batch first; batch inside the shelf-life window refused and quarantined | INT | AUTO `pharmacy-store-network-phase2` | `batchService.allocateFefo` |
| INV-005 | P1 | A batch in 2 stores with open orders | `POST /pharmacy/admin/recalls` | Units off sale everywhere; open orders flagged | INT | AUTO `pharmacy-store-network-phase2` | — |
| INV-006 | P1 | CSV with exact, fuzzy and broken rows; a non-CSV file | `POST /vendor/inventory/import` | Exact rows applied; others queued for review; broken file rejected with a reason | INT | PARTIAL `pharmacy-store-network-phase2` | `models/pharmacyInventoryImport.js` |
| INV-007 | P1 | Batch-tracked item | Manual stock count via `PUT /vendor/inventory` | Refused | INT | AUTO `pharmacy-store-network-phase2` | — |
| INV-008 | P1 | Stock 5 | Store sets stock to 10 while an order for 2 is placed at the same moment | **PROD to define:** absolute count wins, or count minus in-flight orders. Record the result; a lost decrement is a defect if PROD says counts are relative | CONC | READY | `pharmacyService.js:697-716` vs `:241-245` |
| INV-009 | P1 | Fault injected after reservation, before the order is saved | Place | **Known gap (M2):** stock leaks. Expected after the fix: restored, or a reconciliation job repairs it | U | READY | `pharmacyService.js:342` |
| INV-010 | P1 | Store | `POST /vendor/inventory/confirm` | Confirmation time stored; store ranking signal updated | API | READY | `routes/pharmacy.js` |
| INV-011 | P2 | Two duplicate medicine records with stock | Admin merges them | Stock kept; different drugs can't be merged | INT | AUTO `pharmacy-store-network-phase2` | `/admin/medicines/:id/merge` |

### 10.9 Store operations: accept, pack, hand over (STORE) · owner BE-SDET

| ID | P | Preconditions and data | Steps | Expected | Layer | Status | Source |
|---|---|---|---|---|---|---|---|
| STORE-001 | P0 | Rider, nurse and customer tokens | Call each `/pharmacy/vendor/*` route | All refused | API | AUTO `nabz-pharmacy-store` | `routes/pharmacy.js` |
| STORE-002 | P0 | Stores X and Y | Y changes status, substitutes, or reads the prescription on X's order | 403/404 every time | API / SEC | READY | `resolveVendorId`, `getOrderById` |
| STORE-003 | P0 | Accepted order | Preparing → ready; try ready while a substitute is pending; prescription not yet verified | Allowed; blocked; blocked | INT | PARTIAL `pharmacy-store-network-phase2` | `pharmacyService.js:600-603` |
| STORE-004 | P0 | Ready order with a rider assigned / without | Store marks it out for delivery | With a rider: 409. Without: allowed, and delivery still needs the code | INT | AUTO `nabz-rider-delivery` | `pharmacyService.js:605` |
| STORE-005 | P1 | Store with delivered COD and prepaid orders | `GET /vendor/today`, `/vendor/earnings` | Sales, commission, payout and cash match the ledger | INT | AUTO `nabz-pharmacy-store` | — |
| STORE-006 | P1 | Store | Invalid settings; toggle "open" off | Validation errors; store disappears from nearby | INT | AUTO `nabz-pharmacy-store` | `/vendor/profile` |
| STORE-007 | P1 | Store silent on 3 offers | Run the sweeps | Store paused automatically | INT | AUTO `pharmacy-store-network` | — |
| STORE-008 | P1 | Partner app on a device, screen locked (MOB-QA) | New order arrives | Audible alert; accept within the SLA; works with the app in the background | MAN | MANUAL | `frontends/mobile/app/(partner)/vendor.tsx` |
| STORE-009 | P2 | Searches with no stock near the store | `GET /vendor/demand` | Shows unmet demand | INT | AUTO `pharmacy-store-network-phase2` | — |

### 10.10 Delivery and dispatch (DLV) · owner BE-SDET

| ID | P | Preconditions and data | Steps | Expected | Layer | Status | Source |
|---|---|---|---|---|---|---|---|
| DLV-001 | P0 | Riders: unverified; offline; location 4 min old | Ready order nearby | None of them is assigned; an unverified rider can't go online | INT | PARTIAL `nabz-matching-trust` (nurses) | `services/riderService.js` `setOnline`, `FRESH_MS` |
| DLV-002 | P0 | 2 free riders; 2 drops within 3 km; 1 cold-chain order | Mark the orders ready | Nearest rider gets both drops (batch); cold chain goes to another rider | INT | AUTO `nabz-rider-delivery` | `riderService.assign` |
| DLV-003 | P0 | One ready order, two free riders | Run `assign` twice at the same moment (two instances) | One rider on the order; the other free | CONC | READY | `riderService.js` assign (only assigns if no rider yet) |
| DLV-004 | P0 | 20-minute packing; rider 3 minutes away | Accept; then 18 minutes later run the sweep | Not sent at accept; sent near the end of packing | INT | AUTO `nabz-dispatch-heatmap` (uncommitted) | `services/dispatchEngine.js` `shouldAssignNow` |
| DLV-005 | P0 | Rider assigned while packing | Rider taps "picked up" before ready, then after | 409 "still packing", then 200 | INT | AUTO `nabz-dispatch-heatmap` | `riderService.step` |
| DLV-006 | P0 | Rider heading to the store | Store cancels; sweep runs | Rider freed and told once | INT | AUTO `nabz-dispatch-heatmap` | `riderService.freeCancelled` |
| DLV-007 | P1 | Rider assigned | Rider releases the job | Next rider assigned; first not offered again; release lowers their score | INT + U | AUTO `nabz-rider-delivery`, `dispatch-engine.test.js` | — |
| DLV-008 | P0 | Riders A and B | B calls steps, release, or delivered on A's job | 404 every time | API / SEC | READY | `riderService.ownJob` |
| DLV-009 | P0 | COD order out for delivery | Deliver with the wrong code, then the right one | Refused, then delivered; cash to collect shown | INT | AUTO `nabz-rider-delivery` | — |
| DLV-010 | P1 | Batched trip of 2 drops | Deliver both | Pay = per drop + per road km + batch bonus, booked once each | INT | AUTO `nabz-rider-delivery` | `riderService.payFor` |
| DLV-011 | P1 | Waiting orders near a rider | `GET /rider/busy-areas`; `/care/staff/busy-areas` | Cells only (no addresses, names or order numbers) | INT | AUTO `nabz-dispatch-heatmap` | `services/heatmapService.js` |
| DLV-012 | P1 | Zone with 3 waiting orders and 0 free riders; then a manual ops level | Run `autoSurge` before and after ops sets HIGH | Automatic SEVERE; ops level never overridden | INT | AUTO `nabz-dispatch-heatmap` | `heatmapService.autoSurge` |
| DLV-013 | P1 | 5 delivered orders with real packing times | Run `learnEta` | Store's learned packing time replaces its guess in the ETA | INT | AUTO `nabz-dispatch-heatmap` | `heatmapService.learnEta` |
| DLV-014 | P1 | Rider stops sending heartbeats | 3+ minutes pass | Not offered new jobs | INT | READY | `FRESH_MS` |
| DLV-015 | P1 | Android device on a trip (MOB-QA) | Background the app, lock the screen, battery saver, airplane mode for 2 min, restore | Location resumes; steps queued or retried safely; no duplicate step | MAN | MANUAL | `frontends/mobile/lib/partnerOnline.ts` |
| DLV-016 | P1 | Nurses near a "Book now" visit | Offer, decline, accept; start without and with the visit code; SOS | Matches `nabz-matching-trust` expectations | INT | AUTO `nabz-matching-trust` | `services/dispatchService.js` |
| DLV-017 | P1 | Customer not reachable at the door | Rider uses "no code" with a reason | **Unknown:** no return-to-store flow found. PROD to define failed delivery | MAN | MANUAL | — |

### 10.11 Notifications and deep links (NOTIF) · owner BE-SDET

| ID | P | Preconditions and data | Steps | Expected | Layer | Status | Source |
|---|---|---|---|---|---|---|---|
| NOTIF-001 | P1 | One COD order taken to delivered | Read each party's notifications | Customer, store and rider each get their own events; nobody gets another person's | INT | READY | `models/notification.js` |
| NOTIF-002 | P1 | Registered device with an invalid FCM token (mocked) | Send a push | Token pruned; no retry loop | U | READY | `services/pushNotificationService.js:7-8` |
| NOTIF-003 | P1 | Same event fired twice | Restock twice; cancel-pickup sweep twice | One notification each | INT | AUTO `pharmacy-store-network-phase2`, `nabz-dispatch-heatmap` | — |
| NOTIF-004 | P1 | Push for order X on customer A's phone (MOB-QA) | Tap it; sign in as customer B and tap an old notification | Opens order X for A; B is refused | MAN | MANUAL (deep link handling not verified) | — |
| NOTIF-005 | P2 | Two users' notifications | `PUT /notifications/:id/read` and `DELETE /:id` on the other's | 404/403 | API | READY | `routes/notifications.js` |
| NOTIF-006 | P2 | Staging | Request a password reset | Email arrives | MAN | BLOCKED (SMTP not configured) | — |

### 10.12 Admin dashboard, roles and audit (ADM) · owner BE-SDET + SEC

| ID | P | Preconditions and data | Steps | Expected | Layer | Status | Source |
|---|---|---|---|---|---|---|---|
| ADM-001 | P0 | Tokens: admin, vendor, rider, reviewer, patient | Call every `/admin/ops/*` route | Only `platform_admin` gets through | API (table-driven) | READY | `routes/adminOps.js:34` |
| ADM-002 | P0 | Platform admin past the step-up window | Reveal contact, suspend, approve document, create campaign | Each asks for a fresh code first | API | AUTO `nabz-admin-mfa`, `nabz-admin-ops` | `requireRecentAuth` |
| ADM-003 | P0 | Logs with tokens, emails, phones | `GET /admin/ops/logs` | Secrets removed; contacts masked | INT | AUTO `nabz-admin-ops` | `utils/logBuffer.js` |
| ADM-004 | P1 | Admin | Reveal a contact; suspend an account | Each audited with reason and actor | INT | AUTO `nabz-admin-ops` | — |
| ADM-005 | P0 | Reviewer account | Sign in without an authenticator; with a non-domain email; open `/admin/ops/*` | Refused; refused (once domains are set); 403 | API | PARTIAL `tests/unit/services/onboarding-team-service.test.js` | `routes/onboarding.js`, `services/onboardingTeamService.js` |
| ADM-006 | P0 | Home-access document; two-admin rule on | The same admin approves twice | Second approval must come from a different admin | INT | AUTO `nabz-partner-verification` | — |
| ADM-007 | P1 | Admin | Create a zone with a self-intersecting polygon; set stress | Bad polygon rejected; stress set with expiry; `auto:false` | API | READY | `services/pharmacyAdminService.js:210` |
| ADM-008 | P1 | Admin | Approve or suspend a vendor; edit and merge a medicine; recall | Effects visible to customers and stores | INT | PARTIAL `pharmacy-store-network-phase2` | `/pharmacy/admin/*` |
| ADM-009 | P1 | Admin web (WEB-SDET) | Open `/admin?tab=payments` as admin and as platform admin | Tab shown only when allowed; others fall back | E2E-W | TOOLING | `frontends/web/app/admin/page.tsx:75-79` |
| ADM-010 | P1 | Admin web (WEB-SDET) | Open the Control tower; switch layers; table view | Map, totals and zones load; refresh every 30 s; no console errors | E2E-W | TOOLING | `frontends/web/app/admin/HeatmapPanel.tsx` (uncommitted) |
| ADM-011 | P1 | Admin | Issue a customer credit, a manual refund, change a setting | **Verify an audit record exists for each** | INT | READY | `/marketplace/admin/customers/:patientId/credit`, `/marketplace/admin/refunds`, `/marketplace/admin/settings` |

### 10.13 API validation, rate limits and errors (API) · owner BE-SDET + SEC

| ID | P | Preconditions and data | Steps | Expected | Layer | Status | Source |
|---|---|---|---|---|---|---|---|
| API-001 | P0 | Every write route | Wrong types, bad Mongo ids, over-long strings, missing required fields | 400 with field messages; no stack trace; nothing written | API (generated from route list) | READY | `middleware/validation.js` |
| API-002 | P0 | — | Log in with `{"email":{"$gt":""}}`; operators in query strings | Rejected or neutralised | API | READY | `express-mongo-sanitize` in `app.js` |
| API-003 | P0 | API started with `NODE_ENV≠test` and limits on | Hit `/auth/login` and `/auth/social/phone/start` past the limit | 429 at the configured limit; limits shared across instances | INT (separate config) | AUTO `rate-limits-enabled` | `app.js:143-163`, `middleware/rateLimitEnhanced.js` |
| API-004 | P1 | — | `GET /api/pharmacy/vendors/nearby` | Redirected to `/api/v1/...` | API | READY | `middleware/apiVersion.js` |
| API-005 | P1 | Staging | Origin allowed / not allowed | CORS allows only `ALLOWED_ORIGINS` | API | PARTIAL `scripts/smoke-deployed-auth-cors.js` | — |
| API-006 | P1 | Production mode | Force a 500 | Generic message; correlation id; no internals | API | READY | `middleware/errorHandler.js` |
| API-007 | P1 | — | `/internal/tick` without or with a wrong secret; `/staging/*` outside staging | 401 / route absent | API | AUTO `nabz-internal-tick` (tick) / READY (staging) | `routes/internal.js:15-19`, `routes/stagingWebAuthnSmoke.js:7` |
| API-008 | P1 | No token, and a patient token | Call every legacy route (`/duties`, `/calendar`, `/hospital-settings`, `/health-records`, `/doctor-access`…) | All need auth and the right role; none leaks data | API (sweep) | READY | `routes/v1/index.js:80-154` |
| API-009 | P2 | — | List endpoints with `limit=10000` | Capped | API | READY | `middleware/pagination.js` |
| API-010 | P1 | Prescription and document uploads | Upload `.exe` renamed `.jpg`, 20 MB, a valid image; open another user's file | Rejected by content sniffing and size; valid stored privately; other user's file refused; links expire | API / SEC | READY | `middleware/uploadEnhanced.js`, `file-type` |

### 10.14 Offline, retries, crash recovery and idempotency (RES) · owner BE-SDET + MOB-QA

| ID | P | Preconditions and data | Steps | Expected | Layer | Status | Source |
|---|---|---|---|---|---|---|---|
| RES-001 | P0 | Shared client | Same money request twice in flight; again within 2 min | One network call; same idempotency key reused | U | AUTO `frontends/mobile/lib/repeatGuard.test.ts` | `frontends/shared/src/repeatGuard.ts` |
| RES-002 | P0 | "Place order" sent; response lost | Client retries with the same key | Same order returned | INT | AUTO `double-tap-safety` (passing since the D1 fix) | `idempotency.js` |
| RES-003 | P1 | Network throttled to slow 3G / offline (MOB-QA, WEB-SDET) | Place an order, cancel, accept an offer | Spinner, then a clear retry; no duplicate actions | MAN / E2E-W | TOOLING / MANUAL | — |
| RES-004 | P1 | Redis stopped | Use the API | Still serves; rate limits fall back | INT | PARTIAL `tests/unit/infrastructure/rate-limit-redis-integration.test.js` | `config/redis.js` |
| RES-005 | P1 | Replica set; primary stepped down mid "place order" | Place | Either a whole order or none; no stock leak | INT | READY (`docker-compose.replica-test.yml`) | — |
| RES-006 | P1 | Tick stopped for 10 minutes | Restart the tick | Expiries, reassignments and rider assignments catch up in one or two runs | INT | READY | `services/cronService.js` |
| RES-007 | P1 | Process killed right after an order turns ready | Next tick | Rider assignment happens anyway (sweep) | INT | READY | `pharmacyService.js:671`, `riderService.sweep` |
| RES-008 | P2 | Phone clock set 2 hours ahead (MOB-QA) | OTP, payment hold, offers | Server time decides; nothing breaks | MAN | MANUAL | — |
| RES-009 | P1 | App killed mid-checkout (MOB-QA) | Reopen | No duplicate order; order list shows the true state | MAN | MANUAL | — |

### 10.15 Accessibility, responsive UI and compatibility (UX) · owner WEB-SDET + MOB-QA

| ID | P | Preconditions and data | Steps | Expected | Layer | Status | Source |
|---|---|---|---|---|---|---|---|
| UX-001 | P1 | Production web build | Visit the 12 main pages at 1440 px and 390 px | 200; no script errors; no sideways scroll | E2E-W | TOOLING (56-check script exists outside the repo) | `frontends/web/app/*` |
| UX-002 | P1 | Keyboard only; screen reader | Sign in, checkout, admin tables | Every control reachable and labelled; focus visible | E2E-W + MAN | TOOLING | — |
| UX-003 | P1 | Android matrix (MOB-QA): oldest supported, mid-range, latest; small and large screens | Customer COD journey; rider trip; TalkBack basics | Works on each; text not clipped | MAN | MANUAL | `android/` |
| UX-004 | P2 | — | Contrast of text on brand surfaces | WCAG AA for body text | E2E-W | TOOLING | `frontends/web/app/globals.css` |
| UX-005 | P2 | Hindi selected (MOB-QA) | Main screens | Strings translated and fit | MAN | MANUAL | `frontends/mobile/lib/i18n.tsx` |
| UX-006 | P2 | Nurse, rider and store accounts | Open the Partner app | Each sees only its tabs | U + MAN | AUTO `partnerTabs.test.ts` + MANUAL | `frontends/mobile/lib/partnerTabs.ts` |
| UX-007 | P2 | Easy mode on (MOB-QA) | Main journeys | Larger text; same results | MAN | MANUAL | `frontends/mobile/lib/easyMode.tsx` |

### 10.16 Performance, security, observability, backup (NFR) · owner PLAT + SEC

| ID | P | Preconditions and data | Steps | Expected | Layer | Status | Source |
|---|---|---|---|---|---|---|---|
| PERF-001 | P1 | Staging, approved window, synthetic data | Journey load: nearby → search → cart plan → COD order at forecast peak | Meets p95/p99 and error-rate targets (**targets to be agreed**) | PERF | BLOCKED | — |
| PERF-002 | P1 | Same | Spike: push-notification burst on nearby and search | No errors beyond target; recovers | PERF | BLOCKED | — |
| PERF-003 | P1 | Local replica set | 100 parallel last-unit orders; 20 parallel rider assigns | Still exactly one winner each | CONC | READY | INV-001, DLV-003 |
| PERF-004 | P2 | Staging | 4-hour soak at baseline | Memory flat; no lease or tick drift | PERF | BLOCKED | — |
| PERF-005 | P1 | Local, production-size synthetic data | `explain()` on nearby, search, order list and the rider `$geoNear` | Indexes used; no collection scans on hot paths | INT | READY | `models/*` indexes |
| SEC-001 | P0 | Two customers, two stores, two riders, two nurses | Swap ids across orders, lab orders, bookings, family care logs, chat, documents | Every cross access refused | SEC (API) | READY | ORD-010, STORE-002, DLV-008 |
| SEC-002 | P0 | — | Register or update a profile with `role: platform_admin`, `isVerified: true` | Ignored | SEC | READY | `routes/auth.js:24,29`, `routes/patient.js` |
| SEC-003 | P0 | — | Order with quantity 0, -1, 1e9; a different `vendorId` mid-flow; `paymentMode:"FREE"` | Rejected | SEC | READY | `createOrderValidation` |
| SEC-004 | P1 | — | Tokens with `alg:none`, wrong issuer, wrong audience, patient token on staff routes | 401 | SEC | READY | `utils/authTokens.js` |
| SEC-005 | P1 | Built APK (MOB-QA) | Inspect for secrets and cleartext traffic settings | No secrets; HTTPS only | MAN | MANUAL (gitleaks covers the repo: AUTO in CI) | — |
| SEC-006 | P1 | — | `npm audit` for root **and** `frontends/*` | No high or critical issues without a waiver | CI | PARTIAL (root only in CI) | `.github/workflows/ci.yml` |
| SEC-007 | P1 | Written approval for staging | OWASP ZAP baseline | No high findings without a waiver | SEC | BLOCKED | — |
| SEC-008 | P1 | Device (MOB-QA) | MASVS storage, network and platform checks | Tokens only in SecureStore; none in logs | MAN | MANUAL | `frontends/mobile/lib/auth.tsx` |
| OBS-001 | P1 | — | Any request | Response and logs share one request id | API | READY | `middleware/requestId.js` |
| OBS-002 | P1 | Staging | Stop the tick | CloudWatch alarm fires (per docs) | MAN | MANUAL | `docs/NABZ_PROJECT_DOCUMENTATION.md` §12 |
| OBS-003 | P1 | Staging | Health check after deploy | Reports the deployed commit | API | PARTIAL `scripts/smoke-deployed-health-commit.js` | — |
| DR-001 | P1 | Staging snapshot | Restore into a scratch cluster and run the smoke suite | Restores within the agreed RTO (**to be agreed**) | MAN | BLOCKED | `.github/workflows/backup-restore-verify.yml` |
| DR-002 | P2 | Staging | Roll back to the previous App Runner image | Service healthy on the old version | MAN | MANUAL | `terraform/apprunner-staging/` |

---

## 11. Coverage summary

191 cases. Each is counted once, under the first status in its row.

| Status | All | P0 | P1 | P2 |
|---|---|---|---|---|
| AUTO | 64 | 33 | 28 | 3 |
| AUTO-FAIL | 0 | 0 | 0 | 0 |
| PARTIAL | 23 | 11 | 12 | 0 |
| READY | 68 | 31 | 33 | 4 |
| TOOLING | 12 | 1 | 8 | 3 |
| BLOCKED | 7 | 1 | 4 | 2 |
| MANUAL | 17 | 0 | 11 | 6 |
| **Total** | **191** | **77** | **96** | **18** |

**Cases per area:**
- AUTH 21, PAY 20, DLV 17, ORD 15
- LOC 11, INV 11, ADM 11, API 10
- CAT 9, PRICE 9, STORE 9, RES 9, CART 8, SEC 8, UX 7, NOTIF 6, PERF 5, OBS 3, DR 2

AUTO cases sit mostly in pharmacy store-network, rider and dispatch, admin MFA and ops, and partner verification. The biggest gaps:
- **Cross-account access:** ORD-010, STORE-002, DLV-008, SEC-001 are all READY, none automated.
- **Last-unit concurrency:** INV-001, DLV-003, PERF-003.
- **The order state-machine table:** ORD-001.
- **Rate limits with limits switched on:** API-003.
- **Everything on the Next.js site and the apps:** TOOLING and MANUAL.

## 12. Not built, so not tested

These playbook areas have no code in Nabz today. Each needs product sign-off before it gets tests.

| Playbook area | Nabz today |
|---|---|
| Coupons, stacking, usage limits | No redemption engine. Campaign `offerCode` is display-only (`services/campaignService.js:50`). Wallet credit and Plus waivers exist |
| Handling, packaging, small-cart and surge fees | Only the delivery fee. "Surge" shrinks delivery radius; it doesn't change the price |
| Categories, filters, variants | One product per brand, strength and pack; search only |
| Dark-store picking, bins, picker roles | Independent chemists use accept → preparing → ready |
| Live rider tracking for medicine orders | Not built (plan item 1.3). Home visits do have tracking |
| Payment webhooks | Not built; required before Razorpay (gate 6) |
| SMS OTP in production | No SMS provider; phone sign-in is off on staging |
| Server-side cart, multi-device cart | Cart is client-only |

## 13. Open questions

1. ~~**Legacy scope.**~~ **Answered 2 Nov 2026:** the legacy hospital modules stay in the plan. API-008 stays as written, the failing legacy tests (D2) get fixed, and a legacy inventory (duties, calendar, hospital settings, health records, doctor access, `client/`) is added in the next revision.
2. **Mobile cart:** is losing the cart when the app closes acceptable (CART-005)?
3. **Store stock counts:** when a store sets its stock count, should orders in flight be subtracted (INV-008)?
4. **Failed delivery:** what should happen when the customer can't be reached (DLV-017)?
5. **Performance:** what are the performance targets and the forecast peak (PERF-001)?
6. **Staging approval:** is load and DAST testing on staging approved, and when (PERF, SEC-007)?
7. **iOS:** is there an iOS release? The device matrix is Android-only today.
