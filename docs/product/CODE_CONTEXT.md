# Nabz: code context (27 Sep 2026)

Read this before writing a PRD, a plan or code for Nabz. It describes what is
built and running today, so new work refines it instead of starting over.
Branch `feature/nabz-care-marketplace` (PR #216), staging commit `2f849fa` (updated 27 Sep evening).

## What Nabz is

Home healthcare on demand in Jaipur (launch city):

- **Home visits:** nurses and physiotherapists, booked now (ASAP) or scheduled.
- **Medicine delivery:** from nearby partner pharmacies, in about 30 minutes.
- **Home care packages:** for example 10 physio sessions, or 14 days of post-surgery care.

Two Android apps and a website:

| Surface | Who | Where |
|---|---|---|
| **Nabz** app | Customers | `frontends/mobile` (Expo SDK 52, React Native 0.76), `APP_VARIANT` unset |
| **Nabz Partner** app | Nurses, physios, pharmacies (delivery and path labs: onboarding cards) | Same codebase, `APP_VARIANT=partner` |
| Website | Customers, partners, admins | `frontends/web` (Next.js 15) |
| API | All of the above | Repo root: Node 22, Express 5, Mongoose 9 (MongoDB Atlas) |

Shared TypeScript API client and types for both frontends: `frontends/shared/src`.

## Staging (live)

- **API:** `https://tiuh3tvxsa.ap-south-1.awsapprunner.com` (AWS App Runner, Mumbai).
- **Website:** `https://79fkmxu8w3.ap-south-1.awsapprunner.com` (proxies `/api/*` to the API).
- **Infrastructure as code:** `terraform/apprunner-staging`.
  - App Runner services and container images (built by CodeBuild).
  - Secrets in Secrets Manager.
  - An EventBridge minute tick that runs background jobs.
  - CloudWatch alarms.
- **Domain:** none yet. The default App Runner URLs are used.

## Roles and what each can do today

| Role | Status | Main code |
|---|---|---|
| **Customer (patient)** | Built | `models/patient.js`, `routes/patient.js`, app tabs `app/(tabs)/*` |
| **Nurse / physiotherapist** (`nurse`, `physiotherapist`) | Built | `app/staff.tsx`, `services/dispatchService.js`, `services/bookingService.js` |
| **Pharmacy** (`pharmacy_vendor`) | Built | `app/vendor.tsx`, `services/pharmacyService.js`, `docs/pharmacy/` |
| **Platform admin** (`platform_admin`) | Built (web) | `frontends/web/app/admin`, admin sign-in with 2-step verification |
| **Path lab** (`lab_partner`) | Waitlist (apply) | Partner app shows how the lab flow works; lab module lives on branch `feature/medrush-core` (see below) |
| **Phlebotomist**, **PRP technician**, **hospital / nursing home** | Waitlist (apply) | Partner applications (`services/partnerApplicationService.js`) |
| **Delivery rider** (`delivery_partner`) | Waitlist (apply) | Pharmacies deliver themselves or nurses pick up |

### Customer

- **Accounts:** sign in with phone OTP, Google or email.
- **Home visits:** book an ASAP or scheduled visit. Customers can prefer a female or male professional, **choose a specific verified professional** (or best available, with or without a substitute), see their profile and verification badges, and give them a 4-digit visit code at the door.
- **Packages:** book every session at once (chosen weekdays and time). The same professional comes to every session; "Change professional" moves the upcoming ones.
- **Book for someone else:** a parent in another city, picked from phone contacts or recent people; the professional calls the on-site contact. Works for medicine orders too.
- **Saved preferences:** address, gender preference, favourite professional, substitute choice.
- **Referral codes:** a customer can enter a Nabz partner's code before their first order.
- **Visit tracking:** follow the visit live on a map, press SOS, and share a family tracking link.
- **Cancelling and rebooking:** cancelling is free until the professional is on the way, then ₹100. If nobody is free, the customer picks another time.
- **Medicines:** order from nearby stores with a prescription upload.
  - The customer pays with the Nabz payment sheet (UPI apps, card or cash) or cash on delivery.
  - They give the rider a 4-digit delivery code at handover.
- **Nabz Plus:** a membership with free delivery and no visit platform fee.
- **Account deletion:** health history is kept; identity and contact details are erased (app or `/account/delete`).
- **Terms:** consent checkbox at sign-in; `/terms` page (draft for legal review).

### Nurse / physio (Partner app)

- **Going online:** only verified staff (ID, police check, council registration) can go online.
- **Visit requests:** while online, the app rings loudly and vibrates for a new request nearby, even in the background (foreground location service).
- **Offers:** accept or decline. Going on the way, starting the visit (needs the patient's code) and completing it (with the cash collected) are the steps.
- **Dropping a visit:** hands it back to matching. Three drops in a week takes them offline.
- **Account page:** profile, verification, rating, earnings (today / week / all time), commission tier this month, referral code, payouts.
- **Payouts:** add a UPI ID or bank account (encrypted), withdraw the available balance (earnings minus cash held, minimum ₹100); admin pays and marks paid with the UTR.

### Pharmacy (Partner app / website)

- **Order flow:** accept or decline an order (with a reason), verify the prescription, then pack, hand over and deliver (the customer's code is required).
- **Stock:** stock by batch and expiry, shelf-count confirmation, CSV import from billing software, low-stock alerts, and demand from customers nearby.
- **Compliance:** Schedule H1 register, risk flags, and monthly caps on sensitive medicines.

### Admin (website)

- **Stores and catalogue:** approve and suspend stores; manage the medicine catalogue.
- **Partner applications:** approving a nurse, physio or pharmacy creates their login and emails a set-password link.
- **Revenue:** revenue and pending partner payouts, netted against cash they collected.
- **Withdrawals:** reveal payout details and mark paid (fresh 2-step code); physio/nurse M : F mix against the 2 : 8 target.

## Key flows and where they live

| Flow | Code |
|---|---|
| Visit booking, prices, cancellation fees, time rules | `services/bookingService.js`, `services/careVisitPolicy.js` |
| Matching (nearest verified, free, preferred gender; offer; next) | `services/dispatchService.js`, `services/staffAvailabilityService.js` |
| Background jobs (offers, pharmacy timeouts, refunds) | `services/cronService.js`, called by `POST /api/v1/internal/tick` each minute |
| Pharmacy search across stores ("who has this brand near me") | `services/pharmacyAvailabilityService.js`, `docs/pharmacy/STORE_NETWORK_PLAN.md` |
| Pharmacy order state machine, store reassignment on decline or timeout | `services/pharmacyService.js`, `services/pharmacyAssignmentService.js` |
| Payments (Razorpay orders, verification, refunds) | `services/pharmacyPaymentService.js`, `services/paymentService.js`, `frontends/shared/src/payments.ts` |
| Revenue ledger (commission, delivery fee, payouts, cash held) | `services/settlementService.js`, `docs/NABZ_REVENUE_MODEL.md` |
| Commission: monthly tiers for visits (1–10: 20%, 11–30: 15%, 31+: 12%), pharmacy flat 10%, referral credit = min(5%, tier) | `services/commissionService.js`, `config/revenue.js` |
| Referrals (codes, rewards, credits) | `services/partnerReferralService.js` |
| Choose a professional, packages as linked sessions, change professional | `services/dispatchService.js` (`findCandidate`, `lockSeriesProvider`), `bookingService.createPackageSeries`, `changeSeriesProvider` |
| Partner account and withdrawals | `services/partnerAccountService.js`, `services/payoutService.js`, `models/withdrawalRequest.js` |
| Partner onboarding (apply, approve, invite) | `services/partnerApplicationService.js`, `routes/partners.js` |
| Service catalogue (visit types, prices, packages) | `models/serviceCatalog.js`, `constants/careServices.js`, `scripts/seedServiceCatalog.js` |

## Data model (MongoDB collections)

| Collection | Holds |
|---|---|
| `patients` | Customers, including medical history and dues |
| `users` | Staff, partners and admins (with `role`), including verification in `careProfile` |
| `nursebookings` | Home visits: status, dispatch state, pricing, payment, visit code, service location with on-site contact person and phone, `patientDetails` (who the visit is for) |
| `servicecatalogs` | Visit types and packages with prices |
| `pharmacyvendors`, `vendorinventories`, `inventorybatches`, `medicines` | Stores, their stock and batches, and the shared medicine catalogue |
| `pharmacyorders`, `pharmacycheckouts` | Medicine orders (one checkout can span several stores) |
| `settlemententries` | Money ledger for every paid event |
| `partnerapplications` | Partner sign-ups (with gender, referral code, terms consent) and review state |
| `withdrawalrequests` | Partner withdrawals and the ledger entries they settle |
| `notifications`, `pushtokens`, `jobleases`, `ratelimitcounters` | Supporting data |

## Built on another branch, not deployed

Branch `feature/medrush-core` (commit `b32a60a`, with uncommitted work in the main checkout) has:

- `models/labTest.js` and `models/labTestBooking.js`: a lab test catalogue, and home sample collection bookings with a phlebotomist.
- `scripts/seedLabCatalog.js`: sample tests and prices. These are placeholders, not a negotiated rate list.
- Consultation and emergency modules.

These must be ported to this branch (and adapted to its conventions) before labs or phlebotomists can go live.

## Conventions that matter for new work

- **Routes:** every route lives under `/api/v1`; add routers in `routes/` and wire them in `routes/v1/index.js`.
- **State changes:** compare-and-set updates (`findOneAndUpdate` with the expected current status), so two people can't change the same record at once.
- **Staging-only switches:** the demo area and test radius must never be set in production. `config/validateEnv.js` refuses to start if they are.
- **Commits:** Conventional Commits. Never push to `main` or `develop` directly.
- **Tests:**
  - `npm test` runs the fast suite.
  - Integration tests need a MongoDB (`MONGODB_URI`).
  - Frontends type-check with `npx tsc --noEmit`.
- **Deploying:**
  - CodeBuild project `nabz-staging-images` (TARGET=api|web) builds from a source zip of the commit.
  - APKs are built by `C:\mrb\build-cloud.ps1` (`-Variants customer|partner`).

## Known gaps (from `docs/AUDIT_2026-09-24_ALL_ROLES.md`)

- The Atlas database password must be rotated, and network access restricted.
- Move to MongoDB M10 for backups.
- No SMTP yet, so partner invites and password-reset emails aren't sent.
- No alert email subscribed to the CloudWatch alarms.
- Razorpay keys aren't set on staging, so only cash on delivery works there.
