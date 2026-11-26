# What's built in Nabz

*State of the `feature/nabz-care-marketplace` branch, October 2026.*

Nabz is a home-healthcare marketplace in Jaipur. It has four surfaces:
- **Nabz app** (Android) for customers.
- **Nabz Partner app** (Android) for nurses, physiotherapists, labs, pharmacies and riders.
- **Website** (Next.js) with the same features as the apps.
- **Admin panel** on the website.

Every customer and partner feature ships in both an app and the website. The API is a Node/Express monolith on MongoDB, served at `/api/v1`.

---

## Customers

**Home**
- Address and search at the top, then a one-line count of verified staff online nearby.
- "Nurse at home" services in a 4 × 2 grid, with **See all** for the rest.
- Tiles for Pharmacy, Lab tests and Physio & care, then offers and **Book again**.
- Tapping a service asks **Book now** or **Pick a time** first.
- The full-screen map is one tap away. It has a pin for each service type and sponsored pins (labelled "Ad") that admin controls.

**Booking**
- Home nursing: now or scheduled, with supplies the nurse can bring.
- Physio, home care (the same caregiver throughout) and labs: compare providers by price, distance, rating and reliability, Zomato-style.
- Multi-visit plans, partners' plan proposals, and booking for a family member.

**Pharmacy**
- Medicines from nearby stores in a 3-column grid, cart, cash on delivery or online payment, and riders.
- **Substitution with consent:** a store can offer the same medicine from another maker. The customer compares them side by side and accepts or removes it within 15 minutes.
- Refill reminders with one-tap reorder.

**Lab tests**
- A 3-column test grid, then labs compared for home collection or a lab visit.
- Pay online and get reports.

**Care Circle**
- Family members see each other's visits and care logs.
- Nurses write a care log during each visit (vitals and notes).

**Easy mode** (app)
- Large text, fewer choices and big buttons for elderly users.
- A "Call me back" request goes to support.

**Sign-in**
- Email and password.
- Google: native account picker on Android, Google's button on the website.
- Phone OTP is built but switched off until an SMS provider is set up.

## Partners

**Nurses and physios:** visits (accept, start, care log, complete), plus availability and reliability scores.

**Care shops:** service menu, prices, plans, offers and ads.

**Riders:** online switch, batched trips of up to 3 nearby drops, cash collection and earnings.

**Pharmacy store management:**
- **Today:** open/closed switch, sales against yesterday, new orders, and alerts for low, out-of-stock, expiring and off-sale stock.
- **Orders:** accept, verify prescriptions, pack, suggest substitutes, hand over with the customer's delivery code.
- **Stock:** search, filters, editing prices and counts, batch and expiry tracking, receiving stock, adding products, CSV import, the Schedule H1 register.
- **Money:** a sales statement (sales, commission, earnings, cash collected) with withdrawals.
- **Shop settings:** opening hours, delivery distance, fees, minimum order, packing time.

**All partners**
- Account, documents and verification, payouts and withdrawals, profile photo.
- **Photos and videos:** posts shown on their shop page.

## Admin

- Care marketplace: shops, settings, call-backs and refunds.
- Ads and settings, with a propose → approve flow.
- Users, documents, staff checks and partner applications.
- Payments, withdrawals, campaigns and live logs.
- **Partner posts:** hide a post with a reason.
- Admin accounts require two-step sign-in (authenticator app).

## Security and data

**Uploads**
- File types are checked from the file's contents, not its name.
- Partner media upload straight to private S3 through a one-time signed link fixed to that file's type and size. The server checks the stored file before publishing it.

**Releases and secrets**
- Android releases are signed with Nabz's own private key, not the public React Native debug key.
- The key file and its password are in AWS Secrets Manager.

**Other protections**
- The website sends security headers, including a Content-Security Policy, and blocks being framed by other sites.
- AWS WAF protects the API.
- Sign-in has rate limits and per-account lockout.

## Tests

- Integration tests run against a real MongoDB (local replica set) for:
  - store management;
  - substitution;
  - riders and refills;
  - the care marketplace;
  - call-backs;
  - Care Circle;
  - reliability;
  - partner posts.
- The fast suite (`npm test`) runs about 1,430 tests.
