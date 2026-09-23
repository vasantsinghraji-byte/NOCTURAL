# Nabz revenue model

_How Nabz makes money, the launch numbers, and where each rule lives in the code._
_Status: implemented on branch `claude/pharmacy-vendor-app-website-12957b` (2026-09-23). Launch city: **Jaipur**._

---

## 1. Summary

Nabz earns on both sides of every transaction, like Swiggy, Zomato and Urban Company:

| # | Stream | Who pays | Launch rate | Live in code |
|---|---|---|---|---|
| 1 | **Care commission** | Nurse / physio (from the visit price) | **20%** of base price | ✅ |
| 2 | **Care platform fee** | Customer | **15%** of base price (waived for Plus) | ✅ |
| 3 | **Pharmacy commission** | Pharmacy (from the item value) | **10%** of items | ✅ |
| 4 | **Delivery fee** + surge + night | Customer | Store fee (default **₹25**) × zone surge (**1.5×** high, **2×** severe) + **₹20** after 10 pm | ✅ |
| 5 | **Nabz Plus** membership | Customer | **₹149 / 30 days**, **7-day** free trial | ✅ |
| 6 | Care packages (10 physio sessions, 30-day elderly care, 14-day post-surgery) | Customer, upfront | Catalog package price | ✅ (catalog) |
| 7 | B2B: hospitals (post-discharge care), insurers (home visits), corporates | Institutions | Contract | Planned |
| 8 | Sponsored listings for pharmacy brands | Brands | CPM / CPC | Planned |

**Core bet:** home-care visits are the high-value, high-repeat product. Pharmacy delivery adds frequency and pays for the supplies nurses bring. Plus locks in the families who book often.

---

## 2. How each stream works

### 2.1 Home-care visits (nurse / physio)

```
Customer pays   = base price + platform fee (15%) + GST on (base + fee)
Provider earns  = base price − commission (20%)
Nabz keeps      = commission + platform fee
```

**Example (IM injection, base ₹299, non-member):**

| Line | Amount |
|---|---|
| Base price | ₹299.00 |
| Platform fee (15%) | ₹44.85 |
| GST 18% on ₹343.85 | ₹61.89 |
| **Customer pays** | **₹405.74** |
| Provider payout (₹299 − 20%) | ₹239.20 |
| **Nabz revenue** (₹59.80 commission + ₹44.85 fee) | **₹104.65** |

Plus members pay no platform fee: ₹299 + ₹53.82 GST = **₹352.82**. Nabz still earns the ₹59.80 commission.

Supplies the nurse brings ("staff brings it") are a separate pharmacy order with nurse pickup (no delivery fee). They follow §2.2.

### 2.2 Pharmacy orders

```
Customer pays   = items + delivery fee
Pharmacy earns  = items − commission (10%)
Nabz keeps      = commission + delivery fee (funds riders)
```

**Delivery fee rules** (checked in this order):

1. **Nurse pickup** (visit supplies): ₹0.
2. **Plus member:** ₹0, always, including surge and night.
3. **Basket ≥ ₹499:** base fee waived. Surge and the night surcharge still apply, because riders cost more in rain and late at night.
4. **Otherwise:** store base fee (or the ₹25 platform default) × zone surge, plus ₹20 between 22:00 and 06:00 IST.

**Surge** follows the ops "stress" lever on each service zone: raise a zone to HIGH or SEVERE in heavy rain or during a rider shortage, set an expiry, and it reverts automatically.

**Example (₹350 basket, store fee ₹25, normal time):** customer pays ₹375, the pharmacy earns ₹315, Nabz keeps ₹35 + ₹25 = **₹60**.

### 2.3 Nabz Plus (₹149 / 30 days)

- Benefits: free delivery on every pharmacy order, no platform fee on visits, priority support.
- **One free 7-day trial per customer, ever.**
- Paid plan through Razorpay: the server checks the signature, re-fetches the payment and matches amount, currency and order before activating.
- Renewals stack after the current period, so no days are lost.
- **Break-even for the customer:** about 2 visits (2 × ₹44.85 saved) or 6 deliveries a month. That makes it attractive to families who book often, the customers worth keeping.

---

## 3. Unit economics (illustrative, Jaipur launch assumptions)

_These are planning assumptions for review, not data. Revisit after 60 days of real orders._

| Assumption | Value |
|---|---|
| Visits per active family per month | 1.5 |
| Pharmacy orders per active family per month | 2 |
| Average visit base price | ₹400 |
| Average basket | ₹350 |
| Plus adoption among active families | 15% |

Per active family per month (non-member):

- Visits: 1.5 × (₹80 commission + ₹60 fee) = **₹210**
- Pharmacy: 2 × (₹35 commission + ₹25 delivery) = **₹120**
- **About ₹330 of revenue per active family per month**, before rider, support and payment costs.

A Plus member gives up about ₹140 in fees but pays ₹149 and books more often. Watch the **visit frequency of Plus vs. non-Plus** customers as the key metric.

---

## 4. Money flow & settlement

Every completed event writes rows to the **settlement ledger** (`SettlementEntry`, append-only):

| Event | Rows |
|---|---|
| Pharmacy order **DELIVERED** | `VENDOR_PAYOUT` (pending), `COMMISSION`, `DELIVERY_FEE` |
| Care visit **COMPLETED** | `PROVIDER_PAYOUT` (pending), `COMMISSION`, `PLATFORM_FEE` |
| Plus payment verified | `MEMBERSHIP_FEE` |

- Recording is **idempotent**: a unique key on source and type means replays add nothing.
- Recording **never blocks** a delivery or a visit. A failure is logged for replay.
- Partner payouts start `PENDING`. A weekly payout run pays them and marks them `PAID`. `GET /admin/revenue/payouts` groups the pending amounts per partner.
- Cash on delivery: the rider or nurse collects the cash. The partner's net is what's owed after that cash is reconciled. Automating COD reconciliation is on the next-steps list (§7).

---

## 5. Where it lives in the code

| What | File |
|---|---|
| All rates and fees (env-overridable) | `config/revenue.js` |
| Fee and split maths (pure functions) | `services/pricingService.js` |
| Membership (trial, Razorpay checkout and verify) | `services/membershipService.js`, `models/membership.js`, `routes/membership.js` |
| Ledger + reports | `services/settlementService.js`, `models/settlementEntry.js`, `routes/revenue.js` |
| Delivery fee applied at checkout | `services/pharmacyService.js#createOrder` (stored as `order.feeBreakdown`) |
| Visit price with member waiver | `services/bookingService.js#createBooking`; preview on `GET /care/services` (`pricingPreview`) |
| Ledger hooks | order → DELIVERED (`pharmacyService`), visit → COMPLETED (`bookingService#completeService`) |
| Customer UI | web `/plus`; app Account → Nabz Plus card; booking screens show member pricing |
| Admin UI | web `/admin` → Revenue panel (platform admins only) |
| Tests | `tests/unit/pharmacy/pricing-service.test.js`, `tests/integration/nabz-revenue-tracking.test.js` |

### Changing a number

Set the env var. No code change or deploy is needed beyond a task restart. On AWS, add it to the ECS task environment or Secrets Manager.

| Env var | Default |
|---|---|
| `REVENUE_CARE_PROVIDER_COMMISSION_RATE` | `0.20` |
| `REVENUE_CARE_CUSTOMER_FEE_RATE` | `0.15` |
| `REVENUE_CARE_MEMBER_FEE_WAIVED` | `true` |
| `REVENUE_PHARMACY_COMMISSION_RATE` | `0.10` |
| `REVENUE_DELIVERY_FEE_DEFAULT` | `25` |
| `REVENUE_FREE_DELIVERY_ABOVE` | `499` (0 = off) |
| `REVENUE_SURGE_HIGH` / `REVENUE_SURGE_SEVERE` | `1.5` / `2` |
| `REVENUE_NIGHT_SURCHARGE`, `REVENUE_NIGHT_START_HOUR`, `REVENUE_NIGHT_END_HOUR` | `20`, `22`, `6` |
| `REVENUE_MEMBER_FREE_DELIVERY` | `true` |
| `REVENUE_PLUS_MONTHLY_PRICE`, `REVENUE_PLUS_TRIAL_DAYS` | `149`, `7` |
| `REVENUE_GST_RATE` | `0.18` |

### API

| Method & path | Who |
|---|---|
| `GET /api/v1/membership/plans` | public |
| `GET /api/v1/membership` · `POST /membership/trial` · `POST /membership/checkout` · `POST /membership/verify` | customer |
| `GET /api/v1/admin/revenue/summary?from&to` · `/payouts` · `/policy` | **platform_admin only** (hospital admins are refused) |

---

## 6. Open decisions / compliance (confirm before launch)

1. **GST:** the code applies 18% to base + platform fee, as the booking flow did before. Home nursing by qualified professionals may be GST-exempt while the platform fee is taxable. **Confirm the treatment with a CA** before charging real customers.
2. **Drugs & Cosmetics rules / e-pharmacy guidelines:** keep the pharmacy as the seller of record. Nabz charges a service commission and doesn't set medicine prices above MRP. Discounts must stay within the rules.
3. **Surge on healthcare:** capped at 2× on the delivery fee only. **Never surge the medicine price or the nurse's visit price.** This is deliberate, both for trust and to stay clear of regulators.
4. **Partner agreements** must state the commission rates, payout cycle (weekly) and COD reconciliation.
5. Plus **cancellation/refund policy** (e.g. refund the unused days within 48 hours) needs writing into the terms.

---

## 7. Next steps

- Automated weekly payouts (Razorpay Route / RazorpayX) that mark `PENDING` → `PAID`.
- COD cash reconciliation for riders and nurses.
- Promo codes and first-order discounts (the `discount` field already exists on orders and bookings).
- Plus checkout inside the mobile app (needs `react-native-razorpay`). The web checkout works today.
- B2B contracts and sponsored listings (§1, rows 7–8).
