# Nabz improvement plan

*October 2026. Covers UI/UX, features and architecture, ordered by what matters most before real customers use Nabz.*

## Recommended next five

1. **Phone OTP sign-in** with an SMS provider.
2. **Payments end to end** (Razorpay test mode, then live).
3. **A real domain** and Google sign-in moved to production.
4. **App builds in the cloud**, with over-the-air updates.
5. **One booking flow** for every service.

Together these make Nabz launchable and remove the biggest source of confusion. After step 4, most later items reach installed apps through over-the-air updates, without a new APK.

---

## Phase 1: Launch blockers (weeks 1–2)

These stop Nabz from working for real users, whatever the UI looks like.

| # | What | Why | Effort |
|---|---|---|---|
| 1 | **Turn on payments**: Razorpay test mode, then live | Staging runs with `RAZORPAY_ENABLED=false`. Online payment, refunds and payouts have not run end to end against Razorpay. | Medium |
| 2 | **Phone OTP sign-in** (MSG91 or Twilio) | Switched off on staging because no SMS provider is set. Many elderly users know their phone number but not a Gmail address or a password. | Small |
| 3 | **Real domain** (e.g. `nabz.in`) behind CloudFront | Google sign-in cannot leave Testing mode (100 test users) on an `awsapprunner.com` address. A domain also gives a proper support email, privacy-policy links and faster loading. | Small–Medium |
| 4 | **Cloud app builds** (EAS Build or CodeBuild), **AAB** files for the Play Store, **EAS Update** | Local builds take 30–70 minutes and stop when the PC sleeps. EAS Update delivers most UI fixes to installed apps in minutes. | Medium |
| 5 | **Housekeeping** | Rotate the exposed Google web client secret. Fix the two failing tests: the shared-package export count, and the bot test that misfires around midnight. | Small |

## Phase 2: UI/UX (weeks 2–5)

1. **One booking flow everywhere.** Nursing, Physio & care and Lab tests each book differently today. Use one pattern for all of them: *what → when → where → pay*, with the same steps and the same bill card. This is the biggest single fix for confusion, especially for elderly users.
2. **One search on Home.** Search services, medicines, lab tests and shops together. Make it tolerant of typos ("paracitamol") and of Hindi typed in English. MongoDB's plain text search, used today, misses typos. Atlas Search fixes this.
3. **Real product photos** in the pharmacy grid, instead of one generic icon. This is what builds trust on quick-commerce apps.
4. **Live medicine delivery tracking for customers:** the rider on a map, with an arrival time. Riders and stores already have tracking; customers don't.
5. **Finish accessibility:**
   - Easy mode on the website.
   - Hindi on every screen; about 14 of 45 app screens still have English-only text.
   - Read-aloud (deferred earlier).
6. **Video thumbnails** for partner posts, which show a plain play icon today.
7. **One notifications inbox** in the app for orders, visits, substitutions and offers.

## Phase 3: Features (month 2)

**Pharmacy owners**
- Barcode scanning with the phone camera to receive stock and update counts.
- Reorder lists to send to distributors.
- GST invoices as PDFs.

**Partners**
- An availability calendar.
- Monthly earnings statements as PDFs.
- Instant payouts through RazorpayX, instead of admins marking each one paid.

**Customers**
- A prescription vault: upload once, reuse on every order.
- Photos in reviews.
- Lab report PDFs in the app (images only today).

**Admin**
- Automatic screening of partner photos and videos (AWS Rekognition). Anything flagged waits for a person to review it instead of going live.
- A daily dashboard: sign-ups, bookings, orders, cancellations, revenue.

## Phase 4: Architecture (in parallel, ongoing)

| Area | Today | Change to |
|---|---|---|
| **Deploys** | Manual: zip from a laptop, then CodeBuild | GitHub Actions runs tests on every pull request; merging to `develop` deploys staging automatically. |
| **Background work** | Rider assignment and family notifications start inside the request (`setImmediate`, a save hook), so a server restart can lose them | A job queue (SQS + worker) so jobs retry and survive restarts. Scheduled jobs already hold a MongoDB lock and are fine. |
| **Rate limits and cache** | Redis is off, so each of up to 4 servers counts limits separately | ElastiCache Redis, so limits are shared across servers. |
| **Media** | Original files through signed S3 links | CloudFront, with resized photo thumbnails and compressed videos: faster, and lighter on mobile data. |
| **Duplicated code** | `apps/patient-health` copies the booking code, kept in sync by hand | Finish that split, or delete the copy. |
| **Crash visibility** | Server logs only | Sentry in the app and website, so crashes customers hit are visible. |
| **Testing** | Strong server tests; the website only has a public-page check | Automated app tests (Maestro): sign in → book → pay → track. A load test before launch. |
| **Security** | The website's Content Security Policy still allows inline scripts (`'unsafe-inline'`) | A nonce-based policy. |
