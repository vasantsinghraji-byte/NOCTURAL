# Nabz vs quick commerce: audit and improvement plan

*14 Oct 2026. For the Nabz founders and engineers. It audits every Nabz feature and the architecture against quick-commerce and on-demand models, says which approach to build on, and gives a phased plan.*

*Based on the code of `feature/nabz-care-marketplace` (head `2264d49`) and `feature/medrush-core` (head `b32a60a`). For what each module does, see [NABZ_PROJECT_DOCUMENTATION.md](NABZ_PROJECT_DOCUMENTATION.md).*

---

## 1. The answer in short

**Build on Nabz, the current approach.** Do not continue the MedRush branch or the Nocturnal staffing product. Nabz is better on every axis that matters for quick commerce: what customers buy and how often, matching, correctness under concurrency, security, pricing, real-time, apps and operations ([section 2](#2-three-approaches-compared)).

**Improve these, in this order:**

1. **The 30-minute medicine loop** (pharmacy, riders, search, tracking). It is the only true quick-commerce product Nabz has, the one people use most often, and the most complete code. Four fixes make it trustworthy:
   - an ETA that matches how riders are actually assigned;
   - live rider tracking for customers;
   - search that tolerates typos, and real product photos;
   - a small set of "Assured" anchor stores per zone.
2. **"Nurse now" visits.** These are the differentiator and earn the most per order. The matching code is good. What's missing is **supply density**: enough verified nurses online in each zone at each hour.
3. **The platform under both:**
   - a job queue instead of fire-and-forget jobs;
   - backups and a paid database tier;
   - CI/CD and over-the-air app updates;
   - crash reporting;
   - a live operations view ("control tower").

**Hold back:** labs and the physio marketplace until loops 1 and 2 work in 2–3 Jaipur zones. Keep teleconsultation for later, rebuilt in Nabz style. **Do not launch "Emergency SOS"** as an emergency service. Reposition it as a priority urgent-care visit with a clear "call 108" path ([section 7](#7-what-to-do-with-the-medrush-and-nocturnal-work)).

**Don't copy** Blinkit's dark stores yet, the 10-minute promise, or a microservices split. Each is right for them at their scale and wrong for Nabz now ([section 8](#8-what-not-to-copy-from-quick-commerce)).

### Done since this audit (14 Oct 2026, branch `feature/nabz-care-marketplace`)

- **Delivery fee:**
  - free from a ₹249 basket;
  - below that, by distance from the store (₹20 for the first 2 km, ₹8 per km after, at most ₹80);
  - the app and website show the fee and "Add ₹X more for free delivery" before ordering;
  - new stores no longer deliver free by accident (their fee was 0 by default).
- **Partner onboarding fixed for every partner the app supports:**
  - approving a delivery rider, path lab or phlebotomist now creates their login, which only nurses and pharmacies got before;
  - riders, labs and phlebotomists become verified when their documents are approved, so riders can actually go online;
  - the apply forms require the email the sign-in link goes to.
- **Onboarding panel** (`/onboarding`): one tab per partner type, with new requests and document checks. It has its own team accounts that need an authenticator app, an optional Nabz-domain rule for login IDs, and a Team tab for platform admins.
- **Professional look (first pass):**
  - flat neutral design tokens in the app and website, no claymorphism or gradient glows, a docked tab bar;
  - a quick-commerce pharmacy tab: ADD / − + stepper, cart bar, bill sheet with the free-delivery nudge.

  Product photos and the single booking flow (Phase 2) are still to do.

---

## 2. Three approaches compared

| | **Nocturnal** (past) | **MedRush core** (past, Sep 22) | **Nabz** (current) |
|---|---|---|---|
| What it sells | Hospital shift staffing (B2B) | SOS, teleconsult, lab booking bolted onto Nocturnal | Medicines in ~30 min, nurse/physio visits, labs, packages (B2C, hyperlocal) |
| How often a customer comes back | Rarely; long hospital sales cycles | Mostly one-off (SOS, a consult) | Often: medicines and refills monthly, care packages weekly |
| Matching | People apply to posted duties | Auto-assigns the nearest staff **without asking them** | Offer, then accept, with a 45 s timeout, compare-and-set, reliability ranking, gender preference, verification gate, overlap check, scheduled lead time |
| Correctness under concurrency | n/a | Read-modify-save: two staff can both "accept" an SOS | Compare-and-set on every transition, with race tests on a real MongoDB |
| Security | Mature (WebAuthn, audit export) | Any signed-in user can read or cancel any SOS; sockets have no authentication | Ownership checks; admin 2FA; audited contact reveals; signed uploads; WAF |
| Pricing | n/a | Hard-coded ₹598 SOS; one Nabz price per lab test | Config-driven: commission tiers, platform fee, zone surge, night fee, Plus, per-provider rate cards |
| Real-time | None | Socket.IO, which App Runner can't host, and not wired in | AppSync Events with per-channel tokens; WebRTC calls |
| Customer apps | Vanilla-JS PWA | None | Two React Native apps and a Next.js site |
| Operations | Admin approval of duties | None | Service zones, a stress (surge) lever, store SLAs, auto-pause, reassignment, admin panel |
| Money | Earnings records | Payment stays `PENDING` | Settlement ledger, cash netting, refund outbox, withdrawals |
| Tests | 168 test files | +4 unit tests for services nothing calls | 202 test files, including races |
| Running anywhere | Was on Render (removed) | No | AWS staging, with alarms |

**What the past approaches still give us:**
- From Nocturnal: the security base (WebAuthn, audit trail, sessions) is already inside Nabz, and its **hospital relationships** are a B2B channel for post-discharge home care ([Phase 4](#phase-4-month-3-onwards-widen-carefully)).
- From MedRush: the lab-test catalogue fields (sample type, fasting, report time) and the consultation data model are worth porting. Nothing else should be merged as is.

**The cost of the current approach is breadth.** Nabz has four verticals, five partner types and an ads system before its first paying customer. Quick-commerce companies won by going deep in a few zones first. The plan below narrows the launch on purpose.

---

## 3. Which Nabz products are "quick commerce"?

Not everything should be fast. Use a different model per vertical.

| Vertical | Right model | Speed promise | Why |
|---|---|---|---|
| Medicines | **Quick commerce** (Instamart / Blinkit loop) | 20–40 min | Urgent, small basket, high frequency; the shelf already exists at local chemists |
| Nurse "Book now" | **On-demand services** (Uber matching) | Nurse arrives in 30–60 min | Injections, dressings, catheter care: urgent but planned |
| Scheduled nursing, physio, home care | **Services marketplace** (Urban Company / Zomato menu) | Next free slot | Trust, continuity and price comparison matter more than minutes |
| Lab tests | **Scheduled marketplace** | Morning slot tomorrow | Fasting tests and lab routes set the pace, not speed |
| Refills | **Subscription** | On a date | Predictable demand that lifts order frequency |

---

## 4. Feature audit against quick-commerce models

Benchmarks are the public operating models of Blinkit, Zepto and Swiggy Instamart (quick commerce), Tata 1mg, PharmEasy and Apollo 24|7 (online pharmacy), and Urban Company and Uber (on-demand services).

Rating: ●●● on par for our stage · ●●○ partly there · ●○○ weak or missing.

### 4.1 Supply and inventory

| Capability | Quick-commerce model | Nabz today | Rating | Gap |
|---|---|---|---|---|
| Where stock sits | Own dark stores with a warehouse system: the platform knows every unit | Independent chemists' shelves, also selling to walk-ins | ●●○ | Counts drift. Built: freshness labels, one-tap "counts are right", per-item "not available", CSV import. Missing: billing-software sync and an "Assured" tier |
| Assortment | Curated, a few thousand fast-moving SKUs per store | Whatever each store lists | ●○○ | No "core range" each zone must cover; no zone-level fill-rate view |
| Out-of-stock handling | Replace, substitute or refund per item | Per-item drop and refund; substitute **with consent**; reassignment to the next store | ●●● | Ahead of most: no silent swaps of prescription brands |
| Demand sensing | Forecasting per store and hour | `PharmacyDemandSignal` (unmet searches per ~5 km cell and day); "notify me" | ●●○ | Not yet fed back into what anchor stores should stock |
| Batches, expiry, recalls | Warehouse system | Batches, earliest-expiry-first, quarantine, recalls, minimum shelf life | ●●● | — |
| Regulated products | Mostly not applicable | Rx verification, H1 register, Schedule X block, misuse caps, cold chain | ●●● | A clear advantage over a general quick-commerce app |

### 4.2 Serviceability, promise and ETA

| Capability | Quick-commerce model | Nabz today | Rating | Gap |
|---|---|---|---|---|
| Delivery zones | Hand-drawn polygons per store, shrunk under stress | Polygons per city, last-mile cap, stress multiplier with expiry, radial fallback | ●●● | — |
| Promise time | Learned per store, hour and weather; shown before the cart | Fixed heuristic: max(3 min assignment, store prep) + distance at 18 km/h + 4 min | ●○○ | Not learned from real milestones; **not consistent with the code** (next row) |
| Rider overlap with packing | Rider assigned early and arrives as packing ends | The ETA assumes overlap, but `pharmacyService` assigns a rider only at `READY_FOR_PICKUP` | ●○○ | **Bug-level gap:** real delivery = prep + assignment + rider to store + last mile. Promises will be missed routinely |
| Promise adherence tracking | Core operating metric | Milestone timestamps stored on orders; no report | ●○○ | Need a "% delivered by promise" metric per zone and store |

### 4.3 Last mile

| Capability | Quick-commerce model | Nabz today | Rating | Gap |
|---|---|---|---|---|
| Fleet | Own or dedicated riders per store | Nabz riders (online heartbeat), store self-delivery as fallback | ●●○ | No third-party courier fallback (for example Shadowfax, Porter or Borzo) for peaks |
| Batching | Multi-drop when drops are close | Up to 3 drops within 3 km; cold chain never batched | ●●● | — |
| Rider supply planning | Shifts, minimum-guarantee pay, peak incentives | Pay per drop + per km + batch bonus | ●○○ | No shifts, incentives or "riders needed" view per zone |
| Proof of delivery | OTP or photo | 4-digit customer code; reasoned override flagged | ●●● | — |
| Customer live tracking | Rider on a map with a countdown | Visits: yes. **Medicine orders: no** | ●○○ | The most visible missing feature for a "30 minutes" promise |

### 4.4 Customer experience

| Capability | Quick-commerce model | Nabz today | Rating | Gap |
|---|---|---|---|---|
| Home screen | Promise ("delivery in 12 min") and reorder first | Grid of services, staff online count, Book again, offers | ●●○ | Show the live medicine ETA for the address at the top |
| Search | Typo-tolerant, synonyms, transliteration, personalised | MongoDB `$text` / `$regex` | ●○○ | Misses "paracitamol" and Hindi typed in English; salt-to-brand synonyms not in search |
| Catalogue quality | Photos, pack sizes, clear prices | Generic icon in the grid | ●○○ | Real photos and pack info build trust |
| Cart and checkout | One tap, saved payment methods | Cart planner, multi-store split, price-changed guard | ●●○ | Online payment across split stores is not built; Razorpay is off on staging |
| Reorder and subscription | "Buy again", subscriptions | Book again, monthly refills | ●●○ | A prescription vault (upload once, reuse) is missing |
| One flow for everything | Same cart pattern for every category | Three different booking flows (nursing, physio, labs) | ●○○ | The biggest source of confusion (already in the earlier plan) |
| Notifications | One inbox, rich push | Push and in-app per feature | ●○○ | No unified inbox |
| Accessibility | Usually limited | Easy mode, Hindi, call-me-back | ●●● | Ahead: right for elderly users and their families |
| Support | Chat bot, then agent; refund in the app | Call-back requests, in-app chat with providers, admin refunds | ●●○ | No self-serve "something's wrong with my order" flow |

### 4.5 On-demand services (nurses and physios)

| Capability | Uber / Urban Company model | Nabz today | Rating | Gap |
|---|---|---|---|---|
| Matching | Offer to the best nearby, timeout, next | Same, with reliability, gender, verification, overlap check | ●●● | — |
| Supply density | Heatmaps, surge earnings, guaranteed hours | Online switch, reliability score, commission tiers | ●○○ | Partners can't see where demand is; nothing pays them to be online at peak |
| Quality and trust | Training, ratings, re-verification | ID, police, council checks; DigiLocker; document expiry; ratings; care log | ●●● | — |
| Continuity | Favourite professional | Favourite professional; same professional across a package | ●●● | — |
| Pricing | Dynamic | Fixed catalogue price + platform fee; per-provider rate cards in the marketplace | ●●○ | No peak or late-night pricing for visits |

### 4.6 Monetisation

| Lever | Quick-commerce model | Nabz today | Rating | Note |
|---|---|---|---|---|
| Delivery, surge, night fees | Yes | Yes | ●●● | — |
| Free-delivery threshold and distance fee | Free above a basket size; distance or small-cart fee below it | **Free from ₹249; below it ₹20 + ₹8/km after 2 km (max ₹80)**, shown before ordering with an "Add ₹X more" nudge | ●●○ | A ₹249–₹400 basket delivered by a Nabz rider loses about ₹0–10 (commission ₹25–40 against about ₹40 rider cost). See [section 11](#11-risks-to-watch) |
| Membership | Yes | Nabz Plus ₹149 / 30 days, 7-day trial | ●●● | — |
| Ads and sponsored listings | A major profit line | Sponsored map pins and listings with approval; brand ads planned | ●●○ | Pharma brand sponsorship needs care (no Rx-drug promotion to consumers) |
| Supplier economics | Margin on owned inventory | 10% commission | ●●○ | Commission-only is thin; anchor-store deals and refills raise volume per store |

---

## 5. Architecture audit

| Area | What quick-commerce companies do at scale | Nabz today | Verdict |
|---|---|---|---|
| Service shape | Many services, event streams | Modular monolith on App Runner | **Keep the monolith.** It is the right shape for this team and volume. Split only a worker process (next row) |
| Time-critical jobs | Dedicated workers, queues, delayed messages | Minute EventBridge tick under a MongoDB lease (good); in-process timers that stall when App Runner idles; 8 `setImmediate` fire-and-forget calls | **Fix.** Use SQS with delay messages plus one always-on worker (ECS Fargate, or Lambda), for offer expiry (45 s), store SLA (3 min) and rider assignment |
| Order state | Event-sourced or state machines with outbox | Compare-and-set state machines, outboxes for refunds and security notices, timelines and milestones on orders | **Strong.** Keep the rule; add a domain-event record for analytics |
| Database | Sharded or managed NoSQL, read replicas | MongoDB Atlas **M0** (no backups) | **Fix now.** M10 or higher with point-in-time restore; rotate the password and restrict network access |
| Cache and rate limits | Redis everywhere | Redis off; limits in MongoDB | Fine for launch. Add ElastiCache Redis before running more than one instance at peak, and for an availability cache per geohash later |
| Search | Elasticsearch / OpenSearch | Mongo text search | **Fix.** Atlas Search (same database, no new system): fuzzy matching, synonyms (salt ↔ brands), autocomplete |
| Real-time | WebSockets / MQTT | AppSync Events with signed per-channel tokens; WebRTC; polling fallback | **Strong.** Reuse it for rider tracking |
| Geo | Geohash or H3 grids | 2dsphere `$geoNear`, polygons, haversine | Fine. Add H3 or geohash cells for heatmaps and caching later |
| ETA | Learned models | Constants | **Improve.** Start with rolling medians per store (prep) and per zone and hour (speed) from stored milestones; no machine learning needed yet |
| Observability | Tracing, product analytics, experiments | CloudWatch alarms, redacted live logs, funnel metrics; no crash reporting, no feature flags | **Improve.** Sentry (apps, website, API); a flag service on `platformSetting`; an event export for analytics |
| Delivery pipeline | CI/CD, staged rollouts | Manual zip → CodeBuild; local 30–70 min APK builds | **Fix.** GitHub Actions to staging on merge; EAS Build and EAS Update for the apps |
| Testing | Contract, load and chaos tests | Strong API and race tests; no app journey tests; no load test | **Improve.** Maestro journeys (sign in → order → pay → track); one load test before launch |
| Legacy weight | — | Nocturnal modules, unused k8s/ECS/monitoring stacks, duplicated `apps/patient-health` | **Prune** after launch-critical work, to cut review and security load |

---

## 6. What to improve first, and why

| Rank | Improve | Why this one | Expected effect |
|---|---|---|---|
| 1 | **Medicine loop: make the promise true** | Highest frequency; most code already built; the 30-minute promise is the brand. Today the ETA is optimistic by design (riders assigned late), and customers can't see the rider | Fewer "where is my order" contacts, higher repeat rate, honest promises |
| 2 | **Nurse supply density** | Visits earn most per order (₹104.65 on a ₹299 visit). Matching is already good; misses will come from nobody being online | More successful "Book now" matches, fewer `NO_STAFF` |
| 3 | **Platform reliability** | Payments, OTP, backups and job reliability are launch blockers whatever the UI looks like | Safe to take real money and real patients |
| 4 | **One booking flow and one search** | Removes the main confusion, especially for elderly users | Higher conversion across all verticals |
| 5 | **Labs and physio marketplace** | Built, but each adds a supply side to recruit. Launch after 1 and 2 work | Wider basket once the core loops are dense |

---

## 7. What to do with the MedRush and Nocturnal work

| Item | Decision | How |
|---|---|---|
| MedRush lab catalogue (`labTest`: sample type, fasting, report time, preparation) | **Port** | Copy the fields into Nabz's `serviceCatalog` for lab tests, keeping Nabz's per-lab rate cards. Do not port the one-price model |
| MedRush teleconsultation | **Later, rebuilt** | Rebuild in Nabz style (compare-and-set, AppSync chat, ledger) when there is a doctor supply plan. Use it mainly as the prescription path into the pharmacy, and follow India's Telemedicine Practice Guidelines (2020) |
| MedRush Emergency SOS | **Do not launch as "emergency"** | A nurse on a scooter can't meet the expectation an "SOS" button sets, which is a patient-safety and liability risk. Offer an **urgent visit** (priority dispatch, higher fee) with a prominent "Life-threatening? Call 108" button. Nabz already has an SOS for visits in progress, which is the right scope |
| MedRush `geoDispatchService`, `socketTrackingService`, `prescriptionService` | **Drop** | Nabz has better equivalents (`dispatchService`, `realtimeService`). Their security flaws are marked with `WARNING` comments on the MedRush branch |
| MedRush uncommitted index fixes | **Keep only if the branch is kept** | They remove duplicate indexes on models Nabz doesn't have |
| Nocturnal duty shifts | **Freeze, then remove from the Nabz API** | Unmount the routes after confirming nothing calls them; archive the code |
| Nocturnal hospital relationships and health records | **Reuse** | Post-discharge care packages sold through hospitals (B2B2C); health records already back the visit care log and doctor access |

---

## 8. What not to copy from quick commerce

| Tempting move | Why not now | When to reconsider |
|---|---|---|
| **Dark stores (own pharmacies)** | Each needs a drug licence, a registered pharmacist on every shift, rent and working capital, and it competes with the chemists who are your supply | When the demand signal shows a zone where partner stores repeatedly miss the same SKUs. Then start with a store-in-store deal with one anchor chemist |
| **A 10-minute promise** | Medicines need pharmacist checks; nurse visits need travel. Missing a fast promise costs more trust than making a 30-minute one | Never for prescription items; perhaps for OTC essentials from an anchor store |
| **Microservices** | More moving parts for a small team; the monolith is not the bottleneck | When one domain needs its own scaling or deploy cadence. The worker split in Phase 3 is the only exception now |
| **Deep discounting for growth** | The pharmacy contribution per order is about ₹20–25. Discounts make it negative | Use Plus, refills and the free-delivery threshold to grow basket size instead |
| **Every vertical at once** | Density per zone is what makes quick commerce work | Add verticals zone by zone once the core loop's KPIs hold |

---

## 9. The plan

Effort: S = days, M = 1–2 weeks, L = 3+ weeks for one engineer.

### Phase 0 (week 1): safety and launch blockers

| # | Item | Effort | Done when |
|---|---|---|---|
| 0.1 | Rotate the Atlas password; restrict network access to App Runner egress | S | Old credentials rejected; only App Runner can connect |
| 0.2 | Move to MongoDB M10+ with point-in-time restore; run one restore drill | S | A restore to a scratch cluster succeeds |
| 0.3 | Razorpay test mode end to end (orders, refunds, webhooks), then live keys | M | Pay, refund and partial refund pass on staging |
| 0.4 | Phone OTP with an SMS provider (MSG91 or Twilio) | S | Sign-in by phone works; failed sends don't use up the cap |
| 0.5 | Domain behind CloudFront; Google consent screen to production; SMTP | S–M | Any Google account can sign in; invite and reset emails arrive |
| 0.6 | Alarm email subscribed to `nabz-staging-alerts` | S | A test alarm reaches a person |

### Phase 1 (weeks 1–4): make the medicine loop honest and fast

| # | Item | Effort | Done when |
|---|---|---|---|
| 1.1 | **Assign the rider at `ACCEPTED`**, timed so the rider reaches the store as packing ends (prep estimate minus rider travel time); keep assign-at-ready as the fallback | M | Rider waiting time at store and total time both drop; the ETA formula matches the code |
| 1.2 | **Learned ETA v1:** rolling median prep time per store and median speed per zone and hour, from order milestones; show the promise before checkout and on Home | M | "% delivered by promise" is measured and above the target you set |
| 1.3 | **Live rider tracking for customers** on the existing AppSync channels (rider heartbeat → order channel) | M | Customers see the rider and a countdown from pickup |
| 1.4 | **Atlas Search** for medicines, services and stores: fuzzy matching, salt ↔ brand synonyms, Hinglish synonyms, autocomplete | M | "paracitamol", "dolo" and "bukhar ki dawai" return the right items |
| 1.5 | **Product photos and pack info** for the top 500 SKUs | M | No generic icons in the top results |
| 1.6 | **"Nabz Assured" stores:** 1–2 anchor chemists per launch zone commit to a core range, under 2-minute acceptance and daily stock confirmation, in return for ranking priority and a lower commission | M (mostly ops) | Each launch zone has an anchor; core-range fill rate is tracked |
| 1.7 | **Third-party courier fallback** when no Nabz rider is free within N minutes | M | No order waits more than N minutes for pickup |
| 1.8 | **Control tower v1** in the admin panel: live orders, riders and online staff per zone; SLA breaches; zone stress switch on the same screen | M | Ops can see and act on every late order in one view |
| 1.9 | **Free-delivery threshold experiment:** compare ₹249 with ₹349 or ₹399 in one zone each, behind a flag (the distance fee below it is built) | S | Contribution per order and conversion measured for each threshold |

### Phase 2 (weeks 3–8): nurse supply density and one customer flow

| # | Item | Effort | Done when |
|---|---|---|---|
| 2.1 | **Supply targets per zone and hour** (online verified nurses needed), shown to ops | S | The control tower shows supply gaps |
| 2.2 | **Demand heatmap for partners** ("busy near Malviya Nagar 6–9 pm") | M | Partners can see where to be online |
| 2.3 | **Online-hours incentive:** a minimum guarantee for verified nurses who stay online in a target zone and window and accept offers | M | Fewer `NO_STAFF` at peak |
| 2.4 | **Peak and late-night visit pricing** via the existing zone stress lever | S | Configurable, shown on the bill |
| 2.5 | **One booking flow** for nursing, physio and labs: what → when → where → pay, with one bill card | L | Same steps and components in the app and website |
| 2.6 | **One notifications inbox** (orders, visits, substitutions, offers) | M | All events in one list |
| 2.7 | **Prescription vault:** upload once, reuse on orders and refills, with an expiry | M | Repeat orders need no re-upload |

### Phase 3 (weeks 4–10, alongside): platform for real traffic

| # | Item | Effort | Done when |
|---|---|---|---|
| 3.1 | **SQS + one worker service** (ECS Fargate running the same code with `WORKER_ONLY=true`, or Lambda) for offer expiry, store SLA, rider assignment, notifications; remove `setImmediate` side effects | M | Offers expire on time at 3 a.m.; a restart loses no job |
| 3.2 | **CI/CD:** GitHub Actions runs lint and tests on every PR; merging to `develop` deploys staging | M | No laptop zips |
| 3.3 | **EAS Build and EAS Update**; AAB for the Play Store | M | UI fixes reach installed apps in minutes |
| 3.4 | **Sentry** in the apps, website and API | S | Customer crashes are visible with the release they came from |
| 3.5 | **Feature flags** on `platformSetting` (per zone, per percentage) | S | Experiments 1.9 and 2.3 run behind flags |
| 3.6 | **Domain events export** (order and visit milestones) to S3 + Athena, or a product-analytics tool | M | KPIs in [section 10](#10-kpis-to-run-the-business-on) come from one place |
| 3.7 | **Maestro journeys** and **one load test** (k6) of search → checkout → accept at 10× expected peak | M | Both run in CI before release |
| 3.8 | **ElastiCache Redis** before scaling beyond one instance at peak | S | Rate limits and caches are shared |
| 3.9 | **CSP with nonces** (drop `'unsafe-inline'`) | S | CSP test passes without inline scripts |
| 3.10 | **Prune legacy:** unmount Nocturnal duty routes; archive `k8s/`, root `terraform/`, self-hosted monitoring; finish or delete `apps/patient-health` | M | Smaller attack surface and faster CI |

### Phase 4 (month 3 onwards): widen carefully

| # | Item | Condition to start |
|---|---|---|
| 4.1 | Labs marketplace live, with MedRush catalogue fields ported | Phase 1 KPIs hold in the launch zones |
| 4.2 | Physio and home-care marketplace live | Same |
| 4.3 | Urgent visit (priority dispatch) replacing the "Emergency" page | Nurse supply targets met at peak |
| 4.4 | Teleconsultation, rebuilt, as the prescription path into the pharmacy | A doctor supply plan and legal review |
| 4.5 | B2B2C: post-discharge packages through hospitals (Nocturnal relationships) | Packages and plans proven with direct customers |
| 4.6 | Dark-store pilot (store-in-store with one anchor chemist) | Demand signal shows repeated misses of the same SKUs in one zone |
| 4.7 | Billing-software sync (Marg, GoFrugal) | Anchor stores asking for it |

---

## 10. KPIs to run the business on

Most can be computed from data already stored (order milestones, attempts, timelines, dispatch state). The targets are starting points to revisit after two weeks of real traffic.

| KPI | Definition | Source in code | Starting target |
|---|---|---|---|
| Promise adherence | Medicine orders delivered by the promised time | `pharmacyOrder` milestones, `eta.promisedAt` | ≥ 85% |
| First-store acceptance | Orders accepted by the first store offered | `pharmacyOrder` attempts | ≥ 90% |
| Line fill rate | Ordered lines delivered (not dropped) | Item status | ≥ 95% |
| Substitution acceptance | Offered substitutes the customer accepts | `pharmacySubstitutionService` | Track |
| Time to rider pickup | Ready → picked up | Milestones | ≤ 5 min |
| "Book now" match rate | ASAP visits matched before giving up | `nurseBooking.dispatch` | ≥ 90% |
| Time to match | Request → accepted offer | Dispatch timestamps | ≤ 3 min |
| Nurse arrival time | Accepted → arrived | Visit timeline | ≤ 45 min |
| Cancellation rate | By customer, by partner, by system | Status history | Track by reason |
| Repeat rate | Customers ordering again within 30 days | Orders, bookings | Track by cohort |
| Contribution per order | Revenue − rider cost − payment fees − refunds − credits | `settlementEntry` | Positive in each zone |
| Plus attach rate | Active customers with Plus | `membership` | Track |

---

## 11. Risks to watch

| Risk | Mitigation |
|---|---|
| Stores' stock is wrong, so orders bounce between stores | Anchor stores, confirmation streaks, reassignment (built), fill-rate per store with auto-pause |
| Not enough nurses online at peak | Supply targets, heatmaps, online-hours guarantee; launch in 2–3 zones only |
| Thin pharmacy margins: with free delivery from ₹249, a ₹249–₹400 basket delivered by a Nabz rider doesn't cover the ride | Batch riders (₹10 per extra drop, not a second fare); let anchor stores self-deliver nearby orders; test a ₹349–₹399 threshold; keep surge and the night fee on free baskets (built); grow basket size with refills and visit supplies; Plus; ads |
| Clinical or legal exposure (SOS, prescriptions, teleconsult) | Urgent visit instead of SOS; pharmacist verification (built); legal review before teleconsult; GST treatment confirmed with a CA |
| Losing data or a key | M10 backups and a restore drill; release key in Secrets Manager (done); enrol in Play App Signing |
| Team bandwidth across four verticals | Sequence verticals by zone; prune legacy code |

---

## 12. Security notes from this audit

Following the project's security policy, these were flagged with `WARNING` comments in the code on `feature/medrush-core`. They do not affect Nabz unless that code is merged.

| File | Issue | Secure alternative |
|---|---|---|
| `controllers/emergencyController.js` `getEmergency` | Any signed-in user can read any SOS, including the patient's phone, blood group, address, contacts and the staff member's location (IDOR) | Allow only the owning patient, the assigned staff member and admins, as `getConsultation` does |
| `controllers/emergencyController.js` `acceptEmergency` | Any staff member can take any emergency in any state; read-modify-save race | One compare-and-set on `{ _id, status: 'DISPATCHING', 'dispatchAttempts.staff': staffId }` |
| `controllers/emergencyController.js` `cancelEmergency` | Anyone signed in can cancel anyone's live SOS | Ownership check plus compare-and-set on cancellable statuses |
| `services/socketTrackingService.js` | No socket authentication; room ids, `staffId` and `senderId` are taken from the client | Verify the JWT in `io.use()`, take identity from the token, check room membership. Better: use Nabz's AppSync channel tokens |
