# MedRush — Pharmacy‑Vendor Quick‑Commerce + Home Medical Services

**Revised implementation plan** (supersedes `implementation_plan11.docx` / "MedRush MVP").
Date: 2026‑09‑22 · Owner: Chirayu Mishra · Stack decision: **Next.js (web) + React Native/Expo (mobile)** on the existing Nocturnal Node/Express/MongoDB backend.

**Companion docs:** [MEDRUSH_DATA_MODEL.md](MEDRUSH_DATA_MODEL.md) — collections ("tables"), relationships, indexes, and how to add a model · [MEDRUSH_GETTING_STARTED.md](MEDRUSH_GETTING_STARTED.md) — simple architecture + how to run backend/web/mobile locally.

---

## 1. What changed vs. the original plan

The original "MedRush MVP" was a quick‑commerce layer for **home medical services** (nursing, lab tests, doctor consults, emergency SOS) on company‑dispatched staff. Three directives from the product owner reshape it:

1. **Fulfillment = marketplace of local pharmacy vendors, not dark stores.** Instead of owning inventory (Zepto/Blinkit/Flipkart‑Minutes model), we **aggregate independent local pharmacies** (Swiggy/Zomato‑style). This adds a *Pharmacy Vendor* org entity, per‑vendor inventory & pricing, order routing to a chosen/nearest vendor, a vendor dashboard, and a delivery‑partner (rider) role.
2. **Frontend is Next.js + React Native**, replacing the Vanilla‑JS PWA for the new product surfaces. The existing Express API is kept as the backend.
3. **Scope = full breadth** (pharmacy + home nursing + lab tests + doctor consult + emergency SOS), **web + mobile built in parallel**, vendors **admin‑seeded with a vendor dashboard**.

### Corrections to inaccurate assumptions in the original doc
- ❌ *"Socket.IO already in the codebase / WebSocket ready."* **False** — there is no `socket.io` dependency and no references. Real‑time (order/staff tracking, chat, dispatch) must be **added** (`socket.io` server + client) or done via polling for the first slice. Planned below.
- ⚠️ *"~60% of the backend is already built."* True for **auth, RBAC, Patient/User/NurseBooking/ServiceCatalog/Payment/Review models, uploads (S3/GCS), Razorpay, Firebase push, rate‑limiting/security stack.** The pharmacy marketplace, lab, consult, emergency, and real‑time layers are **new**.
- ✅ Reuse confirmed: `middleware/auth.js` (`protect`, `authorize(...roles)`), `middleware/patientAuth.js`, `constants/roles.js` + `constants/enums.js` as the single source of truth, `routes/v1/index.js` route composition, `utils/uploadEnhanced`, `models/payment.js`, `models/review.js`, `models/notification.js`.

---

## 2. Roles & auth

| Role | Model | Auth | Onboarding |
|---|---|---|---|
| **Patient** | `Patient` | Phone OTP + optional email/password (existing `patientAuth`) | Self‑register |
| **Pharmacy Vendor** (store staff) | `User` role `pharmacy_vendor`, scoped to a `PharmacyVendor` org | Email + password | **Admin‑seeded/approved** (MVP), self‑serve later |
| **Delivery Partner / Rider** | `User` role `delivery_partner` | Phone + password | Admin‑verified |
| **Medical Staff** (nurse/paramedic) | `User` role `nurse` (existing) or new `medical_staff` | Phone + password + cert upload | Admin‑verified |
| **Phlebotomist** (lab sample collection) | `User` role `phlebotomist` | Phone + password + cert | Admin‑verified |
| **Doctor** | `User` role `doctor` (existing) | Email + password + MCI verify | Admin‑approved |
| **Admin / Platform Admin** | `User` role `admin` / `platform_admin` (existing) | Email + password | — |

New roles added to `constants/roles.js` (`ROLES`, `ALL_ROLES`, `ROLE_PERMISSIONS`) **and** `constants/enums.js` (`STAFF_ROLES`) so both `authorize()` and the `User` schema enum accept them.

---

## 3. Architecture & repo layout

Keep the Express monolith as the API. Add frontends in an **isolated top‑level `frontends/` directory** that is *not* matched by the root `workspaces` globs (`packages/*`, `apps/*`) — this keeps the heavily CI‑gated backend dependency tree, lint (`eslint .`), and deploy gates untouched by React/Next/Expo dependencies.

```
/                         # existing Express backend (unchanged install/CI)
  routes/ controllers/ models/ constants/ middleware/ services/ ...
frontends/
  shared/                 # @medrush/shared — TS domain types + typed API client (fetch), zero heavy deps
  web/                    # Next.js 15 (App Router, TS, Tailwind) — patient storefront + vendor/doctor/admin dashboards
  mobile/                 # Expo (React Native, TS, expo-router) — patient app + vendor app (role-aware)
docs/
  MEDRUSH_PHARMACY_MARKETPLACE_PLAN.md   # this file
```

- **`frontends/shared`** is the contract layer: one place for TS types (`PharmacyOrder`, `Medicine`, `LabTestBooking`, …) and a typed `apiClient` used by both web and mobile. Consumed via a local path dependency + `tsconfig` path alias.
- Root `.gitignore` and ESLint `ignores` updated so `frontends/**/node_modules` and build output don't enter backend tooling.
- Mobile stays on **Expo managed workflow** (fastest path, OTA, push, maps, camera for prescription capture). The existing Capacitor Android wrapper is retired for the new app.

### Real‑time strategy
- Add `socket.io` to the backend, mounted on the same HTTP server (`server.js`), namespaced: `/rt/orders`, `/rt/tracking`, `/rt/consult`, `/rt/emergency`. Rooms keyed by `orderId` / `bookingId` / `userId`. Auth via the existing access token in the socket handshake.
- Web uses `socket.io-client`; mobile uses the same. **Fallback:** status polling every 5–10s where sockets are unavailable, so the product works before real‑time lands.

---

## 4. Data model

### New models
- **`models/pharmacyVendor.js`** — store profile: `name`, `owner` (User), `drugLicenseNumber`, `gstin`, `address` + `location` (GeoJSON Point, 2dsphere), `serviceRadiusKm`, `operatingHours`, `status` (`PENDING`/`APPROVED`/`SUSPENDED`/`REJECTED`), `payout` details, `rating`, `isOpen`.
- **`models/medicine.js`** — global master catalog: `name`, `genericName`/composition, `brand`, `manufacturer`, `form` (TABLET/SYRUP/…), `strength`, `packSize`, `scheduleType` (`OTC`/`PRESCRIPTION`/`SCHEDULE_H`), `category`, `hsn`, `images`, `isActive`.
- **`models/vendorInventory.js`** — per‑vendor listing: `vendor`, `medicine`, `mrp`, `sellingPrice`, `stockQty`, `isAvailable`; unique compound index `{ vendor, medicine }`.
- **`models/pharmacyOrder.js`** — `patient`, `vendor`, `items[]` (medicine + qty + price snapshot), `prescription` (upload ref), `status` (`PLACED`→`ACCEPTED`→`PREPARING`→`READY_FOR_PICKUP`→`OUT_FOR_DELIVERY`→`DELIVERED` / `REJECTED` / `CANCELLED`), `deliveryAddress` + `location`, `rider` (User), `amounts` (items/delivery/tax/total), `payment` (Payment ref), `timeline[]`, `requiresPrescription`.
- **`models/labTest.js`** + **`models/labTestBooking.js`** — catalog (category, sample type, pricing, prep, TAT, partner) + booking (tests, collection slot, phlebotomist, `sampleStatus`, `reportUrl`, doctor ref).
- **`models/consultation.js`** — `patient`, `doctor`, `type` (CHAT/AUDIO/VIDEO), `status`, `prescription`, linked `labTestBookings`, `fees`, `duration`.
- **`models/emergencyBooking.js`** — `patient`, live `location`, `urgencyLevel`, `condition`, assigned `staff`, `responseTimeMs`, emergency‑contact notifications.

### Modified models (additive only)
- **`models/user.js`** — `pharmacyVendor` ref, `currentLocation` (GeoJSON Point, 2dsphere), `isOnline`, `isAvailable`, `servicesOffered[]`, `vehicle` (rider), `averageResponseTime`.
- **`models/patient.js`** — `savedAddresses[]` (label + address + GeoJSON), `defaultAddressId`, `emergencyContacts[]`, `preferredLanguage`.
- **`constants/enums.js`** — new role arrays; `MEDICINE_FORMS`, `MEDICINE_SCHEDULE_TYPES`, `MEDICINE_CATEGORIES`, `PHARMACY_ORDER_STATUSES`, `PHARMACY_VENDOR_STATUSES`, `DELIVERY_STATUSES`, `LAB_TEST_CATEGORIES`, `SAMPLE_STATUSES`, `CONSULTATION_TYPES`, `CONSULTATION_STATUSES`.

### ERD (additions)
```
Patient ||--o{ PharmacyOrder : places
Patient ||--o{ LabTestBooking : orders
Patient ||--o{ Consultation : requests
Patient ||--o{ EmergencyBooking : triggers
Patient ||--o{ NurseBooking : books           (existing)

PharmacyVendor ||--o{ VendorInventory : stocks
PharmacyVendor ||--o{ PharmacyOrder : fulfills
Medicine ||--o{ VendorInventory : listed_as
Medicine ||--o{ PharmacyOrder.items : ordered_in

User(delivery_partner) ||--o{ PharmacyOrder : delivers
User(doctor) ||--o{ Consultation : conducts
User(phlebotomist) ||--o{ LabTestBooking : collects
User(nurse/medical_staff) ||--o{ NurseBooking : serves

PharmacyOrder ||--o| Payment : generates
LabTestBooking ||--o| Payment : generates
Consultation  ||--o| Payment : generates
```

---

## 5. API surface (mounted under `/api/v1` via `routes/v1/index.js`)

**Pharmacy (patient)**
- `GET  /pharmacy/vendors/nearby?lat&lng` — open vendors within radius
- `GET  /pharmacy/medicines/search?q&vendorId` — search catalog / a vendor's stock
- `POST /pharmacy/orders` — place order (with prescription upload ref)
- `GET  /pharmacy/orders/:id` / `GET /pharmacy/orders` — track / list
- `POST /pharmacy/orders/:id/cancel`

**Pharmacy (vendor dashboard)** — `authorize('pharmacy_vendor')`
- `GET/POST/PATCH /pharmacy/vendor/inventory` — manage stock & pricing
- `GET  /pharmacy/vendor/orders` — incoming orders
- `PATCH /pharmacy/vendor/orders/:id/status` — accept/reject/prepare/ready
- `PATCH /pharmacy/vendor/profile` — hours, open/closed

**Delivery** — `authorize('delivery_partner')`
- `GET /delivery/tasks`, `PATCH /delivery/tasks/:id/status`, `PATCH /delivery/location`

**Lab tests** — `/lab-tests/search`, `/lab-tests/book`, `PATCH /lab-tests/:id/status`, `GET /lab-tests/:id/report`
**Consultations** — `POST /consultations`, `PATCH /consultations/:id`, chat via socket
**Emergency** — `POST /emergency`, `PATCH /emergency/:id`
**Staff** — `PATCH /staff/location`, `GET /staff/nearby`, `PATCH /staff/availability`
**Admin** — `/admin/vendors` (approve/suspend), `/admin/medicines` (master catalog), `/admin/staff` (verify)

All new routers follow the existing pattern: per‑domain file in `routes/`, wired into `routes/v1/index.js`, protected by `protect`/`authorize` or `patientAuth`, validated with `express-validator`, using `constants/enums.js` values.

---

## 6. Frontend surfaces

### Next.js web (`frontends/web`)
- **Patient storefront:** `/` home (categories: Pharmacy · Nursing · Lab Tests · Consult · Emergency), `/pharmacy` vendor + medicine browse, `/cart`, `/checkout` (address + prescription upload + pay), `/orders/[id]` live tracking, `/lab-tests`, `/consult`, `/emergency`, `/account`.
- **Vendor dashboard:** `/vendor` (orders queue, accept/reject), `/vendor/inventory`, `/vendor/profile`.
- **Doctor portal:** `/doctor` consult queue + e‑prescription.
- **Admin:** `/admin/vendors`, `/admin/medicines`, `/admin/staff`.
- SSR/SEO for storefront; auth via HTTP‑only cookies against the Express API.

### Expo mobile (`frontends/mobile`)
- **Patient app:** home, pharmacy browse/cart/checkout (camera prescription capture), order tracking (map), lab booking, consult (chat/audio), one‑tap Emergency SOS with live location.
- **Vendor app:** order alerts (push), accept/prepare, inventory quick‑edit.
- **Rider app (phase 2):** task list, navigation, status updates, live location publish.
- expo‑router file‑based navigation; role chosen at login; Firebase push via `expo-notifications`; maps via `react-native-maps`.

Both consume `@medrush/shared` for types + `apiClient`.

---

## 7. Payments & delivery
- **Razorpay** (already integrated) for patient → platform; vendor payouts tracked on `PharmacyVendor.payout` (manual/settlement for MVP).
- **Payment timing:** prepaid for pharmacy/lab/consult; **post‑pay** for emergency SOS (per original doc's recommendation).
- **Delivery (MVP):** vendor marks `READY_FOR_PICKUP`; a `delivery_partner` is assigned (manual/nearest) → `OUT_FOR_DELIVERY` → `DELIVERED`. Third‑party logistics integration deferred.

---

## 8. Phased execution roadmap

**Phase 1 — Foundations (backend + scaffolds)**
- Roles + enums; new models (`pharmacyVendor`, `medicine`, `vendorInventory`, `pharmacyOrder`); additive `User`/`Patient` fields.
- Pharmacy routes/controllers (patient browse + order, vendor inventory + order status) wired into `/api/v1`.
- Scaffold `frontends/shared`, `frontends/web` (Next.js), `frontends/mobile` (Expo). Root ignores/lint updated.
- Seed script: sample vendors + medicines + inventory.

**Phase 2 — Pharmacy end‑to‑end (web + mobile in parallel)**
- Patient storefront (web) + patient app (mobile): browse → cart → prescription upload → checkout (Razorpay) → order.
- Vendor dashboard (web) + vendor app (mobile): order queue accept/reject/prepare/ready; inventory management.
- Order status tracking (polling first, then socket).

**Phase 3 — Real‑time + delivery**
- Add `socket.io`; live order/rider tracking on map; delivery partner app; push notifications for new orders.

**Phase 4 — Medical services breadth**
- Home nursing (reuse `NurseBooking`) UI; lab test catalog + booking + sample tracking + report delivery; doctor consultation (chat/audio, e‑prescription) ; emergency SOS.

**Phase 5 — Polish & launch**
- Admin panels (vendor/staff verification, medicine master), analytics/monitoring, e2e tests, performance (Redis geo‑cache), Play Store / Vercel deploy.

---

## 9. Testing & deploy gates
- Backend: extend Jest suites — model unit tests + integration tests for pharmacy order lifecycle, vendor authz, lab/consult/emergency. Respect `npm test` (fast config) vs `npm run test:all`.
- Frontends: component tests + Playwright e2e for the storefront funnel; Expo EAS build checks.
- Keep the existing deploy‑gate contract tests green; add new contract tests rather than disabling any.
- `npm run verify:local` (lint + fast tests) before each PR; Conventional Commits; branch from `develop`.

---

## 10. Open decisions (resolved / remaining)
- ✅ Frontend: Next.js + Expo. ✅ Scope: full breadth. ✅ Build order: parallel. ✅ Vendors: admin‑seeded + dashboard.
- ⏳ Lab partner strategy (own catalog for MVP vs. Thyrocare/1mg API) — **own catalog for MVP.**
- ⏳ Video consult in MVP — **chat + audio first**, video (Daily.co/Agora) in a later phase.
- ⏳ Emergency scope — limit to serviceable first‑aid/IV/wound care + nearest‑staff dispatch; ambulance integration later.
- ⏳ OTP provider (MSG91/Twilio) — wire when patient OTP is enabled; email/password works today.
