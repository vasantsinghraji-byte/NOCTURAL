# Physio and lab marketplace: plan

*7 Oct 2026. For the Nabz team: the new way customers choose and book physiotherapists and path labs, the edge cases, and what else should change.*

## The idea in one line

Physios and labs work like restaurants on Zomato or Swiggy. Each one has its own **menu** (rate card) with its own prices. The customer compares them and picks one. Nabz runs the shared catalog, the booking, the payment and the trust layer.

| Zomato / Swiggy | Nabz |
|---|---|
| Restaurant | Physio (on their own), physio clinic, or path lab |
| Restaurant outlet | Branch (a clinic or lab can have several) |
| Dish | Service on the rate card: "Knee pain therapy, 45 min", "CBC test" |
| Same dish, different price per restaurant | Same service, each provider sets their own price |
| Delivery vs dine-in | Home visit vs at the clinic (or lab) |
| Delivery fee by distance | Travel fee, ₹10–15 per km |
| Quantity | Number of sessions |
| One restaurant per cart | One provider per booking |
| Restaurant "closed now" | Provider paused, on leave, or fully booked |

## Where we are today

| Area | Today | Gap |
|---|---|---|
| Physio | One Nabz price per service for everyone. "Book now" offers the visit to the nearest online physio (Uber style). The customer can name a professional, but the price stays the same. Packages are fixed products: 5, 10 or 15 sessions. | No per-physio prices, no clinic visits, no travel fee, sessions are fixed products instead of a number the customer picks. |
| Path labs | Lab partner login and a "coming soon" page. A separate branch (`feature/medrush-core`) has a test catalog with **one Nabz price per test**. | Everything for a marketplace. That branch's test details (sample type, fasting, report time) can be reused; its pricing cannot. |
| Addresses | The server can store several addresses per customer. | The apps and website do not offer them. Home visits and travel fees depend on the address, so this now matters. |

## How it works for the customer

1. **Pick what you need.** Search or browse services ("Back pain", "Thyroid test") or browse providers near you.
2. **Compare providers.** Each card shows the price for that service, home or clinic, distance, rating, reviews, gender, languages, experience, next free slot, and the travel fee to your saved address.
3. **Open a provider.** You see their full rate card, like a restaurant menu: services, price at the clinic, price at home, session length, and multi-session discounts.
4. **Choose home or clinic.**
   - **Clinic:** you see the address, a map and the distance. No travel fee.
   - **Home:** pick a saved address or add one. Nabz works out the distance and shows the travel fee. If the address is beyond the physio's home-visit radius, that physio shows "Clinic only for this address".
5. **Choose the number of sessions:** 1 to 30. For more than one, pick the days of the week and the time. The physio's discount for more sessions applies automatically, for example "10% off from 10 sessions".
6. **See the full bill before paying:** service × sessions, discount, travel fee × home sessions, Nabz fee, tax, total. Then pay: the whole plan now, or session by session.
7. **During the plan:** the same physio every session. Reschedule a session, change the address for one session (the travel fee is worked out again), or change physio for the rest of the sessions.

**Labs work the same way.** The customer picks tests or a checkup package, compares labs (price, NABL accreditation, report time, home collection), picks home collection or a walk-in visit, and books. A cart holds tests from **one lab** only, because the samples go to one lab.

## How it works for the provider

- **Shop profile:** name, photos, qualification, council registration, clinic address and hours, languages, bio.
- **Rate card:** chosen from the Nabz catalog (no made-up services). For each service:
  - offered at the clinic: yes or no, and the price;
  - offered at home: yes or no, and the price (defaults to the clinic price);
  - session length;
  - optional discounts for more sessions, for example 5+ sessions 5% off, 10+ sessions 10% off.
- **Home visits:** how far they travel (radius, up to 25 km), their rate per km (from ₹10 to ₹15), and where trips start from (the clinic or their home base).
- **Calendar:** weekly hours, separately for clinic and home; how many patients the clinic can see at once (beds or physios); leave days; a buffer between home visits for travel.
- **Pause switch:** "Not taking new bookings", like a restaurant closing for the day. Existing bookings stay.
- **Labs also set:** report time per test, which tests can be collected at home, the home collection fee (the same per-km rule, or free above a basket value), and their phlebotomists.

## Prices and fees

**The travel fee**, worked out by Nabz, never typed in by the provider or the app:

> travel fee = road km from the provider's start point to the visit address (rounded up to the next km) × the provider's ₹/km, with a minimum fee (Nabz setting, default ₹30)

- Road km is the straight-line distance × 1.3 until a maps service (Google Distance Matrix or OSRM) is connected; then it is the real road distance.
- It is charged once per home session: each session is a separate trip.
- It is one-way, not a round trip.
- The travel fee goes to the provider in full, with no Nabz commission on it, because it covers their fuel and time.

**Worked example: 10 home sessions of knee therapy with Dr. A**

| Line | Amount |
|---|---|
| Knee therapy at home, ₹600 × 10 | ₹6,000 |
| Dr. A's discount for 10+ sessions, 10% | − ₹600 |
| Travel: 6.2 km → 7 km × ₹12 = ₹84 × 10 | ₹840 |
| Nabz fee (on the service, not the travel) | as set in `config/revenue.js` |
| Tax | see "Tax" below |

**Price guardrails.** Each catalog service has a Nabz price floor and ceiling, for example knee therapy from ₹300 to ₹2,500 per session.
- The floor stops ₹1 listings meant to win the ranking, followed by a request for cash at the door.
- The ceiling stops price gouging.
- An admin can approve a price outside the band (for example, a senior sports physio).

**Locked prices.** The bill the customer sees is a **quote**, held for 15 minutes. Booking uses the quote, not the prices the app sends. If the provider changes a price before the customer pays, the customer sees "price changed" and confirms again. Once booked, every session of the plan keeps the booked price, even if the rate card changes later.

## Paying for several sessions

- **Pay as you go:** each session is paid after it happens (cash or online), as today.
- **Pay for the plan now:** the customer pays the whole plan upfront and gets the multi-session discount. Nabz holds the money and pays the physio **after each completed session**, through the settlement ledger that already exists. If a physio stops coming, the unused money is still there to refund.
- **Refund of unused sessions:** what was paid, minus the completed sessions at the **non-discounted** price, minus any cancellation fees, and never below zero. This stops "buy 10 for the discount, use 3, refund 7 at the discounted rate".
- **Plans expire:** sessions must be used within the number of sessions × 2 weeks, with at least 4 weeks. The customer can ask for one extension. Unused sessions after expiry are refunded by the rule above.

## Edge cases and how we handle them

### Prices and rate cards

| Situation | What happens |
|---|---|
| The physio changes a price while the customer is checking out | The quote has expired or no longer matches, so the customer is shown "Price changed from ₹600 to ₹650" and confirms again. |
| The physio changes a price in the middle of a 10-session plan | The remaining sessions keep the booked price. |
| The physio stops offering a service at home while home sessions are booked | Booked sessions stand. The provider is warned while editing: "You have 6 upcoming home sessions for this. They stay booked." To drop them, the provider must release them, and the customer is offered a clinic visit, another physio or a refund. |
| A price outside the floor and ceiling | Rejected with the allowed range, unless an admin has approved it. |
| The same person opens two shops to appear twice in search | One shop per council registration number (unique); a clinic lists its physios inside one shop. |

### Home visits and distance

| Situation | What happens |
|---|---|
| The address is outside the physio's radius | Home is not offered for that address. The card says "Clinic only for this address" or the physio is hidden from home-visit results. |
| A customer fakes the map pin near the physio to pay less travel | The pin must fall inside the area of the pincode they typed (within about 15 km of the pincode centre). At arrival, the physio's phone location is recorded with the visit code. If the real visit place is more than 2 km from the booked pin, the visit is flagged and ops can charge the difference. |
| A river or one-way streets make the road much longer than the straight line | The 1.3 multiplier covers most of it. The provider can raise a distance dispute from the visit. Moving to a maps service removes the issue. |
| The patient moves in the middle of a plan (for example to a daughter's house after surgery) | Change the address for the remaining sessions or for one session. The travel fee is worked out again; if the new address is out of range, offer clinic sessions, another physio or a refund for the rest. |
| Two family members need physio at the same address back to back | The second session at the same address, next to the first, has no travel fee (one trip). |
| The physio is stuck in traffic | Live ETA (exists today). A 15-minute grace period. After 30 minutes late, the customer can cancel for free and the physio gets a reliability strike. |

### Sessions, plans and calendars

| Situation | What happens |
|---|---|
| Two customers grab the same slot at the same moment | Slots are reserved with an atomic counter that has the provider's capacity as its limit (1 for a solo home physio, N for a clinic with N beds). The second customer gets "That time was just taken" and the next free times. |
| A home session runs late and the next home visit is across town | Home slots include the travel buffer the physio sets (default 30 minutes). Slots that cannot be reached in time are not offered. |
| The physio takes leave during a plan | Sessions on leave days are flagged. The customer chooses: move them, take a substitute for those days only, or refund those sessions. |
| The physio is suspended or loses verification in the middle of a plan | Sessions are released (exists today). The customer gets a choice of another physio at the same or lower price, or a refund of the unused sessions. |
| The customer misses a clinic session (no-show) | That session is used up. For pay-as-you-go, a no-show fee as in the cancellation rules. |
| The customer is not home for a home visit | The travel fee is not refunded, plus the late-cancellation fee that exists today. |
| The physio does not turn up | Full refund for that session, a ₹100 credit to the customer, and a reliability strike for the physio. Three strikes in 30 days: paused from new bookings. |
| After the first visit the physio says another service is needed (booked "back pain", needs "neuro rehab") | The physio sends a **plan proposal** from their app: service, number of sessions, price. The customer accepts and pays the difference, or declines. Nothing changes without the customer's consent. |
| The physio wants to charge an assessment first | "Assessment" is a catalog service. Many physios will list it, and a plan usually starts with it. |
| The session runs over time | No automatic extra charge. The physio can add an extension the customer approves in the app. |
| The plan expires with sessions left | One extension on request, otherwise a refund by the rule above. |
| A female patient wants a female physio at home | A gender filter on search, plus the "preferred gender" that exists today. |
| A son abroad books for his mother | "Book for someone else" (already planned): the visit code and updates go to the mother's phone, and the son pays. |

### Labs

| Situation | What happens |
|---|---|
| The customer wants 5 tests and the chosen lab offers only 4 | The lab card says "4 of your 5 tests", with the missing one named. The customer can choose another lab or remove the test. |
| A test cannot be collected at home (for example a glucose tolerance test needs 3 draws over 2 hours) | Marked "lab visit only" in the catalog. A cart with it offers only a lab visit, or splits into two bookings with the customer's consent. |
| A fasting test | Only morning collection slots (6 to 10 am) are offered, with a reminder the evening before. |
| The sample is rejected (clotted, too little) | Free re-collection booked by the lab. The report time restarts. |
| The report is later than the promised time | Automatic credit to the customer. It counts against the lab's rating. |
| A test that needs a doctor's prescription or a consent form | The catalog marks it; checkout asks for the upload or consent first. |
| A checkup package compared with buying the tests one by one | The package card shows "You save ₹X" against the same lab's test prices. |
| Who sees the report | The patient. The booker only with the patient's consent (see the "book for someone else" plan). |

### Payments and trust

| Situation | What happens |
|---|---|
| The provider asks for extra cash at the door | All prices come from the rate card. The customer has a "Was asked to pay extra" button on the visit. Confirmed cases mean a strike and possible suspension. |
| The customer and physio continue outside the app after the first visit (common in physio) | Make staying worth it: plan discounts, session notes and an exercise plan in the app, receipts that work for insurance, the visit code and tracking for safety, and a lower Nabz commission for repeat patients of the same physio. Phone numbers stay masked. |
| Fake reviews | Only completed bookings can be rated (exists today). Ratings are kept per provider and per service. |
| Rounding | All amounts are worked out in paise (whole numbers) and shown in rupees. |

## Tax: please confirm with your CA

Today Nabz adds 18% GST on the visit price **and** the Nabz fee. Under GST exemption notification 12/2017 (entry 74), health care by clinical establishments, registered practitioners and paramedics (physiotherapy and lab diagnostics are normally included) is **exempt**. If that holds, customers are overpaying 18% on the care itself today. The usual setup is:
- no GST on the physio's or lab's service or on the travel fee;
- 18% GST on the Nabz platform fee only.

This should be a setting, switched only after the CA confirms.

## What changes in the system

### New

| Part | What it holds |
|---|---|
| **Provider shop** (`CareStore`) | Type (solo physio, physio clinic, path lab), owner, name, photos, council registration or NABL number, address and map point, hours, home radius, ₹/km, travel start point, capacity, pause switch, approval status, rating. Built like the pharmacy store model, which already works. |
| **Rate card item** (`RateCardItem`) | Shop + catalog service; clinic on/off and price; home on/off and price; session length; multi-session discounts; for labs, report time and home collection. Built like the pharmacy's store-inventory model (store + product + price). |
| **Quote** | The locked bill: lines, totals, expiry, a fingerprint of the prices used. Booking requires a valid quote. |
| **Care plan** | One booking of N sessions: provider, service, home or clinic, sessions booked and used, locked prices, payment mode, expiry, refund state. Each session stays a visit as today, linked to the plan. |
| **Slot reservation** | One record per provider and time slot, with a counter and capacity, so two customers can never take the last place at the same time. |
| **Address book** (UI) | Saved addresses on app and website: label ("Mom's home"), map pin, default address. The server part exists. |

### Changed

- **Catalog:** each service gets a price floor and ceiling, a "can be done at home" flag, and (for labs) sample type, fasting, report time and "needs prescription". Fixed package products (5, 10 and 15 sessions) are retired: the number of sessions becomes a choice, not a product.
- **Visit (booking):** gains shop, practitioner, home or clinic, travel details (km, ₹/km, fee), price snapshot, plan link, and the quote it came from.
- **Search:** the nearest shops offering a service, filtered by home or clinic, distance, price, rating, gender and language. Uses a map index on the shop location.
- **Payouts:** prepaid plans are paid out to the provider per completed session. Travel fees go to the provider with no commission.

## Suggestions for the rest of Nabz

1. **One booking engine for every service.** Nursing, physio, labs and (later) consults all become "a booking with line items from a provider". Today the booking has a hard-coded list of service names, and each new service needs a code change. Services should come from the catalog. One engine means one place for payments, cancellations, refunds, the visit code, tracking and reviews.
2. **One partner structure for everyone:** organisation (legal entity, KYC, bank account, GSTIN) → branches (location, hours, radius) → people (verification) → rate card. Today pharmacies, nurses and physios each have their own version of KYC, payouts and verification. One structure removes the duplicates and lets a clinic run nursing, physio and a pharmacy under one account.
3. **Keep Uber-style matching for urgent nursing.** An injection or IV drip "now" is about who is nearest and free, not about choosing. Physio, labs and planned nursing suit the marketplace. Both can share the same shops and rate cards; "Book now" just picks the best nearby shop automatically.
4. **Quotes everywhere.** Pharmacy checkout, nursing and labs should all book from a locked quote, so the app can never decide the price and a price change mid-checkout is handled the same way everywhere.
5. **Money in paise.** All amounts as whole numbers of paise, to end rounding drift between the bill, the payment and the payout.
6. **Real road distance.** Connect a maps service (Google Distance Matrix, or OSRM run by Nabz) for travel fees and ETAs, cached by area.
7. **Fix GST** as above, after the CA confirms.
8. **Ratings per service and per practitioner.** A clinic can be great at sports injuries and average at neuro rehab.

## Build order

| Step | What | Where |
|---|---|---|
| 1 | Shops, rate cards, price guardrails, quote and travel fee engine, search, care plans with N sessions, slot reservation, refunds of unused sessions. Bot tests for every edge case above. | Server |
| 2 | Customer: browse and compare physios, provider menu, home or clinic, address book, sessions picker, bill, plan page. | Website and apps |
| 3 | Partner: shop setup, rate card editor, home radius and ₹/km, calendar and leave, plan proposals. | Website and partner app |
| 4 | Labs on the same engine: lab shops, test rate cards, one-lab cart, home collection, sample tracking, reports. | Server, website and apps |
| 5 | Move existing physio services and providers over; retire the fixed package products. | Server (migration script) |

## Build status (7 Oct 2026)

**Step 1 (server) is built and tested:** 19 unit tests and 27 end-to-end tests against a real database. All of it lives under `/api/v1/marketplace`:

- **Shops:**
  - verified physios go live at once; labs and unverified professionals wait for review;
  - one shop per registration number;
  - only safe fields are editable by the shop.
- **Rate cards:**
  - clinic and home prices inside the catalog floor and ceiling (an admin can approve a different range);
  - multi-session discounts;
  - every price change is versioned.
- **Search and compare:**
  - home results only show shops whose area covers the address, with the travel fee;
  - sort by recommended, price, distance or rating;
  - no contact details or private home base in public results.
- **Quotes:**
  - the full bill with travel ₹/km, locked for 15 minutes;
  - GST switch (off until the CA confirms).
- **Plans of 1–30 sessions:**
  - pay per session or prepaid (discount);
  - all sessions' times reserved atomically (two customers can never take the last slot, a 2-bed clinic takes exactly 2);
  - a double tap books once;
  - a price change asks for confirmation.
- **During a plan:**
  - move a session;
  - change the address (travel re-priced, out of range refused);
  - cancel a session or the plan;
  - the professional releasing a session, leave days and suspension all hand the session back to the customer (not to dispatch);
  - short-notice releases add a strike, and three strikes pause the shop.
- **Money:**
  - travel goes to the professional with no commission;
  - prepaid plans pay the professional per completed session;
  - unused sessions are refunded at the list price (the discounted price if the provider was at fault);
  - unpaid holds expire;
  - a late payment is fully refunded.
- **Reports:** "asked to pay extra" and "didn't come" flag the visit for ops.

**Built since (8 Oct 2026):** steps 2–4 are live on staging.

- **Labs** on the same engine: one-lab cart, compare, fasting mornings, collection code, sample steps, report upload and private report links, rejected samples with free re-collection, late-report credit, pay at collection or online.
- **Home care** with the same named caregiver every day, night shifts across midnight, live-in care with travel charged once, agency teams.
- **Customer screens** on the website and both apps: care hub, compare, shop menu, booking with a live bill, plans, lab tests, saved addresses, Nabz credit, plan suggestions.
- **Partner screens** on the website and the partner app: My Shop (profile, hours, rate card, team, leave and pause, plans), ads, lab desk, "Suggest a plan" after a visit.
- **Admin** on the website: shop review, catalog, refunds, reports, needs-action queue, sessions and lab boards, offers, ads and settings (propose → approve).
- **Also done:** arrival location check, free second trip for family at one address, no-show credit through the customer wallet, online payment for plans, lab tests and ad top-ups (Razorpay; needs the live keys).

**Still open:**

| Item | Note |
|---|---|
| Moving existing physio services and providers over; retiring the fixed packages | Step 5 |
| Pin-vs-pincode check at address entry | The arrival check covers fake pins today |
| Changing physio in the middle of a plan | Today: cancel the rest (refunded), then book the new physio |
| Real road distance (maps service) and the GST switch after the CA confirms | Settings ready |
