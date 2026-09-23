# MedRush — Project Context (handoff for a fresh IDE / Claude Code session)

Read this first. It is a **self-contained** brief: what the project is, where it
lives, how it's wired, what's built, the bugs already fixed (don't reintroduce
them), how to run it, and what's next. Deep detail is in the repo under `docs/`.

_Last updated: 2026-09-23 (Razorpay checkout, AWS deployment, quick-commerce data model)._

---

## 0. Where the code is

- **Repo (worktree currently in use):**
  `C:\Users\ASUS\OneDrive\Desktop\personal\project\.claude\worktrees\pharmacy-vendor-app-website-12957b`
- Branch: `claude/pharmacy-vendor-app-website-12957b`. **Nothing committed yet.**
- Backend deps resolve from the parent checkout's `node_modules` (this worktree
  has none of its own). `node`, `npx eslint`, `npx jest` work; **`npm test` does
  NOT** (its script hardcodes `./node_modules/jest`). Use
  `npx jest --config jest.fast.config.js` instead.
  Known worktree-only failure: `shared-package-lazy-load.test.js`
  (`@nocturnal/shared` resolves to the parent checkout's `packages/shared`). Passes in CI.
- Docs: `docs/MEDRUSH_PHARMACY_MARKETPLACE_PLAN.md` (roadmap),
  `docs/MEDRUSH_DATA_MODEL.md` (**data model + quick-commerce design principles**),
  `docs/MEDRUSH_AWS_DEPLOYMENT.md` (**AWS runbook**), `docs/MEDRUSH_GETTING_STARTED.md`.
- Integration tests (`tests/integration/*`) need a real MongoDB via `MONGODB_URI` and skip
  otherwise. `mongodb-memory-server` is in the parent `node_modules` (not a declared dep).
  Start one, then set `MONGODB_URI` and run `npx jest --config jest.config.js tests/integration/medrush-data-model.test.js`.

### ⚠️ Competing uncommitted work in the MAIN checkout
The parent checkout (`...\project`, branch **`main`**) has **staged, uncommitted**
Phase-4-style work that was NOT made in this worktree: lab/consult/emergency
models+routes, `staffLocation`, `geoDispatchService`, `socketTrackingService`,
`prescriptionService`. It overlaps this branch (`constants/enums.js`,
`models/user.js`, `models/patient.js`, `routes/v1/index.js`) and **contradicts
decisions/fixes here**:
- makes `medical_staff`/`phlebotomist` **self-registerable** (adds them to
  `REGISTRATION_ROLES`). ⚠️ Security: these roles must stay admin-verified.
- gives `User.currentLocation` `default: 'Point'` + `coordinates default [0,0]`,
  which puts every user at Null Island and pollutes nearest-staff queries (see bug #1).
- adds roles to `enums.js` but **not** `constants/roles.js` (so `authorize()` rejects them).
- different enum values (`MISSED` vs `NO_SHOW`, `HORMONES` vs `HORMONE`, no `CANCELLED` sample status),
  `availabilityStatus` vs `isAvailable`, `servicesOffered` ObjectId vs String.
Reconcile before merging either line. Don't commit that work to `main` (hooks block it anyway).

---

## 1. What we're building

A quick-commerce **healthcare super-app + website**. Fulfilment is a **marketplace
of local pharmacy vendors** (aggregator like Swiggy, NOT company-owned dark stores
like Zepto/Blinkit). Verticals: **pharmacy medicine delivery** (primary) + home
nursing + lab tests + doctor consult + emergency SOS.

- **Backend:** existing "Nocturnal" **Node/Express 5 + Mongoose 9 + MongoDB** monolith (reused).
- **Web:** **Next.js 15** (App Router, TS) — `frontends/web`.
- **Mobile:** **React Native via Expo** (expo-router, TS) — `frontends/mobile` (scaffolded, not run yet).
- **Shared:** `@medrush/shared` typed API client + domain types — `frontends/shared`.

Locked decisions: full breadth, web+mobile in parallel, vendors **admin-seeded +
vendor dashboard**, payment prepaid (SOS post-pay), lab catalog in-house for MVP,
consult chat/audio first (video later).

---

## 2. Status

### DONE — Phase 1 (backend foundation + scaffolds)
- New roles in **both** `constants/roles.js` and `constants/enums.js#STAFF_ROLES`:
  `pharmacy_vendor`, `delivery_partner`, `medical_staff`, `phlebotomist`
  (NOT self-registerable — `/auth/register` validates `REGISTRATION_ROLES`).
- New enums in `constants/enums.js`: medicine forms/schedule/categories, pharmacy
  order + vendor statuses, delivery statuses, lab categories/sample types/statuses,
  consultation types/statuses.
- New models: `models/{pharmacyVendor,medicine,vendorInventory,pharmacyOrder}.js`.
- Extended (additive): `models/user.js` (pharmacyVendor ref, currentLocation
  [2dsphere], isOnline/isAvailable, vehicle, servicesOffered), `models/patient.js`
  (emergencyContacts[], preferredLanguage). The `apps/patient-health` mirror of
  `constants/{enums,roles}.js` + `models/patient.js` is synced (enforced by
  `app-mirror-integrity.test.js`; re-copy whenever you edit those root files).
- `services/pharmacyService.js` (atomic stock reservation + rollback, price
  snapshots, `VENDOR_STATUS_TRANSITIONS` state machine), `services/pharmacyAdminService.js`.
- `controllers/pharmacyController.js`, `routes/pharmacy.js` wired at
  `/api/v1/pharmacy` in `routes/v1/index.js`.
- Frontend scaffolds: `frontends/shared`, `frontends/web`, `frontends/mobile`.
- Seeds: `scripts/seedPharmacyMarketplace.js` (`npm run db:seed:pharmacy`; vendor
  login `vendor.koramangala@medrush.test`; password = `SEED_DEMO_PASSWORD` from your local `.env`).

### DONE — Phase 2 (auth + checkout + admin), verified live in a browser
- **Patient auth (cookie session):** `frontends/web/lib/auth.tsx`, `app/login`,
  `app/register`, nav in `app/_components/SiteNav.tsx`.
- **Cart:** `lib/cart.tsx` (single-vendor, localStorage) wired into `app/pharmacy`.
- **Checkout:** `app/checkout`: address prefilled from profile, prescription upload
  for Rx carts, then **online (Razorpay) or COD**.
- **Orders:** `app/orders` (list) + `app/orders/[id]` (status timeline, polling, cancel, **Pay now**).
- **Vendor dashboard:** `app/vendor/login` + `app/vendor` (cookie/staffMe-gated,
  accept/reject/prepare/ready orders).
- **Admin console:** `app/admin/login` + `app/admin` (approve/suspend vendors, add
  medicines to master catalog).
- **Backend:** patient prescription upload `POST /api/v1/pharmacy/prescriptions`
  (`protectPatient` + `uploadPrescription` multer middleware in `middleware/upload.js`).
- Seeds: `scripts/seedAdmin.js` (`npm run db:seed:admin`).

### DONE — Plan step 1: Razorpay prepaid checkout (unit-tested; not yet run against live Razorpay test keys)
- `utils/razorpayGateway.js`: lazy SDK client, same feature flag as `/payments-b2c`
  (`RAZORPAY_KEY_ID`+`SECRET` set, `RAZORPAY_ENABLED !== 'false'`), constant-time
  HMAC signature check, `toPaise`.
- `services/pharmacyPaymentService.js`: create/reuse the Razorpay order, verify, record failure,
  refund, and the unpaid-order expiry sweeper (`startExpiryWorker`, started and stopped in
  `server.js` next to the refund-outbox worker, gated on DB readiness).
- Rules (all compare-and-set updates):
  - A PREPAID order reserves stock and sets `paymentExpiresAt` (`PHARMACY_PAYMENT_TTL_MINUTES`, default 15).
  - It is **hidden from the vendor** (list, detail, and status changes) until `paymentStatus=PAID`.
  - Verify = order-id match + HMAC + server re-fetch of the payment (order_id/amount/currency/status).
    An `authorized` payment is **captured** before it is marked PAID.
  - The sweeper **asks Razorpay first**: a paid-but-unverified order becomes PAID. Otherwise it is
    cancelled (`cancelledBy: SYSTEM`) and restocked. If the gateway is unreachable, the order is
    skipped for that round, not cancelled.
  - Cancel or reject of a PAID order → automatic full refund. A PAID-after-cancel payment is also refunded.
    Refund failure → `REFUND_PENDING` + `razorpay.refundError` (manual reconcile) and a monitoring alert.
  - PREPAID is refused with a clear message when Razorpay is off, so COD is the only option.
- `PharmacyOrder` gained `paymentExpiresAt`, `razorpay{orderId,paymentId,paidAt,failureReason,refundId,refundedAt,refundError}`,
  `paymentStatus` `REFUND_PENDING`, plus 2 indexes (run `npm run db:indexes`). The legacy `Payment`
  model is for staff payouts (requires duty/doctor/hospital), so it is **not** linked.
- Web: `lib/razorpay.ts` (`payForOrder`), checkout payment choice, order page **Pay now** + payment/refund status.
- Tests: `tests/unit/pharmacy/pharmacy-payment-service.test.js` (20 tests);
  `server-startup-readiness.test.js` covers the sweeper lifecycle.

### DONE — AWS-ready from day one (validated, not yet applied to a real account)
- Target: **ap-south-1**, ECS Fargate API behind ALB + WAF, **MongoDB Atlas on AWS** (not
  DocumentDB: we need `$near`/`$geoNear`/`$text`), S3 uploads, ElastiCache Redis (TLS+AUTH),
  Secrets Manager, **Amplify Hosting** for Next.js, GitHub OIDC deploy role (no static keys).
- `terraform/` rewritten (old `main.tf` was never applied and couldn't plan). Split files,
  per-env backends (`backend/*.hcl`) and `environments/*.tfvars.example`. `terraform validate` passes
  for the main stack and bootstrap. Runbook: `docs/MEDRUSH_AWS_DEPLOYMENT.md`.
- **S3 upload backend** (`config/storage.js`, `STORAGE_PROVIDER=s3` + `S3_UPLOADS_BUCKET`):
  streams through the magic-byte validator, SSE-S3/KMS, 5-min presigned reads, task-role
  credentials. Local parity: **MinIO** in `docker-compose.yml` (named volumes, cross-platform).
- Deploy workflow: OIDC auth, image mirrored GHCR→ECR by digest, `scripts/add-indexes.js` run as
  a one-off ECS task before rollout (now also builds all MedRush model indexes). Dockerfile copies `scripts/`.
- Containers are stateless: data = Atlas (docs), S3 (files), Redis (cache), Secrets Manager.

### DONE — Quick-commerce data model (see `docs/MEDRUSH_DATA_MODEL.md` §0)
- `ServiceZone` (polygons + stress lever: rain/rider shortage shrinks radius; pause zone) +
  `services/serviceabilityService.js` ($geoNear; **store's own radius now enforced**; radial fallback).
  Admin: `GET/POST /pharmacy/admin/zones`, `PATCH /pharmacy/admin/zones/:id`.
- `geohash` on vendors / `deliveryGeohash` on orders (`utils/geohash.js`).
- Orders snapshot `zone`, `distanceKm`, `eta` (per-leg promise) and `milestones` (per-leg actuals).
  Checkout rejects out-of-range delivery points (web now sends the customer's real GPS fix).
- `InventoryMovement` append-only stock ledger (reserve / release / adjustment).
- Tests: `tests/unit/pharmacy/serviceability.test.js`, `tests/integration/medrush-data-model.test.js` (7, real Mongo).

### DONE — Mobile app (Expo) + vendor notifications (2026-09-23)
- `utils/mobileAuth.js`: Expo native clients (`X-Nocturnal-Mobile: expo`, **no** Origin /
  Sec-Fetch-* headers) get bearer tokens in the login/refresh body. Browsers never do (cookies only).
- `services/pharmacyNotificationService.js`: new order → `Notification` (type
  `PHARMACY_ORDER_NEW`) + FCM push to every store account. Fired for COD at placement and for
  PREPAID when payment is captured. Never throws.
- CORS: a disallowed origin now gets **403** (was 500 plus an error log).
- `frontends/mobile`: login (customer/store) + sign-up, SecureStore session, silent token
  refresh (access tokens last 15 min), store order queue with alerts (10 s polling + FCM),
  COD checkout + Rx photo, a permissions screen, server picker (preview builds only).
  `app.config.js` (replaces app.json), `eas.json` (preview APK / production AAB). README = testing guide.
- Seed adds demo patient `patient.demo@medrush.test` (LOCAL DEV ONLY; password = `SEED_DEMO_PASSWORD`).
- Tests: `tests/integration/medrush-mobile-flow.test.js` (login, CORS, notification; real Mongo).
- Local APK build: copy `frontends/{mobile,shared}` to a short non-OneDrive path (C:\mrb),
  JDK 21 (`C:\Program Files\Android\openjdk\jdk-21.0.8`), `expo prebuild` + `gradlew assembleRelease`.
  Java can't download Gradle here (timeouts), so the wrapper uses the cached 8.14.3.
  AVD `MedRush_API_35` was created by hand (no Android Studio/cmdline-tools installed).

### DONE — Home-care booking ↔ pharmacy link, separate portals, Uber-style UI (2026-09-23)
- **Supplies**: `ServiceCatalog.supplies[]` (linked to pharmacy products by `medicineSlug`). Per item
  the patient picks PATIENT_HAS / STAFF_BRINGS. STAFF_BRINGS → `services/careSuppliesService.js`
  creates a `PharmacyOrder` with `fulfilment: STAFF_PICKUP` + `careVisit` (no delivery fee, no basket
  minimum, COD), linked from `NurseBooking.supplies`. The store is notified ("Nurse pickup"), and the
  nurse sees the pickup store in `/bookings/provider/me`. Cancelling the booking cancels and restocks the order.
  Public API: `GET /care/services`, `GET /care/supplies/quote`. Test: `tests/integration/medrush-care-booking.test.js`.
- **Bug fixed**: `createBooking` read `serviceLocation.city` (never sent), so every booking in a city-limited
  service failed "not available in the requested city".
- **Separate logins** (`constants/portals.js`): `/auth/login` takes `portal` (staff | pharmacy | lab | rider | admin)
  and returns 403 for other roles *before* any session/cookie. New role `lab_partner`. `medical_staff` can use
  the provider booking routes. Customers stay on `/patients/login` (separate Patient model).
  Partner accounts are NOT self-registrable (admin-created after verification).
- Demo logins (LOCAL DEV ONLY, `npm run db:seed:pharmacy`): patient.demo@medrush.test,
  nurse.demo@medrush.test, lab.demo@medrush.test, vendor.jaipur@medrush.test; all use `SEED_DEMO_PASSWORD` from your local `.env`.
- **Mobile UI**: royal-blue theme, bottom tabs (Home = book medical staff with a Leaflet/OSM map in a WebView,
  Pharmacy, Bookings, Account), booking flow `app/book.tsx` (supplies checklist → date/slots → details →
  confirm modal → booked/failed screen). Partner areas: `/vendor`, `/staff`, `/lab`. Icon fonts didn't render
  in release builds, so the app uses emoji and text glyphs.
- **Web UI**: same tokens; home = booking panel + OSM map; `/nursing`, `/staff`, portal logins
  (`/staff/login`, `/vendor/login`, `/lab/login`, `/admin/login`) via `app/_components/PortalLogin.tsx`.
- OSM tiles are fine for dev/pilot only. Use a paid tile provider (or Google Maps with a key) before launch.

### DONE — Brand: **Nabz** (2026-09-23)
- User-facing name is **Nabz** (नब्ज़ = pulse). The internal code name stays MedRush (packages `@medrush/*`,
  env vars, Android package `app.medrush.mobile`); change the package only when creating the Play Store listing.
- Logo: `frontends/web/public/brand/nabz-{icon,logo,logo-dark}.svg` (map pin + pulse line, royal blue #1f45e0,
  coral dot #ff5a3c). App icon/splash PNGs: `frontends/mobile/assets/` (rendered from the SVGs with headless Edge).
  Review page: `/brand`. Before launch, have a designer outline the wordmark (it uses live text) and run a trademark search.
- No emojis in the UI: Lucide line icons (`lucide-react` / `lucide-react-native` + `react-native-svg`) in tinted
  tiles (`frontends/web/app/_components/icons.tsx`, `frontends/mobile/lib/icons.tsx`).

### DONE — Matching, trust layer, sign-in, two apps, premium UI (2026-09-23)
- **Two apps, one codebase** (`frontends/mobile`): `APP_VARIANT` unset → **Nabz** (customers, `app.medrush.mobile`);
  `APP_VARIANT=partner` → **Nabz Partner** (staff/pharmacy/lab, `app.medrush.partner`, midnight+gold icon).
  `lib/variant.ts` (`IS_PARTNER_APP`). EAS profiles `preview`/`partner-preview`/`production`/`partner-production`.
- **Uber-style matching** (`services/dispatchService.js`): Book now → offer to nearest discoverable staff for 45 s →
  accept/decline (CAS) → next; sweeper every 10 s; scheduled visits dispatch 60 min before; NO_STAFF after 8 tries/10 min.
  Routes: `GET /bookings/offers/me`, `POST /bookings/:id/offer/{accept,decline}`.
- **Trust layer**: 4-digit visit code (`visitOtp`, `select:false`, patient-only in `/tracking`; nurse must enter it to
  start, locks after 5 misses), `careProfile` + verification badges (admin: `PATCH /partners/admin/staff/:id/verification`),
  SOS `POST /bookings/:id/sos` (alerts platform_admins), public family link `GET /care/track/:token` (first name only),
  preferred gender, review tags.
- **Customer sign-in**: phone OTP + Google (`routes/socialAuth.js`, `services/socialAuthService.js`); customers only.
  Production needs `SMS_PROVIDER` (dev logs the code) and `GOOGLE_OAUTH_CLIENT_IDS` + app `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID`.
- **Partner onboarding**: `POST /partners/apply` → admin review queue; logins still created by ops (no self-assigned roles).
- **Home feed** `GET /care/home` (banners only for real offers, packages, popular); **staff dashboard** `GET /care/staff/dashboard`.
- **App UI**: midnight `#0a0f24` / ivory `#f6f7fb`, Instrument Serif + Manrope embedded (`@expo-google-fonts/*`),
  dark mode follows the phone at launch (`lib/theme.ts`), Hindi/English (`lib/i18n.tsx`), haptics/skeleton/radar
  (`lib/motion.tsx`). Screens: `welcome`, `phone` (OTP + profile), `partner`, `partner-apply`, redesigned Home,
  `book` (now/schedule, preference, bill), `track` (radar → nurse card + code + badges + route + share + SOS → rating),
  `staff` (online switch, earnings, offer card with countdown, demand, code entry, complete).
- **Web**: `/track/[token]` family tracking page.
- Tests: `tests/integration/nabz-matching-trust.test.js` (phone OTP, Google disabled, dispatch offer/decline/accept,
  visit code gate, SOS, family link, partner apply/review, dashboard, home feed).

### NOT done yet
- Health vault, referrals, tips (need backend + payments), 3D icon pack, paid map tiles, web redesign to the new palette.
- **Razorpay webhook** (`payment.captured`/`refund.processed`). The sweeper's reconcile covers
  closed tabs within the TTL. A webhook would also cover a patient who cancels an unpaid order while
  a payment is in flight and never returns (money captured, no verify → needs manual refund today).
- Mobile: online payment (react-native-razorpay) not in the app yet (COD only). Server push
  when the app is closed needs Firebase: `frontends/mobile/google-services.json` + backend
  `FIREBASE_PUSH_ENABLED=true` + `GOOGLE_APPLICATION_CREDENTIALS`. Patients get no status push yet.
- Real-time (Socket.IO) — NOT in this branch; order tracking uses polling.
- Lab / consult / emergency models + UIs in this branch (see the main-checkout note in §0).
- Integration/load tests against a real MongoDB.

### Admin login (LOCAL DEV ONLY)
Email/password come from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in your local `.env` (role `platform_admin`), seeded by
`scripts/seedAdmin.js`. ⚠️ Change before any public deploy.

---

## 3. 🐛 Bugs already found & fixed — DO NOT reintroduce
1. **GeoJSON partial default** — giving a GeoJSON sub-field's `type` a
   `default: 'Point'` creates a coordinate-less `{type:'Point'}` on every doc
   without a location, which a `2dsphere` index rejects (breaks inserts). Keep
   `type`/`coordinates` with **no defaults**; set both together or omit the field.
   (Applies to `User.currentLocation`, `PharmacyVendor.location`, `PharmacyOrder.deliveryLocation`.)
2. **Mongoose pre-hooks take NO `next` here** — use synchronous/`async` (no-arg)
   hooks. `function hook(next){...next()}` throws `next is not a function` under
   `insertMany`/`.create()`. (See `models/{medicine,vendorInventory,pharmacyOrder}.js`.)
3. **Bundler imports must be extensionless** in `frontends/shared/src/*` (use
   `./types`, not `./types.js`) — Next/Metro can't resolve `.js` against `.ts`.
4. **Native `fetch` must be bound to global** — the shared client binds
   `fetch.bind(globalThis)`; calling `this.fetchImpl(...)` unbound throws
   "Illegal invocation" in the browser.
5. **Timer workers must never throw** — an error thrown from a `setInterval`
   callback's catch block (e.g. a mocked `monitoring` without `trackError`) is an
   unhandled rejection that kills the process. Guard error reporting in workers.
6. **Jest `resetMocks: true`** (jest.config.js) wipes `jest.fn(() => …)` factory
   implementations before every test. Re-arm mock return values in `beforeEach`.
7. **"Listed" ≠ "in stock"**: stock level must never flip `VendorInventory.isAvailable`
   (the vendor's listing intent). The old save hook delisted items at 0 stock, and
   `restockOrder` re-listed on every cancel, overriding vendors.
8. **Serviceability must enforce each store's `serviceRadiusKm`**. The old `$near` query only
   used the search radius, so a 3 km store showed for a customer 7 km away.
9. **Prescriptions**: orders carry the upload's storage **key** (validated as the patient's own,
   `prescriptions/<patientId>/…`) and are read via access-checked `…/orders/:id/prescription`.
   The old `isURL()` check rejected the relative upload URL (every Rx order 400'd), and the
   generic file route 404'd prescriptions for everyone.
10. **Don't mix Mongoose `autoIndex` with explicit `createIndexes()`** after `models/user.js` is
    loaded: it can stall. Scripts and tests that build indexes connect with `autoIndex: false`.
Regression tests: `tests/unit/pharmacy/*.test.js`, `tests/unit/infrastructure/s3-upload-storage.test.js`,
`tests/integration/medrush-data-model.test.js`.

---

## 4. Architecture facts you must know
- **All API routes** are under `/api/v1`, composed in `routes/v1/index.js`. Add a
  per-domain router in `routes/`, wire it there — **never mount in `app.js`**.
- **Two identities:** `Patient` (B2C, `middleware/patientAuth.js` → `protectPatient`)
  and `User` (all staff/partner roles, `middleware/auth.js` → `protect` +
  `authorize(...roles)`). `authorize` validates roles via `constants/roles.js`.
- **Enums/roles are the single source of truth** — edit `constants/enums.js`
  (+ `constants/roles.js` for roles) and both Mongoose and express-validator stay in sync.
- **Thin controllers → services.** Services throw typed errors from `utils/errors.js`
  (`NotFoundError`/`ValidationError`/`ConflictError`/`AuthorizationError`/`PaymentError`). Controllers
  respond via `utils/responseHelper` (`sendSuccess`/`sendCreated`/`handleServiceError`).
  `sendSuccess` **spreads** the data object into the top-level JSON.
- **Model export guard:** `module.exports = mongoose.models.X || mongoose.model('X', S)`.
- **Circular require:** `pharmacyService` imports `pharmacyPaymentService`; the latter
  lazy-requires `pharmacyService` (for `restockOrder`) inside the sweeper. Keep it that way.
- **Frontends isolated** under `frontends/` (NOT in root npm `workspaces`) to keep
  the CI-gated backend clean. `@medrush/shared` imported from source: web via tsconfig
  paths + `experimental.externalDir`; mobile via babel-plugin-module-resolver + metro
  `watchFolders` + tsconfig paths.
- **DB = MongoDB.** "Tables" = collections; a Mongoose schema *is* the table (no
  migration to create it). Only **indexes** are migrated (`npm run db:indexes`).
- Redis / Razorpay / Firebase / S3 are optional and degrade gracefully. On AWS, S3 is
  required in practice (container disks are ephemeral); `STORAGE_PROVIDER=s3` is set by Terraform.
- **Mirrors**: `apps/patient-health/` holds copies of `constants/{enums,roles}.js`,
  `models/patient.js`, `controllers/patientAnalyticsController.js` and
  `services/investigationReportService.js`. Apply every edit to both (`app-mirror-integrity.test.js`).

---

## 5. Data model (collections)
- **PharmacyVendor** — store: name, owner(User), drugLicense/gstin, address,
  location[GeoJSON 2dsphere], serviceRadiusKm, operatingHours, isOpen, status
  (PENDING/APPROVED/SUSPENDED/REJECTED), deliveryFee, minOrderValue, rating.
- **Medicine** — master catalog: name, genericName, form, strength, packSize,
  scheduleType (OTC/PRESCRIPTION/…), category, requiresPrescription, referenceMrp.
- **VendorInventory** — join (vendor×medicine): mrp, sellingPrice, stockQty,
  isAvailable; unique `{vendor,medicine}`.
- **PharmacyOrder** — patient, vendor, items[] (price-snapshotted), prescription,
  status (`PLACED→ACCEPTED→PREPARING→READY_FOR_PICKUP→OUT_FOR_DELIVERY→DELIVERED`,
  or `REJECTED`/`CANCELLED` which restock), deliveryAddress, rider, amounts,
  paymentMode (PREPAID/COD), paymentStatus (PENDING/PAID/FAILED/REFUND_PENDING/REFUNDED),
  paymentExpiresAt, razorpay{…}, timeline[].
- **User** (extended), **Patient** (extended). Reused: Review, Notification,
  ServiceCatalog, NurseBooking. Planned: LabTest, LabTestBooking, Consultation, EmergencyBooking.

Order transitions enforced in `services/pharmacyService.js#VENDOR_STATUS_TRANSITIONS`.
Patients may cancel only while `PLACED`/`ACCEPTED`.

---

## 6. API surface (`/api/v1/pharmacy`)
- Public: `GET /vendors/nearby?lat&lng&radiusKm`, `GET /medicines/search?q&vendorId&category`,
  `GET /vendors/:vendorId`, `GET /payment-options` (`{online, razorpayKeyId, currency, paymentWindowMinutes}`).
- Patient (`protectPatient`): `POST /prescriptions` (multipart), `POST /orders`, `GET /orders`, `GET /orders/:id`,
  `POST /orders/:id/cancel`, `POST /orders/:id/payment` (create/reuse Razorpay order),
  `POST /orders/:id/payment/verify` (`razorpay_order_id/payment_id/signature`), `POST /orders/:id/payment/failure`.
- Vendor (`authorize('pharmacy_vendor')`): `GET /vendor/orders`, `GET /vendor/orders/:id`, `PATCH /vendor/orders/:id/status`,
  `GET|PUT /vendor/inventory`, `PATCH /vendor/profile`. (Unpaid PREPAID orders are invisible here.)
- Admin (`authorize('admin','platform_admin')`): `GET|POST /admin/vendors`, `PATCH /admin/vendors/:id/status`, `GET|POST /admin/medicines`, `PATCH /admin/medicines/:id`.
- Auth used by the frontends: patient `POST /patients/{register,login}`, `GET /patients/me`;
  staff/vendor/admin `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`. All set httpOnly cookies.

---

## 7. How to run (with a real MongoDB — the normal path)
```bash
# from the repo root
npm run setup:env            # generates .env (JWT_SECRET + ENCRYPTION_KEY)
# start MongoDB (local service, Atlas via MONGODB_URI, or: docker run -d -p 27017:27017 mongo:7)
npm run db:indexes
npm run db:seed:admin        # admin from ADMIN_EMAIL / ADMIN_PASSWORD in .env
npm run db:seed:pharmacy     # 3 vendors + medicines + inventory (+ a vendor login)
npm run dev                  # API on http://localhost:5000  (health: /api/v1/health)
```
Online payment (optional): add Razorpay **test** keys `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`
to `.env` (see `docs/MEDRUSH_GETTING_STARTED.md` → "Online payment").

Web:
```bash
cd frontends/web
cp .env.local.example .env.local      # NEXT_PUBLIC_API_BASE_URL=http://localhost:5000
npm install
npm run dev                           # http://localhost:3000
```
Mobile (later): `cd frontends/mobile && npm install && npx expo start`.
Shared (first time, for typecheck): `cd frontends/shared && npm install`.

> **No MongoDB installed?** A throwaway in-memory Mongo works for a demo:
> `npm i -g mongodb-memory-server` (or local), start it, set `MONGODB_URI` to its
> uri + `JWT_SECRET`/`ENCRYPTION_KEY`, then `require('./server.js').startServer()`
> and seed. Data resets on restart — install a real MongoDB for anything persistent.

Only Node ≥ 22 + MongoDB + npm are required. Docker/k8s/Grafana/etc. in the repo
are production tooling — ignore them for local dev.

---

## 8. Next steps (recommended order)
1. ~~Razorpay checkout~~ ✅ done. Follow-ups: live test with Razorpay test keys; add a
   Razorpay **webhook** (`payment.captured`, `refund.processed`, verify `X-Razorpay-Signature`
   against a separate webhook secret); an admin view for `REFUND_PENDING` orders.
2. **Mobile app** — `npm install` in `frontends/mobile`; extend `utils/mobileAuth.js`
   so the Expo app receives body tokens (store via `expo-secure-store`, set with
   `lib/api.ts#setAuthToken`); build patient screens (checkout via `expo-camera` for Rx;
   Razorpay via `react-native-razorpay` reusing `startPayment`/`verifyPayment`).
3. **Real-time (Phase 3)**: follow `docs/MEDRUSH_DATA_MODEL.md` §5. Build a `DeliveryTask` collection,
   rider pings in Redis GEO (not Mongo), Socket.IO rooms per order, rider assignment during prep,
   and stamp `milestones.riderAssignedAt/pickedUpAt`. Add FCM/expo push.
3b. **AWS go-live**: follow `docs/MEDRUSH_AWS_DEPLOYMENT.md` §3 (bootstrap state → Atlas in
   ap-south-1 → terraform apply → set `MONGODB_URI` in Secrets Manager → GitHub env vars → deploy).
   Draw the first `ServiceZone` polygons for launch neighbourhoods.
4. **Medical breadth (Phase 4)** — reconcile the main checkout's staged
   `LabTest`/`LabTestBooking`/`Consultation`/`EmergencyBooking` work (§0) against this
   branch's enums/roles, then routes + UIs; nursing reuses `NurseBooking`.
5. **Hardening (Phase 5)** — integration + load tests (k6/artillery) against a real
   Mongo, Redis geo-cache, deploy (Vercel web + EAS/Play Store mobile).

## 9. Conventions
- Conventional Commits (`feat:`/`fix:`/…); branch from `develop`; never push to main/develop directly.
- `npm test` = fast suite; `npm run test:all` = full; `npm run verify:local` = lint + fast tests before a PR
  (in this worktree use `npx jest …` — see §0).
- Keep new routes under `/api/v1` via `routes/v1/index.js`; keep controllers thin;
  flag security issues with a `WARNING` comment and never implement insecure patterns.
