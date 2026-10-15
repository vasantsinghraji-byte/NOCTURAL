# Phase 1.1 rollout plan (27 Sep 2026)

Source: founders' Phase 1.1 note (Human track 1–7, Tech track 1–2).
Built on what is live (see [CODE_CONTEXT.md](../product/CODE_CONTEXT.md)).

## Today, by 5 pm: ships to staging and both apps

| # | Note item | What we build | Where |
|---|---|---|---|
| A | 3, 4, 7 | **Partner types:** phlebotomist, PRP technician, and hospital / nursing home join the partner application (waitlist, reviewed by admin), alongside nurse/physio, pharmacy, lab and delivery. | API, website `/partners`, Partner app "Join" |
| B | 5 | **Physio gender:** partner applications record gender, so ops can track the 2 : 8 M : F hiring target. Approved physios carry it into matching, where the customer's preferred gender already applies. | API, forms, admin panel (M : F count) |
| C | 5 "book from distance" | **Book for someone else:** a toggle on the booking form. It takes the patient's name, age and gender plus the on-site contact person and phone. The professional sees that contact (inside the usual phone-visibility window) instead of the booker's. | API validation, website booking, customer app |
| D | Tech 1 | **Demo data:** demo stores stocked with realistic common medicines; demo accounts for a nurse, a physio and a pharmacy, so the Partner and customer app demo end to end. | Staging database seed |
| E | — | Deploy the API and website, and rebuild both APKs. Run the Partner app on the emulator for joint testing. | Staging |

## Next: Phase 1.1b (needs a day or more, or a decision first)

| # | Note item | Work | Blocked on |
|---|---|---|---|
| 1 | 2 Labs (5 labs, common rate list) | Port the lab module from `feature/medrush-core`, then add:<br>• An admin-managed **common rate list** (one price per test across partner labs).<br>• Lab partner dashboard.<br>• Home-collection booking. | Merge with the uncommitted lab work on `feature/medrush-core`. The rate list itself comes from lab negotiations (Human track). |
| 2 | 3 Phlebotomist | Dispatch phlebotomists to lab bookings (reuse nurse dispatch), sample handover, and report upload. | Item 1 |
| 3 | 4 PRP technician | A PRP service only as part of a doctor-led visit. | **Medical/legal decision:** PRP injection is a medical procedure. Confirm who performs it and under which doctor. |
| 4 | 1 Delivery (freelance) | Rider app flow: accept delivery, pick up from the store, hand over with the delivery code, earnings. Reuses the pharmacy order states. | Rider onboarding and payout terms |
| 5 | 6 Packages | Package purchase with scheduled sessions, sessions-left counter, reschedule, same professional preferred. | Package prices from the team |
| 6 | 7 Hospital / nursing | Partner onboarding, referral of discharged patients to post-surgery packages. | Commercial terms |
| 7 | 5 Book from distance, part 2 | Pick the visit address on a map or by search (geocoding) instead of the booker's location. | Choose a maps provider (Google or Ola Maps) plus an API key |
| 8 | Tech 2 Domain and hosting | Attach `nabz.in` (or chosen domain) to App Runner (API `api.`, web `www.`), SSL, and update the app base URLs. | **Buy the domain** and give DNS access |

## Test script for the joint test (after 5 pm build)

1. **Partner app (emulator), signed in as the demo nurse:** go online. The app rings when a request arrives.
2. **Customer app (phone):** book a physio for "someone else" with an on-site contact. Prefer a female professional.
3. **Partner app:** accept the offer and check that the on-site contact shows. Move the visit to on the way. Start it with the customer's visit code. Complete it with the cash collected.
4. **Customer app:** order medicines from a demo store and pay by cash on delivery.
5. **Partner app, signed in as the demo pharmacy:** accept, pack, then mark delivered with the customer's delivery code.
6. **Website:** apply as a phlebotomist and as a physio (with gender). In the admin panel, check the queue and the M : F count.
