# Admin controls and ads: guide

*7 Oct 2026. For the Nabz team: everything the admin panel should control, and how to place ads the way Swiggy and Zomato do, adapted for health care.*

Part 1 lists what the admin must be able to do: what exists today and what to add, in priority order. Part 2 is the ads guide: the ad products, where they go, how they are ranked, the health-care rules, and the admin controls over all of it.

**Priority labels:**
- **Launch:** needed before real customers.
- **Soon:** within the first months.
- **Later:** when the volume justifies it.

---

# Part 1: What the admin controls

## Today's admin panel

These already exist:
- **Live logs.**
- **Payments.**
- **Users:** search, with masked details.
- **Partner documents:** each view is logged.
- **Verification:** ID, police check and council.
- **Partner applications.**
- **Withdrawals.**
- **Revenue.**
- **Push campaigns.**
- **Security:** sensitive actions need a fresh two-step code, and an audit log records who did what.
- **Pharmacy vendor approval:** server side.
- **Marketplace (new today, server only, no admin screen yet):** approve or suspend a shop, approve an out-of-band price, add a reliability strike.

## Rules for every admin action

1. **Least privilege:** use separate admin roles instead of one all-powerful admin.
   - Super admin.
   - Operations: bookings, partners.
   - Finance: refunds, payouts.
   - Support: customers.
   - Content: banners, ads, catalog.

   Today there is only `platform_admin`. **Launch.**
2. **Fresh two-step code** for anything touching money, partner trust or personal data. This exists today; keep it on every new action.
3. **Maker-checker for money and prices:** one admin proposes, a second approves. This covers refunds above ₹5,000, fee changes, commission changes and manual payouts. **Soon.**
4. **Everything is logged:** who, what, before and after, why (a reason is required). The audit log exists today; extend it to every new action.
5. **Changes never rewrite the past.** New fees and prices apply to new bookings only. Booked visits and plans keep their locked prices (the marketplace already works this way).
6. **Personal data stays masked** until a reason is given. The view is logged.

## What to add, by area

### 1. Shops (physios, clinics, labs, pharmacies)

| Control | Why | Priority |
|---|---|---|
| Review queue for new shops: approve, reject (with reason), ask for changes | Labs and unverified professionals wait for review (built on the server; needs the screen) | Launch |
| Suspend / reinstate a shop | Booked sessions are released to their customers automatically (built) | Launch |
| See a shop's rate card, price history and upcoming bookings | Answer customer complaints; spot price games | Launch |
| Approve a price outside the catalog band for one shop | For example, a senior sports physio above the ceiling (built on the server) | Launch |
| Reliability: strikes, no-shows, late releases, cancellation rate; three strikes in 30 days auto-pauses the shop (built); admin can lift the pause | Keep quality up without manual policing | Launch |
| Licence and accreditation expiry (council registration, NABL, drug licence) with automatic pause on expiry | Legal requirement; pharmacy already does this | Soon |
| Mark a lab "NABL accredited" (badge) after checking the certificate | Badge must be earned, not self-declared | Launch |
| Duplicate detection: same registration number, phone, bank account or PAN across shops | One person must not list twice | Soon |
| Add or remove a clinic's practitioners | Clinics with several physios | Soon |
| Lower commission for a shop for a period (launch partner deals) | Onboarding incentives | Later |

### 2. Catalog (services, tests, packages)

| Control | Why | Priority |
|---|---|---|
| Add / edit / retire catalog services: name, description, category, session length | Shops can only list catalog services | Launch |
| Price floor and ceiling per service (later per city) | Stops ₹1 listings and gouging | Launch |
| Home allowed / clinic allowed per service | Some services must not be done at home | Launch |
| Lab tests: sample type, fasting hours, home collection possible, default report time, needs prescription or consent | Drives slots, reminders and checkout rules | Launch (with labs) |
| Checkup packages: which tests are inside | "You save ₹X" must be true | Launch (with labs) |
| Sort order, "popular" flag, icons and images | Home and browse pages | Soon |
| Suggest-a-service queue (shops request a service that isn't in the catalog) | Grow the catalog safely | Later |

### 3. Prices, fees and rules

Today these live in `config/revenue.js` and need an environment-variable change and a redeploy. Move them to an admin settings page with a history, maker-checker and a start date.

| Setting | Today's value | Priority |
|---|---|---|
| Nabz fee on care visits | 15% | Launch |
| Provider commission tiers | 20% / 15% / 12% by monthly volume | Launch |
| Travel band: min and max ₹/km, minimum fee, road factor, max radius | ₹10–15, ₹30, ×1.3, 25 km | Launch |
| Plans: max sessions, weeks per session, quote validity, prepaid hold time | 30, 2 weeks, 15 min, 20 min | Soon |
| Late cancellation fee and grace period | ₹100 | Launch |
| Delivery fee, free-delivery threshold, night and surge charges (pharmacy) | ₹25, ₹499, ₹20, ×1.5 / ×2 | Soon |
| Nabz Plus price and trial length | ₹149, 7 days | Soon |
| GST: "health care exempt" switch (only after the CA confirms) | Off | Launch |

### 4. Bookings and plans (daily operations)

| Control | Why | Priority |
|---|---|---|
| Live board: today's visits by status, late arrivals, visits that haven't started on time | Ops sees problems before customers call | Launch |
| "Needs action" queue: sessions a provider released (marketplace) and visits with no staff (dispatch) | Call the customer, suggest another provider | Launch |
| Reported problems: "asked to pay extra", "didn't come"; resolve with a strike, refund or credit | Built on the server as flags; needs the screen and the outcomes | Launch |
| SOS queue with live location and one-tap call | Safety (SOS exists; needs a dedicated screen) | Launch |
| Cancel any visit or plan with a reason (free for the customer when Nabz or the provider is at fault) | Clean exits | Launch |
| Move a plan's remaining sessions to another provider, with the customer's consent and the price difference handled | Provider suspended in the middle of a plan | Soon |
| Extend a plan's expiry once | Customer in hospital, travelling | Soon |
| Labs: sample tracking board (collected, in transit, at the lab, report ready), late reports, rejected samples and free re-collection | Lab operations | Launch (with labs) |

### 5. Money

| Control | Why | Priority |
|---|---|---|
| Refund queue: prepaid plan refunds (the server already calculates them), pharmacy and visit refunds; approve, send through Razorpay, mark processed | Customers' money | Launch |
| Payouts and withdrawals (exists) plus a hold on a partner's payout during a dispute | Fraud and complaints | Launch |
| Cash mismatches: "cash short" visits (already flagged) and partners' cash balance owed to Nabz | Pay-after-visit leaks | Launch |
| Settlement ledger per partner and per booking (exists on the server) | Answer "why was I paid ₹X" | Soon |
| Customer dues: view, waive (with reason) | Goodwill after a bad experience | Soon |
| Credits / wallet for compensation (for example ₹100 after a provider no-show) | Promised in the marketplace plan; needs a wallet | Soon |
| GST and TDS reports, invoices, monthly statements for partners | Compliance | Soon |
| Chargebacks and disputes | Payment gateway disputes | Later |

### 6. Customers

| Control | Why | Priority |
|---|---|---|
| Search, view (masked), booking history (exists) | Support | Launch |
| Block / unblock (abuse, fraud) with reason | Safety for partners | Launch |
| Grant or extend Nabz Plus | Goodwill, partnerships | Soon |
| Data deletion and data export requests (DPDP Act) | Legal | Launch |
| Consent records (book for someone else, report sharing) | Legal | Soon |

### 7. Quality and trust

| Control | Why | Priority |
|---|---|---|
| Review moderation: hide abusive or fake reviews (never hide a review just because it is negative) | Fair ratings | Soon |
| Suspicious patterns: many 5-star reviews from new accounts, the same device for the customer and the provider, refunds abuse | Rating and money fraud | Later |
| Strike and auto-pause thresholds | Tune the reliability rules | Soon |

### 8. Areas and launch

| Control | Why | Priority |
|---|---|---|
| Cities and areas on or off per service (physio, labs, pharmacy, nursing) | Launch city by city | Launch |
| Area stress lever (exists for pharmacy): shrink delivery radius in rain or rider shortage | Keep promises realistic | Exists |
| Max home-visit radius per city | Big cities vs small towns | Soon |

### 9. Content and messages

| Control | Why | Priority |
|---|---|---|
| Push campaigns (exists) | Re-engagement | Exists |
| Home banners managed by admin (today they are written in code) | See Part 2 | Soon |
| Announcements inside the apps (outage, new city) | Operations | Soon |
| Terms, privacy policy and FAQ versions, with customers asked to accept new terms | Legal | Soon |

### 10. Ads

All the controls are in Part 2, section 8.

---

# Part 2: Ads guide

## 1. How Swiggy and Zomato do it

- **Sponsored listings:**
  - Restaurants pay to appear higher in search and category results, marked "Ad" or "Promoted".
  - They pay per click or per order.
  - An ad only appears if the restaurant is open, delivers to you and matches what you searched.
- **Home carousel and banners:** big tiles on the home screen, sold per week per city, often for brand campaigns.
- **Offer badges:** "50% off up to ₹100", paid for by the restaurant, shown on its card and in an "Offers" filter.
- **Featured collections:** "Top rated near you", curated by the platform; partly paid, mostly earned.
- **Sponsored products** (Instamart): brands pay to appear first in product search.
- **Self-serve for partners:** set a budget and bid, see clicks, orders and return on spend.

**What makes it work: relevance comes first.**
- An ad only appears where an organic result could have appeared.
- Only a limited number of ad slots exist.
- Bad partners (low rating, closed, out of range) can't buy their way in.

## 2. What is different for health care

Ads must never put a customer's health or trust at risk. These rules are not optional:

1. **Safety gates before money.** An ad is eligible only if the provider is:
   - verified and approved, not paused or suspended;
   - offering the exact service and mode the customer is looking at;
   - in range of the customer's address;
   - free in the next 7 days;
   - rated at least 4.0 with 10 or more reviews (new providers have a separate free boost; see section 5).
2. **Clearly labelled** "Sponsored" on every ad. The ASCI code and the CCPA 2023 guidelines on dark patterns ban disguised ads.
3. **No ads in sensitive moments:**
   - emergency or SOS;
   - live visit tracking;
   - payment and checkout;
   - viewing lab reports or health records;
   - right after a cancellation by the provider.
4. **No medicine promotion that the law forbids.** Under the Drugs and Magic Remedies Act and the Drugs and Cosmetics Rules:
   - no ads for prescription medicines (Schedule H, H1, X);
   - no "cure" claims.

   Pharmacy ads are limited to OTC, wellness and devices.
5. **No targeting on health data without consent (DPDP Act).**
   - Target by **context**, meaning what the customer is browsing right now. Example: on the knee pain page, show knee physios.
   - Never target by their medical history, lab results or diagnoses.
6. **Price honesty:**
   - The price on an ad must be the provider's real rate-card price.
   - An offer badge must really apply at checkout.

   Both are checked automatically against the rate card.
7. **Ads never outrank safety.** A sponsored provider never pushes out the nearest available one in an urgent "Book now" flow. Urgent nursing gets no ads at all.

## 3. The ad products

| # | Product | What it is | How it's sold | Where |
|---|---|---|---|---|
| 1 | **Sponsored listing** | A physio, lab or nursing shop shown in a sponsored slot in search and category results | Cost per click (CPC) with a minimum bid; daily budget | Physio and lab search, service pages ("Knee pain therapy"), "Physios near you" |
| 2 | **Offer badge** | "10% off your first session", "Free home collection", funded by the provider | Free to run (the provider pays the discount), admin approved; shown in an "Offers" filter | On the provider card and shop page |
| 3 | **Home spotlight tile** | A tile in the home carousel for a provider or lab package | Fixed price per week per city area (cost per thousand views, CPM, later) | Customer home, max 1 of the 4 tiles |
| 4 | **Category banner** | A banner at the top of a service page ("Full body checkup from ₹999 at XYZ Labs") | CPM, one advertiser per page per week | Lab tests home, physio home |
| 5 | **Sponsored product** | An OTC or wellness product first in pharmacy search | CPC, brands or stores | Pharmacy search and categories, OTC only |
| 6 | **Helpful cross-sell** (house ad, not paid) | "Need a knee brace?" after booking knee physio | Free; Nabz's own pharmacy | Booking confirmation screen, one card |

Not recommended:
- **Push or SMS ads:** they annoy users and cost uninstalls. Keep push for Nabz's own campaigns, which exist.
- **Pop-ups or full-screen ads:** never.

## 4. Where ads go (placement map)

| Screen | Slots | Max ads | Format |
|---|---|---|---|
| Customer home | Carousel (4 tiles) | 1 sponsored tile | Spotlight tile |
| Physio or lab search results | Positions 2 and 6 | 2 in the first 10, never position 1 | Sponsored listing (same card as organic, plus "Sponsored") |
| Service page ("Knee pain therapy") | Top banner + positions 2 and 6 | 1 banner + 2 listings | Category banner, sponsored listing |
| Shop page | None | 0 | (No competitor ads on a provider's own page) |
| Pharmacy search | Positions 1 and 5 | 2 in the first 10 | Sponsored product |
| Booking confirmation | One card below the details | 1 | House cross-sell only |
| Checkout, payment, tracking, SOS, reports, records | None | 0 | None, ever |

Why position 1 is never sponsored for providers: the first result should be the best match for the patient. Swiggy also often keeps the top organic result.

## 5. How ads are ranked

Each sponsored slot runs a small auction among eligible ads (eligible means it passed the safety gates):

> ad score = bid × quality
>
> quality = rating (from 0 to 1) × completion rate × (1 − cancellation rate) × relevance

**Relevance** comes from distance (or home-radius fit), the service match and how soon the provider has free slots.

- **The winner pays just enough to beat the next ad** (second-price), never more than their bid. This stops bidding wars.
- **Minimum CPC:** for example ₹5 for physio, ₹3 for labs, ₹1 for products; admin can change it.
- **No double appearance:** if a provider is already in the organic top 3, their ad doesn't show in that list (the slot goes to the next ad).
- **Frequency cap:** the same ad at most 3 times per customer per day.
- **Pacing:** the daily budget is spread across the day, so an ad doesn't burn out by 10 am.
- **New provider boost (free, organic):** for their first 30 days, new verified providers get extra organic visibility. Otherwise only those who already have reviews can win, and new physios never get started.
- **Clicks that count:** the same customer clicking the same ad twice in a day counts once. Bots and the provider's own account never count.

**Attribution:** a booking within 7 days of clicking an ad counts as "from the ad", shown to the advertiser as orders and return on spend.

## 6. Self-serve for partners (partner app and website)

1. Pick a goal: "more bookings for knee therapy", "promote my full body checkup".
2. Pick the product: sponsored listing, offer badge, spotlight.
3. Pick the area: their city areas, by default within their home-visit radius.
4. Set a daily budget and a max CPC (Nabz suggests a bid).
5. Write the offer (if any), checked against their rate card.
6. Pay from an **ad wallet** (prepaid top-up, GST invoice). Spend is taken per click.
7. See results daily: views, clicks, bookings, spend, cost per booking.

Ads go live after an admin approval for the first campaign. Later campaigns from trusted advertisers go live automatically, with spot checks.

## 7. What the system needs

| Part | What it holds |
|---|---|
| Ad campaign | Advertiser (shop or store), product, placement, target (city, areas, services, home or clinic), bid, daily and total budget, start and end, status (draft, in review, active, paused, rejected, ended), creative (title, image, offer) |
| Ad events | Views and clicks per ad per day (counted, not stored one by one forever), booking attribution |
| Ad wallet | Top-ups, spend per day, refunds of unused balance, GST invoices |
| Placement settings (admin) | Per placement: on or off, max ads, positions, min CPC, rating floor, cities |
| Ad server | One function each list page calls: "give me up to N ads for this context". It applies the safety gates, the auction, caps, pacing and logging, and returns the ads already labelled |

The ad server sits **inside** the existing search (for example `careStoreService.searchStores`): organic results first, then ads merged into the allowed positions. That way an ad can never point to a provider who isn't open, in range or offering the service.

## 8. Admin controls for ads

| Control | What it does |
|---|---|
| **Kill switch** | Turns all ads off instantly (global, per city, per placement) |
| **Placement settings** | Positions, max ads per list, min CPC, rating and review floors, frequency cap, which screens allow ads |
| **Review queue** | Approve or reject advertisers and creatives, with a reason; banned words list ("cure", "guaranteed", medicine brand names on care ads) |
| **Pause any ad** | One tap, with a reason, logged |
| **Category rules** | Which categories may advertise where (for example no ads on emergency; pharmacy OTC only) |
| **Advertiser trust** | Auto-approve trusted advertisers; block an advertiser |
| **Budgets and billing** | Wallet balances, top-ups, refunds, invoices, credit for disputed clicks |
| **Fraud review** | Click patterns per advertiser (same device, bursts), with refunds of invalid clicks |
| **Reports** | Per placement and per city: ad revenue, CTR, bookings from ads, and the important one: **did ads lower booking rates?** If customers book less where ads show, reduce the ad load |
| **House ads** | Admin's own cards (Nabz Plus, new city, a health-awareness week) using the same slots when no paid ad qualifies |
| **Experiments** | Show ads to a share of customers (for example 50%) and compare bookings before rolling out |

## 9. Rollout plan

| Phase | What | Why |
|---|---|---|
| **A: Launch** | House ads only (Plus, new services), offer badges funded by providers, admin-curated "Featured" (free). The kill switch and placement settings are built. | Build the slots and rules with no money at risk; learn what customers click |
| **B: After about 1,000 bookings a month in a city** | Sponsored listings with CPC, ad wallet, partner self-serve, admin review queue, reports | Enough traffic for ads to work for partners |
| **C: Later** | Home spotlight and category banners (CPM), pharmacy sponsored products (OTC brands) | Brand money once Nabz has reach |

## 10. Numbers to watch

| Metric | Healthy | Act if |
|---|---|---|
| Ads in the first 10 results | ≤ 2 | Never more |
| Booking rate on lists with ads vs without | Within 5% | Ads lower bookings more than 5%: reduce the ad load or raise the quality floor |
| Ad CTR (sponsored listing) | 2–6% | Below 1%: ads are irrelevant; tighten targeting |
| Complaints mentioning "ad" / "sponsored" | Near zero | Any rise: review placements |
| Share of revenue from ads | Grows slowly | Never let ads replace earning trust |
