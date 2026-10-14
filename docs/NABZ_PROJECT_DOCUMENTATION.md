# Nabz: complete project documentation

*Written 14 Oct 2026 from the code on two branches:*
- *`feature/nabz-care-marketplace` (head `2264d49`, 13 Oct 2026): the current product, Nabz.*
- *`feature/medrush-core` (head `b32a60a`, 22 Sep 2026): the MedRush modules.*

*It replaces nothing. The deeper documents it links to stay the source of truth for their areas.*

Companion document: [NABZ_QUICK_COMMERCE_AUDIT_AND_PLAN.md](NABZ_QUICK_COMMERCE_AUDIT_AND_PLAN.md). It audits this system against quick-commerce companies and says what to improve next.

---

## Contents

1. [What Nabz is](#1-what-nabz-is)
2. [How the project got here: three generations](#2-how-the-project-got-here-three-generations)
3. [Who uses it, and on which surface](#3-who-uses-it-and-on-which-surface)
4. [Technology stack](#4-technology-stack)
5. [System architecture](#5-system-architecture)
6. [Repository map](#6-repository-map)
7. [Backend: API surface](#7-backend-api-surface)
8. [Product modules](#8-product-modules)
9. [Core flows and state machines](#9-core-flows-and-state-machines)
10. [Data model](#10-data-model)
11. [Money: pricing, commission and the ledger](#11-money-pricing-commission-and-the-ledger)
12. [Background work](#12-background-work)
13. [Real-time: chat, calls and live updates](#13-real-time-chat-calls-and-live-updates)
14. [Security, privacy and compliance](#14-security-privacy-and-compliance)
15. [Infrastructure and deployment](#15-infrastructure-and-deployment)
16. [Configuration](#16-configuration)
17. [Testing](#17-testing)
18. [Local development](#18-local-development)
19. [The MedRush branch in detail](#19-the-medrush-branch-in-detail)
20. [Known gaps and risks](#20-known-gaps-and-risks)
21. [Document index](#21-document-index)

---

## 1. What Nabz is

Nabz is **home healthcare on demand**, launching in **Jaipur**. It is a hyperlocal marketplace with four supply types:

| Vertical | Supply | How it is sold | Closest consumer model |
|---|---|---|---|
| **Medicine delivery** | Independent licensed chemists near the customer | Cart → nearest store that has everything → rider or store delivery, about 30 minutes | Swiggy Instamart / Blinkit (but without dark stores) |
| **Nurse at home** | Verified independent nurses | "Book now" (matched to the nearest free nurse) or scheduled | Uber / Urban Company |
| **Physio and home care** | Physiotherapists, physio clinics, caregivers | Compare providers by price, distance, rating and reliability; one visit or a multi-session plan | Zomato (choose the "restaurant") |
| **Lab tests** | Path labs | Compare labs for a set of tests; home collection or walk-in | Zomato-style comparison, scheduled slots |

Nabz earns on both sides: a commission from partners, a platform fee and delivery fee from customers, and the **Nabz Plus** membership (₹149 per 30 days). See [section 11](#11-money-pricing-commission-and-the-ledger).

---

## 2. How the project got here: three generations

The repository started as a different product, and both earlier generations are still in it. This matters when you read the code.

| Generation | Period | What it was | Where it lives | Status |
|---|---|---|---|---|
| **1. Nocturnal** | Up to Jul 2026 | B2B staffing: hospitals post duty shifts, doctors and nurses apply. Also patient health records and doctor access. Vanilla-JS PWA plus a Capacitor Android shell. | `main`, `develop`, and every branch (duties, applications, calendar, earnings, health records, WebAuthn, security audit) | Code kept and still tested; not the product any more |
| **2. MedRush core** | 22 Sep 2026 (one commit) | Quick-commerce health add-ons on Nocturnal: one-tap SOS emergency, teleconsultation, lab test booking with a phlebotomist, nearest-staff geo-dispatch, Socket.IO tracking | `feature/medrush-core` (this checkout), commit `b32a60a` plus small uncommitted index fixes | Never deployed; not merged into Nabz |
| **3. Nabz care marketplace** | 23 Sep – 13 Oct 2026 (76 commits) | The current product: marketplace for pharmacy, nursing, physio and labs, two React Native apps, a Next.js website, AWS staging | `feature/nabz-care-marketplace` (PR #216) | Live on AWS staging |

Both MedRush and Nabz branch from the same commit (`387bf0c`), so **neither contains the other**. Nabz rebuilt labs its own way (`models/labOrder.js`, `services/labOrderService.js`, a rate card per lab). The MedRush lab catalogue (sample type, fasting and report-time fields) is the only part Nabz's own plan says to reuse ([PROVIDER_MARKETPLACE_PLAN.md](product/PROVIDER_MARKETPLACE_PLAN.md) on the Nabz branch). The website's `/consult` and `/emergency` pages are "Coming soon (Phase 4)" placeholders.

**Branch naming:** "MedRush" was the working name. The Android package is still `app.medrush.mobile`, and some docs on the Nabz branch are named `MEDRUSH_*`. Everything user-facing says Nabz.

---

## 3. Who uses it, and on which surface

| Role (`role` in code) | Surface | What they do |
|---|---|---|
| Customer (`patients` collection) | **Nabz** app (Android), website | Book visits, buy medicines, book lab tests, manage family, track visits, pay, Plus |
| Nurse (`nurse`, `medical_staff`) | **Nabz Partner** app, website `/staff` | Go online, take visit offers, run visits (code at the door, care log, cash collected) |
| Physiotherapist (`physiotherapist`) | Partner app, website | Same as nurses, plus their own rate card and plans in the care marketplace |
| Care shop / clinic / lab owner | Partner app (`shop`, `lab` tabs), website `/partner/shop`, `/lab` | Rate card, prices, plans, offers, ads, lab orders and reports |
| Pharmacy (`pharmacy_vendor`) | Partner app (`vendor`, `stock`, `store` tabs), website `/vendor/*` | Accept orders, verify prescriptions, pack, stock, batches, H1 register, money |
| Rider (`delivery_partner`) | Partner app (`rider` tab) | Go online, batched trips (up to 3 drops), cash collection, earnings |
| Platform admin (`platform_admin`) | Website `/admin` (authenticator-app 2FA) | Stores, catalogue, partners, verification, payments, withdrawals, campaigns, ads, settings, live logs |
| Onboarding team (`onboarding_reviewer`) | Website `/onboarding` (authenticator-app 2FA) | Review partner requests and documents, one tab per partner type |
| Legacy: doctor, hospital admin | Old PWA (`client/public`) | Nocturnal duty shifts |

**One codebase, two apps.** `frontends/mobile` builds the customer app when `APP_VARIANT` is unset and the partner app when `APP_VARIANT=partner`. Customer tabs are in `app/(tabs)`, partner tabs in `app/(partner)`.

**Easy mode** (customer app): large text, fewer choices, big buttons and a "Call me back" request, for elderly users.

**Look and feel:** one design system in `frontends/mobile/lib/theme.ts` and `frontends/web/app/globals.css`:
- calm neutral surfaces, with Nabz red used only for actions and the active state;
- ink for dark surfaces, and green only for savings and success;
- flat cards with hairline borders, 12–16 px corners and rectangular buttons;
- a bottom tab bar docked to the screen edge.

The pharmacy tab works like a quick-commerce app: an ADD button that becomes a − / + stepper, a cart bar with the running total, and a cart sheet with the full bill and a free-delivery nudge.

**Languages:** English and Hindi (`frontends/mobile/lib/i18n.tsx`). About 14 of 45 app screens still have English-only text.

---

## 4. Technology stack

| Layer | Technology |
|---|---|
| API | Node.js 22, Express 5, Mongoose 9, a single monolith (`server.js` boots it, `app.js` assembles it) |
| Database | MongoDB Atlas (staging is the free M0 tier); 2dsphere indexes for geo queries |
| Cache / rate limits | Redis supported but **off** on staging (`REDIS_ENABLED=false`); login and OTP limits count in MongoDB instead |
| Customer and partner apps | Expo SDK 52, React Native 0.76, Expo Router, TypeScript (`frontends/mobile`) |
| Website | Next.js 15, React 19, TypeScript (`frontends/web`); proxies `/api/*` to the API |
| Shared client code | `frontends/shared/src` (API client, types, payments, realtime, marketplace helpers) |
| Legacy frontend | Vanilla-JS PWA in `client/public`, built with webpack; Capacitor Android shell in `android/` |
| Real-time | AWS AppSync Events (managed WebSockets) with a Lambda authorizer (`infra/realtime-authorizer`); WebRTC with a TURN server for in-app calls |
| Payments | Razorpay (orders, signature check, refunds); disabled on staging, so only cash works there |
| Push | Firebase Cloud Messaging (optional; skipped when not configured) |
| Sign-in | Email and password, Google (native picker on Android, Google Identity Services on the web), phone OTP (built, off until an SMS provider is set), WebAuthn, admin TOTP |
| Identity checks | DigiLocker (Aadhaar) for partner documents |
| Files | Private S3; uploads go straight from the client through one-time signed links |
| Hosting | AWS App Runner (Mumbai, `ap-south-1`): one service for the API, one for the website |
| Infrastructure as code | Terraform (`terraform/apprunner-staging`, `terraform/realtime-staging`) |
| Monitoring | CloudWatch logs and alarms to the SNS topic `nabz-staging-alerts`; an in-memory, redacted live-log view in the admin panel |
| Edge security | AWS WAF in front of the API |

---

## 5. System architecture

```
                    ┌──────────────────────┐   ┌──────────────────────┐
                    │  Nabz app (Android)  │   │ Nabz Partner (Android)│
                    │  Expo / React Native │   │ same code, variant    │
                    └──────────┬───────────┘   └──────────┬───────────┘
                               │ HTTPS (REST /api/v1)     │
   ┌─────────────────┐         │                          │
   │ Website (Next.js)│────────┼──────────────────────────┤
   │ App Runner "web" │ proxies /api/* with a signed      │
   └─────────────────┘ client-IP header                   │
                               ▼                          ▼
                    ┌───────────────────────────────────────────────┐
         AWS WAF ──►│  API: Express monolith on App Runner "api"     │
                    │  routes/v1 → controllers → services → models   │
                    │  in-process workers (backup)                   │
                    └──┬──────────┬──────────┬──────────┬──────────┬─┘
                       │          │          │          │          │
                       ▼          ▼          ▼          ▼          ▼
                 MongoDB Atlas  S3 (private  Razorpay   Firebase   AppSync Events
                 (all data,     uploads,     (payments, (push)     (chat, call
                  job leases,   signed URLs) refunds)              signalling)
                  rate counts)                                       ▲
                                                                     │ Lambda
   EventBridge (every minute) ──► POST /api/v1/internal/tick         │ authorizer
   (runs every sweep once, under a MongoDB lease)              TURN server (calls)
```

**Design rules the code follows:**

- **Modular monolith.** One deployable API. Each domain is a `routes/` file plus one or more `services/` files. `services/` is a flat folder of modules, not separate microservices.
- **Compare-and-set on every state change.** Status moves use `findOneAndUpdate` filtered on the status that was read, so two actors (customer cancels while store accepts) can't both win. Only the winner runs side effects (stock, refunds, notifications). This was the fix for audit findings C3 and the pharmacy double-restock bug.
- **The server owns prices.** Apps send what they saw (`quotedSubtotal`); the server recalculates and returns `409 PRICE_CHANGED` instead of charging a different amount.
- **One definition of "can sell now".** `serviceabilityService` and `pharmacyAvailabilityService` decide store eligibility for search, cart planning, checkout and reassignment, so those never disagree.
- **Background work is idempotent.** Sweeps can run on several instances; leases and compare-and-set make that safe.
- **Degrade, don't fail.** Redis, Firebase, AppSync and Razorpay are optional. Without them the system falls back (MongoDB counters, no push, polling, cash only).

---

## 6. Repository map

Paths are from the repository root. "N" = only on the Nabz branch; "M" = only on the MedRush branch; unmarked = both.

| Path | Holds |
|---|---|
| `server.js` | Process lifecycle: env validation, DB connect, workers, graceful shutdown |
| `app.js` | Express assembly. Middleware order is load-bearing (security, rate limit, sanitising, then routes) |
| `routes/v1/index.js` | Mounts every domain router under `/api/v1` |
| `routes/`, `controllers/`, `services/`, `models/`, `validators/` | Domain code. Nabz mostly puts logic in services and keeps routes thin |
| `config/` | `revenue.js` (N: every price and commission rule), `pharmacyOps.js` (N: store SLAs and limits), `validateEnv.js`, database and Redis config |
| `constants/` | Enums (statuses, roles), care services, marketplace constants |
| `middleware/` | Auth (`protect`, `authorize`, patient auth), rate limits, validation, security headers, idempotency |
| `utils/` | Logger with redaction and an in-memory buffer (N), errors, TOTP (N), helpers |
| `workers/` | Worker entry points (outboxes) |
| `frontends/mobile` (N) | Expo app: `app/(tabs)` customer, `app/(partner)` partner, `lib/` shared UI and hooks |
| `frontends/web` (N) | Next.js site: customer, partner, vendor, staff, lab and admin pages |
| `frontends/shared` (N) | TypeScript API client and types shared by both |
| `infra/realtime-authorizer` (N) | Lambda that checks AppSync channel tokens |
| `terraform/apprunner-staging`, `terraform/realtime-staging` (N) | The live staging infrastructure |
| `client/`, `android/`, `capacitor.config.json` | Legacy Nocturnal PWA and its Android shell |
| `apps/patient-health`, `apps/duty-shift`, `packages/shared` | Nocturnal restructure (copy-first split); `apps/patient-health` duplicates booking code |
| `terraform/*.tf` (root), `k8s/`, `docker-compose*.yml`, `nginx/`, `prometheus/`, `grafana/`, `loki/`, `logstash/`, `filebeat/` | Earlier deployment experiments (ECS, Kubernetes, self-hosted monitoring). **Not used by staging**; App Runner is the only target |
| `tests/unit`, `tests/integration`, `tests/smoke`, `tests/e2e`, `tests/live` | Jest and Playwright suites |
| `scripts/` | Seeders, index migrations, backfills, deploy helpers, security scans, git hooks |
| `docs/` | Documentation (index in [section 21](#21-document-index)) |

---

## 7. Backend: API surface

All routes are under `/api/v1`. Unversioned `/api/*` requests redirect to the latest version.

### Nabz product routes

| Mount | Purpose |
|---|---|
| `/auth`, `/auth/social`, `/auth/password`, `/auth/admin-mfa`, `/webauthn` | Sign-in (email, Google, OTP), password reset, admin TOTP, passkeys |
| `/patients` | Customer profile, addresses, preferences, offers feed, account deletion |
| `/bookings` | Home visits: create, ASAP/scheduled, packages, cancel, status, visit code, tracking |
| `/care`, `/marketplace` | Care marketplace: shops, rate cards, plans, proposals, labs, slots |
| `/pharmacy` | Search, availability, cart plan, delivery-fee quote (`POST /pharmacy/delivery-quote`), checkout, orders; `/pharmacy/vendor/*` for stores; `/pharmacy/admin/*` for admins |
| `/onboarding` | Onboarding panel: partner applications and documents (onboarding team and platform admins), and the onboarding team itself (platform admins) |
| `/rider` | Rider online state, jobs, trip steps, earnings |
| `/refills` | Monthly medicine refill reminders and one-tap reorder |
| `/membership` | Nabz Plus: trial, purchase, status |
| `/family` | Care Circle: family links and shared visit history |
| `/chat` | Conversations and in-app calls between customers and providers |
| `/partners`, `/partner-posts`, `/profile-photo` | Partner applications, account, payouts, documents, photo and video posts |
| `/support` | Call-back requests and support tickets |
| `/payments` (and `/payments-b2c` when Razorpay is configured) | Payment orders, verification, webhooks |
| `/admin/ops`, `/admin/revenue`, `/admin/metrics`, `/admin/funnel`, `/admin/security-audit` | Admin panel back end |
| `/notifications`, `/mobile-devices`, `/uploads` | Inbox, push tokens, signed upload links |
| `/internal/tick` | Scheduler entry point (shared-secret header) |
| `/health` | Health check; includes `deploymentCommit` |

### Legacy Nocturnal routes (still mounted)

`/duties`, `/applications`, `/calendar`, `/earnings`, `/certifications`, `/reviews`, `/achievements`, `/messages`, `/analytics`, `/shift-series`, `/hospital-settings`, `/hospital-waitlist`, `/patient-dashboard`, `/health-records`, `/health-analytics`, `/health-intake`, `/doctor-access`, `/patient-analytics`, `/security`.

### MedRush-only routes (branch `feature/medrush-core`)

`/consultations`, `/emergency`, `/lab-tests`, `/lab-test-bookings`, `/staff-location`. See [section 19](#19-the-medrush-branch-in-detail).

---

## 8. Product modules

### 8.1 Customers

- **Home screen:** address and search, a count of verified staff online nearby, the "Nurse at home" grid, tiles for Pharmacy, Lab tests and Physio & care, offers, and **Book again**. The full-screen map with a pin per service type (and admin-controlled sponsored pins labelled "Ad") is one tap away.
- **Booking for someone else:** a parent in another city, chosen from contacts; the professional calls the on-site contact. Works for medicine orders too.
- **Saved preferences:** addresses, preferred gender, favourite professional, whether a substitute is OK.
- **Visit tracking:** live map, SOS button, a shareable family tracking link (`/track/[token]`).
- **Care Circle:** family members see each other's visits and care logs.
- **Refills:** reminders and one-tap reorder.
- **Account deletion:** identity and contact details erased, health history kept and anonymised (decided 25 Sep 2026).

### 8.2 Home visits (nurses and physios)

- Code: `services/bookingService.js`, `services/dispatchService.js`, `services/careVisitPolicy.js`, `services/staffAvailabilityService.js`, `services/reliabilityService.js`.
- Only verified staff (ID, police check, council registration) can go online, receive offers or be assigned.
- While online, the partner app rings and vibrates for a new offer, even in the background (foreground location service).
- A customer can choose a specific professional, or best available with or without a substitute.
- **Packages:** every session is booked at once; the same professional comes each time; "Change professional" moves the upcoming ones.
- **Supplies:** items the nurse should bring become a pharmacy order with `STAFF_PICKUP` fulfilment (no delivery fee).
- **Care log:** vitals and notes during each visit, visible to the Care Circle.
- **Reliability score** per professional, used to rank close candidates. Three drops in a week takes them offline.

### 8.3 Care marketplace (physio, home care, labs)

- Code: `services/careStoreService.js`, `services/carePlanService.js`, `services/careSlotService.js`, `services/labOrderService.js`, models `careStore`, `rateCardItem`, `carePlan`, `careQuote`, `planProposal`, `slotReservation`, `labOrder`.
- Each provider has a **rate card** (its own prices). Customers compare providers for a service: price, home or clinic, distance, travel fee, rating, next free slot.
- **Slots:** a 15-minute grid in India time. A session holds every slot it overlaps; a home visit also holds the travel buffer. Reservation is a conditional `$inc` with a unique key, so the last place can't be sold twice.
- **Plans:** 1–30 sessions, chosen weekdays and time, provider discounts for more sessions, the same provider each time. Providers can send **plan proposals**.
- **Labs:** compare labs for a set of tests (count covered, total, collection fee, slowest report time, NABL badge). Fasting tests only in morning slots. Sample flow: collected (customer's 4-digit code) → at lab → processing → report uploaded → `REPORT_READY`, and the lab is paid. A rejected sample gives a free re-collection; a late report credits the customer.

### 8.4 Pharmacy

The most developed vertical. Full design and edge-case catalogue: [pharmacy/STORE_NETWORK_PLAN.md](pharmacy/STORE_NETWORK_PLAN.md) on the Nabz branch.

- **Search and availability:** which stores can sell this now, ranked; same-salt substitutes when few or none have it.
- **Cart planner:** one store with everything, else a split across up to 2 stores, else best partial plus substitutes.
- **Checkout:** product rules (no banned or Schedule X), store gate, atomic stock reservation, price-changed guard, idempotent create. One checkout can create several store orders (cash on delivery only for splits).
- **Delivery fee:** free from a ₹249 basket. Below that it depends on the distance from the store (₹20 for the first 2 road km, ₹8 per km after, at most ₹80, then surge and the night fee). The cart shows the fee and "Add ₹X more for free delivery" before the customer orders ([section 11](#11-money-pricing-commission-and-the-ledger)).
- **Store acceptance SLA:** 3 minutes by default (10 on staging). Silence or a stock/busy/closed rejection moves the order to the next store that has every remaining item at no more than the agreed price; up to 3 stores, then cancel and refund. Three misses in a row pause the store for 30 minutes.
- **Missing items:** dropped per line and refunded; the rest continues.
- **Substitution with consent:** a store offers the same medicine from another maker; the customer compares and accepts or removes it within 15 minutes. Never swapped silently.
- **Compliance:** pharmacist records the doctor, registration number and prescription date before packing; Schedule H1 register (CSV export); monthly caps and risk flags for misuse-prone medicines; cold-chain items only from stores with a fridge; minimum shelf life of 30 days.
- **Stock:** batches and expiry (earliest expiry sold first), quarantine and recalls, shelf-count confirmation, CSV import from billing software, low-stock and expiry alerts, a demand signal for medicines customers nearby couldn't find, "notify me when back in stock".
- **Store management (app and `/vendor/*`):** Today (open switch, sales vs yesterday, alerts), Orders, Stock, Money (statement and withdrawals), Shop settings (hours, delivery distance, fees, minimum order, packing time).

### 8.5 Riders

- Code: `services/riderService.js`.
- Riders go online with a location heartbeat (verified riders only).
- When a store marks an order **ready**, it goes to a rider already heading to that store whose drops are within 3 km (a batch of up to 3), else to the nearest free online rider within 6 km. Cold-chain orders never wait in a batch.
- Steps: arrived at store → picked up (order goes out for delivery) → arrived → delivered with the customer's 4-digit code. A rider can release a job before pickup.
- Pay: ₹20 per drop + ₹5 per road km + ₹10 for each extra drop on the trip, booked in the ledger.
- No rider free: the store delivers itself.

### 8.6 Payments, payouts and wallet

- Razorpay orders; the server checks the signature, re-fetches the payment and matches amount, currency and order before marking it paid.
- Refunds are queued, locked per entry and retried; a retry first looks up refunds already made for that entry, so nothing is refunded twice.
- Cash: nurses, stores and riders confirm "cash collected ₹X". The ledger records `CASH_COLLECTED`, and payouts are netted against cash the partner holds.
- Partner withdrawals: UPI or bank details (encrypted), minimum ₹100; admin reveals details with a fresh 2FA code and marks paid with the UTR.
- Customer wallet: credits for no-shows, late lab reports and referrals.

### 8.7 Growth: Plus, campaigns, ads, referrals, posts

- **Nabz Plus** (`membershipService`): ₹149 / 30 days, one 7-day trial per customer ever; free delivery and no visit platform fee; renewals stack.
- **Campaigns** (`campaignService`): scheduled offers and announcements to customers or partner groups, with an optional one-time push.
- **Ads** (`adService`, `adCampaign`, `adLedger`): sponsored map pins and listings, propose → approve flow.
- **Referrals** (`partnerReferralService`): partner codes customers enter before their first order; no reward when the referrer serves the order.
- **Partner posts:** photos and videos on a partner's shop page; admin can hide a post with a reason.

### 8.8 Partners and onboarding

- Apply (`partnerApplicationService`) → the onboarding team approves in the onboarding panel → login created with verification pending → 72-hour set-password link by email (shown in the panel on staging, where SMTP is not set) → the partner signs in and uploads documents → the team approves them → the partner can work.
- Approving creates a login for nurses and physios, pharmacies, delivery riders, path labs and phlebotomists. PRP technicians and hospitals are a waitlist (no partner flow yet). The apply forms require an email for every kind that gets a login.
- Riders, labs and phlebotomists become verified (`isVerified`) when every required document is approved, and lose it when one expires; a rider who loses it is taken offline. Nurses and physios keep their separate ID, police and council badges.
- Documents with DigiLocker Aadhaar, expiry tracking, and a verification queue for admins.
### 8.9 Onboarding panel (website `/onboarding`)

- For the **onboarding team** (role `onboarding_reviewer`) and platform admins. Code: `routes/onboarding.js`, `services/onboardingTeamService.js`, `frontends/web/app/onboarding`.
- **One tab per partner kind** (nurse/physio, pharmacy, delivery rider, path lab, phlebotomist, PRP technician, hospital) with a count of requests waiting. Each tab has **New requests** (approve or reject) and **Document checks** (that kind's uploads).
- **Sign-in:** reviewers sign in at `/onboarding/login`, only there, with a password and then a code from an authenticator app (set up at first sign-in). Every approval, rejection and document view needs a fresh code and is written to the audit log.
- **Team tab (platform admins):** add a reviewer by choosing their login ID (email); they receive a one-time link to set their own password. Suspend (signs them out everywhere), restore, or send a new link.
- **Domain rule:** `ONBOARDING_LOGIN_DOMAINS` (for example `nabz.in`) limits reviewer login IDs to the Nabz domain, both when an account is created and at every sign-in. Leave it empty until the domain is live.
- Admins never choose a reviewer's password. An admin-set password would let the admin sign in as the reviewer, and the audit log could no longer show who approved a partner.

### 8.10 Admin panel (website `/admin`)

Stores and catalogue (approve, suspend, merge duplicate medicines, recalls), partner applications, verification queue, users (contact details masked; revealing or suspending needs a fresh 2FA code and a reason, and is audited), payments log, withdrawals, revenue, campaigns, ads, platform settings (revenue overrides), zone stress (surge), call-backs and refunds, flagged pharmacy orders, live logs (redacted, in memory per instance).

### 8.11 Legacy Nocturnal modules

Duty shifts, applications, calendars, earnings, certifications, achievements, hospital settings and waitlist, patient health records, health analytics and intake, time-limited doctor access to records, WebAuthn passkeys and recovery codes, and the security audit export pipeline. They are mounted and tested, but no Nabz screen uses the duty-shift features.

---

## 9. Core flows and state machines

### 9.1 Home visit ("Book now")

```
REQUESTED ─► SEARCHING ─► (offer to nearest eligible professional, 45 s)
                │              ├─ accept (compare-and-set) ─► CONFIRMED ─► EN_ROUTE ─► IN_PROGRESS ─► COMPLETED
                │              ├─ decline / expiry ─► next candidate (up to 8)
                │              └─ nobody for 10 min ─► dispatch NO_STAFF ─► customer told: reschedule or cancel free
                └─ customer cancels: free until EN_ROUTE, ₹100 after (paid to the nurse), not allowed once IN_PROGRESS
```

- **Eligible** = online, fresh heartbeat, right role for the service, preferred gender, verified, not holding an overlapping visit or another offer, hasn't declined this one, within 12 km. Among the nearest, the more reliable professional wins.
- **Scheduled visits** start offering 12 hours before and keep trying until 30 minutes before. A chosen professional gets 20 minutes to answer.
- **Starting** needs the customer's 4-digit visit code. **Completing** records cash collected.
- **Health-record access** is granted on accept and expires 24 hours after the visit.
- A professional who drops a visit hands it back to matching.

### 9.2 Pharmacy order

```
checkout ─► PLACED ─(store accepts within SLA)─► ACCEPTED ─► PREPARING ─► READY_FOR_PICKUP ─► OUT_FOR_DELIVERY ─► DELIVERED
              │                                     │             │                              (customer's code)
              ├─ silent / stock / busy / closed ─► next store (max 3) ─► else CANCELLED + refund
              ├─ prescription rejected ─────────► CANCELLED + refund
              ├─ some items missing ─────────────► drop lines, refund them, continue
              └─ substitute offered ─────────────► customer accepts or removes within 15 min
Prepaid orders are invisible to the store until paid; the SLA clock starts at payment.
```

### 9.3 Rider job

```
READY_FOR_PICKUP ─► ASSIGNED (batched or nearest) ─► ACCEPTED ─► ARRIVED_AT_STORE ─► PICKED_UP ─► ARRIVED_AT_CUSTOMER ─► DELIVERED
                       └─ released before pickup ─► next rider          (order becomes OUT_FOR_DELIVERY)
```

### 9.4 Lab order

```
quote (rate card, slot) ─► booked (slot reserved atomically) ─► collected (customer code) ─► at lab ─► processing ─► REPORT_READY
                                                                 └─ sample rejected ─► free re-collection
```

---

## 10. Data model

MongoDB collections on the Nabz branch (81 models). Grouped by domain:

| Domain | Collections (model files in `models/`) |
|---|---|
| People and access | `patient`, `user` (staff, partners, admins; verification in `careProfile`), `refreshSession`, `otpChallenge`, `passwordResetToken`, `webAuthnChallenge`, `webAuthnRecoveryCode`, `mobileDevice`, `familyLink`, `membership` |
| Home visits | `nurseBooking` (status, dispatch state, pricing, payment, visit code, service location, on-site contact, who the visit is for), `serviceCatalog`, `careLog`, `availability`, `calendarEvent` |
| Care marketplace | `careStore`, `rateCardItem`, `carePlan`, `careQuote`, `planProposal`, `slotReservation`, `labOrder` |
| Pharmacy | `pharmacyVendor` (licence, pharmacist, fridge, reliability, pause), `medicine` (salt key, sale flags), `vendorInventory` (`stockUpdatedAt`), `inventoryBatch`, `inventoryMovement`, `pharmacyOrder` (items, `acceptBy`, attempts, refunds, rider), `pharmacyCheckout`, `pharmacyDemandSignal`, `pharmacyInventoryImport`, `stockAlert`, `medicineRefill` |
| Geography | `serviceZone` (city, polygon, last-mile cap, stress level and radius multiplier) |
| Money | `payment`, `settlementEntry` (the ledger), `walletAccount`, `walletEntry`, `withdrawalRequest`, `refundOutbox`, `earning` |
| Growth | `campaign`, `adCampaign`, `adLedger`, `partnerPost` |
| Partners | `partnerApplication`, `partnerDocument`, `digilockerSession` |
| Communication | `chatThread`, `chatMessage`, `notification`, `message`, `callbackRequest` |
| Platform | `platformSetting`, `jobLease`, `requestCounter`, `idempotencyKey`, `securityAuditEvent`, `securityAuditExportJob`, `securityNotificationOutbox`, `bookingCompletionOutbox`, `funnelDailyMetric`, `analytics` |
| Legacy Nocturnal | `duty`, `application`, `shiftSeries`, `hospital`, `hospitalSettings`, `hospitalWaitlist`, `certification`, `achievement`, `review`, `healthRecord`, `healthMetric`, `healthTarget`, `healthAccessToken`, `healthDataAccessLog`, `doctorNote`, `emergencySummary`, `investigationReport` |

MedRush adds `consultation`, `emergencyBooking`, `labTest` and `labTestBooking` (not on the Nabz branch).

Geo fields are GeoJSON points with 2dsphere indexes (`user.currentLocation`, store locations, service zones). Run `npm run db:indexes` after deploying model changes.

---

## 11. Money: pricing, commission and the ledger

Every number lives in `config/revenue.js` and can be overridden from the admin panel (`settingsService`). Full model: `docs/NABZ_REVENUE_MODEL.md` on the Nabz branch.

| Stream | Rule (launch defaults) |
|---|---|
| Visit commission | Monthly tiers per professional: visits 1–10 at 20%, 11–30 at 15%, 31+ at 12% |
| Customer platform fee (visits) | 15% of base price; waived for Plus |
| Pharmacy commission | 10% of item value |
| Delivery fee | **Free from a ₹249 basket.** Below ₹249: ₹20 for the first 2 road km + ₹8 per km after (road km = straight line × 1.3, rounded up), at most ₹80; a store's own fee above ₹0 replaces the ₹20. Then × zone surge (1.5× high, 2× severe) + ₹20 from 22:00 to 06:00 IST (surge and night also apply to free baskets). Free for Plus. ₹0 for nurse pickup |
| Lab commission | 20%; late report credit 10% (₹50–₹200) |
| No-show credit | ₹100 to the customer |
| Nabz Plus | ₹149 / 30 days, 7-day trial once |
| GST | 18% on visits; the healthcare exemption switch (`REVENUE_GST_HEALTHCARE_EXEMPT`) is off until a CA confirms |

**Worked example, nurse visit (IM injection, base ₹299, non-member):** customer pays ₹405.74 (₹299 + ₹44.85 fee + ₹61.89 GST); nurse earns ₹239.20; Nabz keeps ₹104.65.

**Worked examples, pharmacy (normal time, store 3 km away, so 4 charged road km):**

| Basket | Customer pays | Store earns | Nabz keeps | Rider costs | Before payment fees |
|---|---|---|---|---|---|
| ₹200 | ₹236 (₹36 delivery) | ₹180 | ₹56 | about ₹40 | about +₹16 |
| ₹300 | ₹300 (free delivery) | ₹270 | ₹30 | about ₹40 | about −₹10 |
| ₹500 | ₹500 (free delivery) | ₹450 | ₹50 | about ₹40 | about +₹10 |

Rider cost is ₹20 per drop + ₹5 per road km. With free delivery from ₹249, a basket between about ₹249 and ₹400 delivered by a Nabz rider doesn't cover the ride. Batching (a ₹10 bonus per extra drop instead of a second full fare) and store self-delivery narrow the gap. The audit plan lists the options.

**The ledger** (`settlementEntry`) records every paid event: commission, platform fee, delivery fee, partner payout, cash collected, refunds. Payouts are netted against cash partners hold. Pharmacy invariant: `amounts.refunded + amounts.total = amounts.originalTotal`.

---

## 12. Background work

| Mechanism | What it runs | Notes |
|---|---|---|
| **Minute tick** (EventBridge → `POST /api/v1/internal/tick`, `services/cronService.js`) | Dispatch, pharmacy acceptance timeouts, partial refund retries, unpaid order expiry, pharmacy housekeeping, care refund outbox, campaign pushes, partner document expiry, care plans, ads, reliability, riders, refills, substitutions, call timeouts, settings reload | Holds a 55-second MongoDB lease (`jobLease`), so only one instance runs it. Records each run's result. CloudWatch alarms fire if it stops or fails. Exists because App Runner throttles CPU when idle |
| **In-process timers** (started in `server.js`) | Dispatch sweep every 10 s, pharmacy assignment worker every 20 s | Backup to the tick; may stall when the instance is idle |
| **Fire-and-forget** (`setImmediate`, 8 call sites) | Rider assignment when an order is ready, rider sweep when a rider comes online, family notifications | Lost if the process restarts at that moment; the minute tick catches most of them later |
| **Outbox workers** (`workers/`) | Refunds, booking completion, security notifications | Retry until done |

---

## 13. Real-time: chat, calls and live updates

- App Runner can't hold WebSocket connections, so real-time delivery goes through **AWS AppSync Events** (`services/realtimeService.js`).
- Channels (namespace `nabz`): `/nabz/inbox/<p|u>-<id>` (one per account), `/nabz/thread/<id>` (one per conversation), `/nabz/call/<id>` (WebRTC offer, answer and ICE).
- Clients never get AWS credentials. The API issues short-lived tokens listing exactly which channels they may subscribe or publish to; the Lambda authorizer checks the signature and channel on every connect, subscribe and publish.
- In-app voice calls use WebRTC with short-lived TURN credentials (`terraform/realtime-staging`).
- Without configuration (local, tests) publishing is a no-op and the apps poll.
- Location: staff and riders heartbeat their position over REST; customers see visit tracking. **Customers can't yet see the rider on medicine orders.**

---

## 14. Security, privacy and compliance

- **Authentication:** short-lived access tokens and rotating refresh sessions; Google ID tokens accepted for the web and Android clients; admins need TOTP, and sensitive admin actions need a fresh code and a reason.
- **Authorisation:** role checks per route (`protect`, `authorize`, `protectPatient`, `protectBoth`), ownership checks in services, a shared `ADMIN_ROLES` list.
- **Rate limits and lockout:** per signed-in account; login, OTP and reset limits count in MongoDB across instances. The website forwards the real client IP in a signed header (`PROXY_SHARED_SECRET`).
- **Uploads:** type checked from file contents; partner media goes straight to private S3 through a one-time signed link fixed to type and size, checked before publishing; unpublished uploads are deleted after a day.
- **Data protection:** payout details encrypted; contact details masked in admin views; the nurse sees the customer's phone only from confirmation until 2 hours after the visit; logs redact secrets, emails and phone numbers; account deletion follows India's DPDP Act 2023.
- **Healthcare and pharmacy rules:** professional verification before going online; prescription verification by a pharmacist; Schedule H1 register; no Schedule X or banned products; misuse caps and flags; cold chain.
- **Web:** CSP, HSTS, no framing, nosniff. The CSP still allows `'unsafe-inline'` for scripts.
- **Edge:** AWS WAF on the API.
- **Secrets:** AWS Secrets Manager; the Android release key and its password are there too. Git hooks run secret scans.
- **Onboarding team:** its own role (`onboarding_reviewer`) and sign-in page, limited to applications and partner documents. It needs the authenticator app like an admin, and a fresh code for every decision. Login IDs can be limited to the Nabz domain (`ONBOARDING_LOGIN_DOMAINS`). Passwords are set by the reviewer through a one-time link, never by an admin.
- **Audit trail:** `securityAuditEvent` records admin reveals, suspensions, verification changes, campaigns, onboarding decisions and onboarding-team changes.
- **Staging guards:** `config/validateEnv.js` refuses to start in production if staging-only switches (`SERVICEABILITY_TEST_RADIUS_KM`, demo area) are set.

---

## 15. Infrastructure and deployment

Full steps: [NABZ_OPERATIONS_RUNBOOK.md](NABZ_OPERATIONS_RUNBOOK.md).

| What | Where |
|---|---|
| API | App Runner service, `ap-south-1`; health at `/api/v1/health` (shows `deploymentCommit`) |
| Website | App Runner service; proxies `/api/*` to the API |
| Images | CodeBuild project `nabz-staging-images` (`TARGET=api` or `web`) from a source zip in S3 |
| Infrastructure | Terraform `terraform/apprunner-staging` (App Runner, Secrets Manager, EventBridge tick, CloudWatch alarms, WAF, uploads bucket) and `terraform/realtime-staging` (AppSync Events, authorizer, TURN). State in S3 |
| Database | MongoDB Atlas M0 |
| Android | Built locally with `apk-build.ps1` (wrapping `C:\mrb\build-cloud.ps1`), signed with the Nabz release key; 30–70 minutes per build |
| AWS CLI | Always the `nabz` profile |

**Deploy today:** commit and push → zip the commit to S3 → start two CodeBuild builds → App Runner deploys each new image (~10 minutes) → check `deploymentCommit`. No CI/CD pipeline deploys automatically yet.

---

## 16. Configuration

Copy `.env.example` (or run `npm run setup:env`). The variables that change behaviour most:

| Variable | Meaning |
|---|---|
| `MONGODB_URI` | Database |
| `REDIS_ENABLED`, `REDIS_URL` | Optional Redis |
| `CRON_SECRET` (≥ 32 chars) | Shared secret for `/internal/tick` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_ENABLED` | Payments; `/payments-b2c` mounts only when set |
| `GOOGLE_OAUTH_CLIENT_IDS`, `GOOGLE_WEB_CLIENT_ID` | Google sign-in |
| `REALTIME_HTTP_DOMAIN`, `REALTIME_WS_DOMAIN`, `REALTIME_REGION` | AppSync Events |
| `PROXY_SHARED_SECRET` | Website-to-API client IP header |
| `PHARMACY_ACCEPT_SLA_SECONDS`, `PHARMACY_MAX_ASSIGNMENT_ATTEMPTS`, `PHARMACY_MIN_SHELF_LIFE_DAYS`, `PHARMACY_MAX_SPLIT_STORES`, `PHARMACY_RX_MAX_AGE_DAYS` | Pharmacy operations (`config/pharmacyOps.js`) |
| `REVENUE_*` | Every price, fee and commission (`config/revenue.js`) |
| `REVENUE_FREE_DELIVERY_ABOVE`, `REVENUE_DELIVERY_FEE_DEFAULT`, `REVENUE_DELIVERY_INCLUDED_KM`, `REVENUE_DELIVERY_PER_KM`, `REVENUE_DELIVERY_MAX_FEE` | Delivery fee: 249, 20, 2, 8, 80. Also editable in the admin panel's settings, which override these |
| `ONBOARDING_LOGIN_DOMAINS` | Comma list of allowed onboarding-team login domains (for example `nabz.in`). Empty = any |
| `SERVICEABILITY_TEST_RADIUS_KM` | **Staging only.** Makes every store deliver everywhere |

---

## 17. Testing

| Command | What it runs |
|---|---|
| `npm test` | Fast Jest suite (`jest.fast.config.js`), about 1,430 tests on the Nabz branch |
| `npm run test:all` | Full Jest suite, including models and smoke |
| `npm run test:integration` | Integration tests; the pharmacy, care, rider and family suites need a real MongoDB replica set (`MONGODB_URI=...?replicaSet=...`) and include race tests |
| `npm run test:deploy-gate` | Builds the legacy frontend, then frontend-contract and smoke tests |
| `npm run test:e2e:*` | Playwright (public funnel, CSP, WebAuthn) |
| `npx tsc --noEmit` (in `frontends/mobile` and `frontends/web`) | Type-checks the apps |
| `npm run lint` | ESLint with security rules |

The Nabz branch has 202 Jest test files; this branch has 168. The apps and website have no automated UI tests beyond type-checking and a public-page check. Two tests are known to fail intermittently: the shared-package export count, and a bot test around midnight.

---

## 18. Local development

```bash
npm install                   # also installs git hooks
npm run setup:env             # create .env
npm run doctor:local          # check Node, MongoDB and env
npm run dev                   # API on :5000
npm run db:indexes            # create indexes
node scripts/seedServiceCatalog.js   # visit types and prices (Nabz branch)

# Nabz branch frontends
cd frontends/web && npm install && npm run dev          # website on :3000
cd frontends/mobile && npm install && npx expo start    # apps (APP_VARIANT=partner for the partner app)
```

Integration tests that need transactions: start a local replica set (for example on port 28017, `rs: testset`) and point `MONGODB_URI` at it.

Conventions: Conventional Commits; branch from `develop`; never push to `main` or `develop`; compare-and-set for every state change; add routers in `routes/` and mount them in `routes/v1/index.js`.

---

## 19. The MedRush branch in detail

Commit `b32a60a` (3,775 lines added) on `feature/medrush-core`.

| Module | Files | What it does |
|---|---|---|
| Teleconsultation | `models/consultation.js`, `controllers/consultationController.js`, `routes/consultations.js` | Patient requests a consult by specialisation; doctors see a queue, accept (compare-and-set), start, chat, complete with a prescription |
| Emergency SOS | `models/emergencyBooking.js`, `controllers/emergencyController.js`, `routes/emergency.js` | One tap creates an emergency, auto-assigns the nearest online staff within 15 km, fixed price ₹598 |
| Lab tests | `models/labTest.js`, `models/labTestBooking.js`, controllers, routes, `scripts/seedLabCatalog.js` | Test catalogue with sample type, fasting and report time; one Nabz price per test; admin assigns a phlebotomist; sample status; report upload |
| Staff location | `controllers/staffLocationController.js`, `routes/staffLocation.js` | Staff post their location |
| Services | `geoDispatchService.js`, `socketTrackingService.js`, `prescriptionService.js` | Nearest-staff matching, Socket.IO rooms and chat, prescription helpers |

**Findings from this audit (marked with `WARNING` comments in the code):**

1. **`GET /emergency/:id` and `PATCH /emergency/:id/cancel` have no ownership check.** Any signed-in user can read any SOS (patient phone, blood group, address, emergency contacts, staff location) or cancel someone else's live SOS. Consultations and lab bookings do check ownership.
2. **`PATCH /emergency/:id/accept`** lets any staff member take any emergency in any status, with read-modify-save (two acceptances overwrite each other).
3. **`socketTrackingService`** has no authentication: any client can join any user's room, spoof a staff member's location, and post chat as anyone.
4. **Not wired:** `geoDispatchService`, `socketTrackingService` and `prescriptionService` are used only by their unit tests. The emergency controller has its own copy of the distance code.
5. **SOS contacts are recorded as "notified by SMS" but no SMS is sent.**
6. **SOS assigns staff without asking them** (status goes straight to `STAFF_ASSIGNED`), and there is no payment flow for the ₹598.

Uncommitted work in this checkout removes duplicate single-field indexes on `consultationNumber`, `emergencyNumber` and `bookingNumber`, switches the lab seeder to `returnDocument: 'after'`, and adds `npm run server:dev` (`scripts/startDevServer.js`).

---

## 20. Known gaps and risks

From [NABZ_IMPROVEMENT_PLAN.md](NABZ_IMPROVEMENT_PLAN.md), the Nabz all-roles audit (24 Sep 2026), and this review:

| Area | Gap |
|---|---|
| Launch | Razorpay off on staging (cash only); phone OTP off (no SMS provider); no domain, so Google sign-in is stuck in Testing mode (100 users); no SMTP |
| Data | MongoDB M0 has no backups; the Atlas password must be rotated and network access restricted (most urgent) |
| Background work | Fire-and-forget jobs can be lost on restart; the reliable tick runs once a minute, which is coarse for 45-second nurse offers |
| ETA | The promise assumes the rider is assigned while the store packs, but riders are assigned only at `READY_FOR_PICKUP`, so real times will run longer than promised |
| Scale | Redis off; at most one instance is safe for some in-memory state |
| Customer UX | Three different booking flows; search misses typos; generic product images; no live rider tracking for medicines; no unified notifications inbox |
| Delivery | Android builds are local and slow; no over-the-air updates; no crash reporting (Sentry) |
| Testing | No automated app or website journey tests; no load test |
| Code health | Legacy Nocturnal code and unused deployment stacks (`k8s/`, root `terraform/`, self-hosted monitoring) add noise; `apps/patient-health` duplicates booking code |
| Web security | CSP allows `'unsafe-inline'` scripts |

---

## 21. Document index

On this branch (`docs/`):

| Document | For |
|---|---|
| [NABZ_QUICK_COMMERCE_AUDIT_AND_PLAN.md](NABZ_QUICK_COMMERCE_AUDIT_AND_PLAN.md) | Audit against quick-commerce models and the improvement plan |
| [NABZ_WHAT_WE_BUILT.md](NABZ_WHAT_WE_BUILT.md) | Short feature summary |
| [NABZ_IMPROVEMENT_PLAN.md](NABZ_IMPROVEMENT_PLAN.md) | Earlier improvement plan (UI/UX, features, architecture) |
| [NABZ_OPERATIONS_RUNBOOK.md](NABZ_OPERATIONS_RUNBOOK.md) | Deploying, Android builds, signing, Google sign-in |
| [ARCHITECTURE.md](ARCHITECTURE.md), [GETTING_STARTED.md](GETTING_STARTED.md) | Nocturnal-era architecture and setup (partly out of date for Nabz) |

Only on the Nabz branch (`docs/`): `product/CODE_CONTEXT.md` (read first before new work), `pharmacy/STORE_NETWORK_PLAN.md`, `product/PROVIDER_MARKETPLACE_PLAN.md`, `product/ADMIN_AND_ADS_GUIDE.md`, `product/BOOK_FOR_SOMEONE_ELSE_PLAN.md`, `NABZ_REVENUE_MODEL.md`, `AUDIT_2026-09-24_ALL_ROLES.md`, `MEDRUSH_DATA_MODEL.md`, `MEDRUSH_AWS_DEPLOYMENT.md`, `MEDRUSH_GETTING_STARTED.md`.
