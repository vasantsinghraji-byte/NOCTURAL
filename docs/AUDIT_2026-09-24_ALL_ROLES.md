# Nabz risk audit: all roles (24 Sep 2026)

This audit covers customers, nurses and physios, pharmacies, lab and delivery
partners, admins, and the platform itself. Each finding says what goes wrong,
where in the code, how to fix it, and whether the fix needs a new app build.
The pharmacy order flow was hardened earlier today
([pharmacy/STORE_NETWORK_PLAN.md](pharmacy/STORE_NETWORK_PLAN.md)), so it only
appears here where it touches other roles.

Severity:
- **Critical** means money, safety or trust breaks in normal use.
- **High** means it will happen at modest scale.
- **Medium** means it bites later or needs specific conditions.

## Status (25 Sep 2026)

Plan steps 1 and 2 are done and deployed to staging (commit `32d441c`).

- **Fixed:** C1–C6, H1–H7, M1, M2, M4, P3.
  - The minute tick is confirmed running on staging.
  - The `background-tick` lease records each run and its result.
- **Also fixed:** "API rate limit exceeded" for normal use.
  - Limits are now per signed-in account.
  - The website forwards the visitor's real IP in a signed header (`PROXY_SHARED_SECRET`), so visitors no longer share one limit.
- **Step 3 (25 Sep 2026):** M3, M5, M6, M7 and P4 are fixed.
  - **M3:** login, sensitive-action and password-reset limits count in MongoDB, so they hold across instances. They fall back to memory if the database is down.
  - **M5:** customers can delete their account in the app (Account → Delete account) or at `/account/delete`.
    - Personal data is erased and every session is revoked.
    - Order, visit and invoice records stay anonymised.
    - Deletion is refused while a visit or order is in progress, or while dues are unpaid.
    - Health records, metrics and the medical history on the account are kept as the patient's history (decided 25 Sep 2026), attached to the anonymous account.
  - **M6:** approving a nurse, physio or pharmacy application creates the login with verification pending and emails a 72-hour set-password link.
    - Pharmacies get a PENDING store that isn't visible to customers.
    - On staging without SMTP, the admin panel shows the one-time link instead of emailing it. Production never shows it.
  - **M7:** lab and delivery logins are hidden. Their applications are a waitlist.
  - **P4:** CloudWatch alarms fire when the tick stops or fails, and when the API returns 5xx errors. They publish to the SNS topic `nabz-staging-alerts`.
    - Set `alert_email` in Terraform to receive them by email.
- **Still open, needs you:**
  - **P2:** rotate the Atlas password and restrict network access. This is the most urgent.
  - **P1:** move to MongoDB M10 for backups.
  - Choose an email address for the alarms.
  - SMTP credentials, so partner invites and password resets actually get emailed.

---

## Critical

### C1. Background jobs stall when nobody is using the app
App Runner throttles a service's CPU when it isn't handling requests. The
`setInterval` workers started in `server.js` all live inside the web service:
- dispatch offer expiry and scheduled-visit dispatch;
- pharmacy acceptance timeouts and reassignment;
- partial-refund retries;
- unpaid-order expiry;
- batch quarantine.

At quiet hours (night) an expired nurse offer or an unaccepted pharmacy order can
sit untouched until the next request wakes the instance.

**Fix:**
- An EventBridge schedule (every minute) calls a new internal endpoint `POST /api/v1/internal/tick`, secured with a secret header checked in constant time.
- The endpoint runs every sweep once, holding a short MongoDB lease so two instances never run it together.
- The in-process timers stay as a backup.
- Terraform adds the EventBridge connection, API destination and rule.

**App rebuild:** no.

### C2. Unverified nurses can go online and take visits
`staffAvailabilityService.setAvailability` and dispatch's candidate filter never
check `careProfile.verification`, and admin `assignProvider` doesn't either. The
site and app promise that every professional is ID, council and police verified
before their first visit.

**Fix:**
- Going online, receiving offers and being assigned all require ID + council + police verified.
- The staff app shows "Verification pending" instead of the Go-online switch.
- Revoking a verification takes the person offline and re-dispatches their upcoming visits.

**App rebuild:** yes (banner). The backend alone already blocks it.

### C3. Visit status changes can overwrite each other
`bookingService.updateStatus` and `cancelBooking` read the booking, check it,
then `save()`. A customer cancelling while the nurse taps Start can end with a
cancelled visit marked `IN_PROGRESS`, or a started visit cancelled with its
supplies order released. This is the same class of bug fixed in pharmacy today.

**Fix:** every transition becomes one compare-and-set on the current status, and side effects (supplies cancel, notifications) run only for the winner.

**App rebuild:** no.

### C4. Customers can cancel a visit that is under way, for free
`cancelBooking` only refuses `COMPLETED` / `CANCELLED`. A customer can cancel
after the nurse has travelled (`EN_ROUTE`), or even during the visit
(`IN_PROGRESS`, so pay-after-visit is never paid).

**Fix:**
- Free cancellation until the nurse is on the way.
- After `EN_ROUTE`, a cancellation fee (configurable) that is paid to the nurse.
- No cancellation once `IN_PROGRESS`; the customer uses SOS or reports a problem instead.

**App rebuild:** yes (cancel sheet shows the fee). Enforcement is server-side.

### C5. Cash is never recorded, so payouts double-count
Visits are "pay after the visit" and pharmacy orders can be cash on delivery, but:
- nothing records the cash as collected (`payment.status` stays `PENDING`);
- settlement books `PROVIDER_PAYOUT` / `VENDOR_PAYOUT` as money the platform owes, even though the partner already holds the cash, so paying those out means paying twice.

**Fix:**
- The nurse and the pharmacy confirm "cash collected ₹X" at completion or delivery.
- The ledger gets `CASH_COLLECTED` entries.
- Payouts are netted: the partner owes our commission and fee.
- The admin revenue view shows cash still to collect from each partner.

**App rebuild:** yes (collect-cash step).

### C6. Pharmacies mark their own orders delivered
The store moves an order to `DELIVERED` with no proof. That releases its payout,
and prescription medicines can be handed to anyone.

**Fix:**
- A 4-digit delivery code (like the visit code): the customer's app shows it, and the store or rider enters it to complete.
- If the code can't be used, "delivered without code" needs a reason, and the order is flagged.

**App rebuild:** yes (code on the customer screen, entry on the store screen).

---

## High

| # | Problem | Where | Fix | Rebuild |
|---|---|---|---|---|
| H1 | Nurse cancels or can't make it: the customer's visit is just cancelled | `updateStatus` → `CANCELLED` | Provider cancellation re-dispatches to the next nurse (back to searching), records reliability, and auto-pauses after repeated drops, as pharmacy does | No |
| H2 | Scheduled visits start dispatch only 60 min before and give up after 10 min, then sit in `NO_STAFF`. The customer isn't told and ops aren't alerted | `dispatchService` | Start offers 12 h before (or at booking if sooner); keep retrying until 30 min before; on `NO_STAFF` notify the customer (reschedule / cancel free) and ops | Yes (reschedule prompt) |
| H3 | Any confirmed visit (even tomorrow) makes a nurse "busy" all day, and nothing stops two overlapping visits | `findCandidate` busy check, `assignProvider` | Busy = a visit overlapping this one's time window (± duration + travel); the same check on accept and on admin assign | No |
| H4 | Health-record access: admin-assign grants it with no expiry; app-accept grants none | `assignProvider`, `dispatchService.accept` | Grant on accept too; expire 24 h after the visit ends; revoke on cancel | No |
| H5 | Visit dates aren't validated (past dates, years ahead) | booking validation | "Now" visits use server time; scheduled visits must fall between now + 30 min and 30 days ahead | No |
| H6 | A deactivated or suspended nurse keeps their upcoming visits | admin deactivate | Re-dispatch their future visits and take them offline | No |
| H7 | Nurses see the customer's phone and email forever | `getBookingById` populate | Hide email; show the phone only from confirmation until 2 h after completion; masked calling later | Yes (small) |

## Medium

| # | Problem | Fix |
|---|---|---|
| M1 | Booking admin checks use `role === 'admin'` only; the real admin role `platform_admin` can't act as admin there | Use the shared `ADMIN_ROLES` list |
| M2 | Admin assignment leaves the dispatch record in OFFERED/SEARCHING (stray offer, wrong state) | Set dispatch MATCHED and clear the offer on assign |
| M3 | Rate limits and some stores are in-memory (Redis off). With 2+ App Runner instances, login and OTP limits multiply | Keep staging at max 1 instance; move limits to Redis or MongoDB before scaling |
| M4 | A phone OTP challenge is saved before the SMS is sent; a failed send still counts toward the hourly cap | Delete the challenge if sending fails |
| M5 | No "delete my account" or data export (India's DPDP Act 2023) | Delete-account flow: anonymize personal data, keep legally required records (H1 register, invoices) |
| M6 | Approving a partner application doesn't create their login | Approval sends an invite link to set a password, with the role taken from the application; verification starts as pending |
| M7 | Lab and delivery partners can log in to empty dashboards; no rider flow | Hide them from login until built, or build the rider flow alongside C6 |
| M8 | Monthly medicine caps can be beaten by two orders at the same instant | Accepted risk (flags + H1 register); a per-patient lock if it's ever seen |
| M9 | Customers aren't notified when a nurse cancels, or when a scheduled visit finds nobody | Covered by H1/H2 notifications |

## Platform and operations

| # | Problem | Fix |
|---|---|---|
| P1 | MongoDB M0 (free) has no backups and small limits | Move to M10 before real users (daily backups + point-in-time restore) |
| P2 | Atlas password was shared in chat; network access is 0.0.0.0/0 | Rotate the password; restrict access to App Runner's fixed egress (VPC connector + NAT) |
| P3 | Staging-only switches must never reach production | A startup check that refuses to boot in production when `SERVICEABILITY_TEST_RADIUS_KM` / demo flags are set |
| P4 | `monitoring.triggerAlert` only logs | CloudWatch alarms on error-log patterns and on a worker heartbeat (from C1) |

---

## Plan

1. **Backend safety, no app rebuild:**
   - C1 tick endpoint + EventBridge;
   - C2 verification gate;
   - C3 compare-and-set transitions;
   - C4 cancellation rules;
   - H1–H6;
   - M1, M2, M4, P3.

   Tests for each race and rule.
2. **App and website changes, then rebuild both APKs:**
   - C5 collect-cash step + ledger;
   - C6 delivery code;
   - cancel sheet with fee;
   - reschedule prompt;
   - "verification pending" banner;
   - H7 phone visibility.
3. **Before real users:** M5, M6, M7, P1, P2, P4.

## Sources

- [App Runner FAQs](https://aws.amazon.com/apprunner/faqs/)
- [App Runner scaling for background services (AWS re:Post)](https://repost.aws/questions/QUEwbKE9jbTCyLn7OnqGhOrA/app-runner-scaling-for-background-service)
- [App Runner roadmap: support worker services](https://github.com/aws/apprunner-roadmap/issues/96)
- [Managing App Runner automatic scaling](https://docs.aws.amazon.com/apprunner/latest/dg/manage-autoscaling.html)
