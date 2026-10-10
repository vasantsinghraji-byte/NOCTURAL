# Pharmacy store network: plan, design and edge cases

Nabz is a marketplace of independent chemists. Stock is not in our dark
stores (as with Blinkit or Zepto): it sits on shelves we don't control, and walk-in
customers buy from them all day. Most failures come from the gap between what the
app thinks a store has and what is actually on the shelf. This document covers how
we close that gap, what is built, and what comes next.

Status key: **Built** = in this branch with tests · **Next** = planned for the next
phase · **Later** = needed before scale, not yet planned in detail.

---

## 1. What we took from Blinkit, Zepto, Zomato, Swiggy and Uber Eats

| Lesson | Where it comes from | What we did |
|---|---|---|
| A partner that doesn't respond must not stall the order. After a timeout the platform auto-rejects or reassigns and tells the customer. | Zomato POS integration docs, "Order Inaction" and "Restaurant Rejects Order" flows | 3-minute accept window (configurable). Silence moves the order to the next best store. The reason a store gives decides the next step. |
| Stock accuracy comes first. Blinkit's case studies describe fixing store processes and discrepancy rates *before* launching customer-facing availability features. | Blinkit out-of-stock case study | Every listing carries `stockUpdatedAt`. Old counts are labelled "likely available" and ranked lower. Stores get a one-tap "my counts are right". A store that marks an item unavailable has that count zeroed. |
| "Listed" and "in stock" are different things. Running out must not delist an item. | Blinkit (already in `models/vendorInventory.js`) | Kept, and stock rules (expiry, bans) are layered on top. |
| Missing items are handled per item: replace (store picks), substitute (customer picked), or refund. The customer approves a replacement, and a rejected replacement is refunded automatically. | Uber Eats retail order fulfilment guide | Stores mark single items "not available": the item is dropped, the customer is refunded, and the rest of the order continues. Substitutes are offered to the customer and **never swapped silently**, because a prescription brand is a medical decision. |
| Separate "order received / paid" from "order confirmed", and make order creation idempotent. | Zepto on AWS (DynamoDB draft-order service) | Prepaid orders stay invisible to the store until paid (existing). Order create is idempotent (existing middleware). The store's acceptance clock starts at payment, not at checkout. |
| Refresh hot data in the background instead of waiting for cache misses. | Zepto performance engineering blog | Not needed yet at our volume. Listed under **Later** (availability cache per geohash). |
| Refunds for missing or damaged items; returns only for damaged or wrong items. | Swiggy / Instamart refund policy | Partial refunds are built. The returns flow is **Later**, and returned medicine never goes back to sellable stock. |

Sources are listed at the end.

---

## 2. How it works now

```
customer searches ─► availability engine ─► stores that can sell it now, ranked
                                         └► same-salt substitutes if few or none
customer cart ─────► cart planner ───────► one store with everything
                                         ├► else a 2-store split
                                         └► else best partial + substitutes for the rest
checkout ──────────► product rules + store gate + atomic reserve + price-changed guard
store turn ────────► accept within SLA ─► ACCEPTED
                   ├► silent ───────────► next store (or cancel + refund), store auto-paused after repeated misses
                   ├► rejects: stock/busy/closed ─► next store
                   ├► rejects: prescription ─────► cancel + refund
                   └► some items missing ───────► drop + refund those, zero the count, carry on
```

### 2.1 One definition of "sellable"

`services/pharmacyAvailabilityService.js` and `services/serviceabilityService.js`
are the only places that decide this. Search, cart planning, checkout and
reassignment all use them, so they can't disagree.

A listing is sellable when **all** of these hold:

- **The store can trade now:** approved, active, the owner's switch is on, not auto-paused, drug licence not expired, and inside its opening hours in **India time** (overnight hours handled). Servers run in UTC, so a naive hour check would be 5½ hours off.
- **The store delivers to the customer:** zone-aware radius and stress multiplier (existing).
- **The product may be sold online:** not banned, not discontinued, not Schedule X.
- **Enough units** of stock, listed by the store.
- **Enough shelf life:** the listing's `expiryDate` is further away than `PHARMACY_MIN_SHELF_LIFE_DAYS` (default 30).
- **Cold-chain products** only from stores with `hasColdStorage`.
- **Prescription products** only from stores that take prescription orders.

### 2.2 Ranking

Lower score wins. Full cart coverage always beats partial.

```
score = ETA minutes + 0.05 × subtotal (₹20 ≈ 1 min) + 30 × (1 − acceptance rate) + 5 × stale items
acceptance rate = (accepted + 9) / (offered + 10)
```

The acceptance rate is smoothed so a new store starts near 90% and moves with evidence.

### 2.3 Acceptance SLA and reassignment

`services/pharmacyAssignmentService.js`, with a worker started from `server.js`:

- **COD orders** start the clock at checkout. **Prepaid orders** start it when payment lands (the store can't see them before that).
- **The worker** runs every 20 s. It moves overdue `PLACED` orders to the next store that has **every remaining item at no more than the price the customer agreed to**. If the new store is cheaper, the difference is refunded. At most 3 stores are tried (configurable), then the order is cancelled and refunded in full.
- **Store records:** `reliability.offered / accepted / rejected / timedOut / itemsMarkedUnavailable`. Three misses in a row, or a "we're closed" rejection, auto-pauses the store for 30 minutes. This uses `pausedUntil`, and never touches the owner's own open/closed switch.
- **Nurse supplies:** for home-care supply orders, the linked nurse booking is updated to the new store, or marked cancelled.
- **Customer updates:** the customer gets an in-app notification and a push for every move, missing item and cancellation.

### 2.4 Concurrency rule (the part that must not be broken)

Every order move is **one compare-and-set** on the order document, filtered on the
state we read (status, current store, length of the attempts log). Whoever wins the
update does the side effects: releasing or reserving stock, refunds, store records.
A loser undoes only what it did itself, for example a reservation at the new store.

This fixes a real bug that existed before this work. `updateOrderStatus` and
`cancelOrderByPatient` did read → check → restock → save. A store rejecting while the
customer cancelled could restock twice, inflating the store's count, and try two
refunds. Tests now race these cases and assert that stock moves exactly once.

### 2.5 Money

- **Partial refunds** (`refunds[]` on the order) are queued, locked per entry and sent to Razorpay with the entry id in `notes`. A retry first lists the payment's refunds and matches that id, so a refund whose database write was lost is recorded, not paid twice. Failed refunds are retried by the worker and raise a monitoring alert.
- **The money invariant:** `amounts.refunded + amounts.total = amounts.originalTotal`.
- **Store payout** uses `amounts.itemsSubtotal` at delivery, which already excludes dropped items.

---

## 3. Edge-case catalogue

### Stock and catalogue
| # | Case | Status | How |
|---|---|---|---|
| 1 | Walk-in sales make the app's count wrong | **Built** | Acceptance SLA, per-item "not available" zeroes the count, stock freshness labels, one-tap confirm |
| 2 | Two customers buy the last unit | **Built** (existing) | Atomic conditional `$inc` reservation |
| 3 | Same medicine added twice to a cart | **Built** | Lines merged before reserving |
| 4 | Stock expiring soon | **Built** | Minimum shelf life on search, planning and reservation |
| 5 | Several batches with different expiries | **Built** | `InventoryBatch` per store and product: earliest expiry sold first, batch recorded on each order line, near-expiry batches quarantined by the worker, batch recalls |
| 6 | Banned, discontinued or Schedule X product | **Built** | Blocked everywhere, including items already in a cart and listings made before the ban |
| 7 | Cold-chain product (insulin) | **Built** | Only stores with a fridge |
| 8 | Misuse-prone products (codeine syrups, sedatives) | **Built** | Per order (`maxQtyPerOrder`), per patient per 30 days across all stores (`maxQtyPerMonth`), risk flags (`MANY_STORES`, `EARLY_REFILL`, `MONTHLY_LIMIT_NEAR`) with an admin review list |
| 9 | Brand out of stock, but the same salt is available | **Built** | Salt key; substitutes offered, never auto-swapped |
| 10 | The same product entered twice in the master list | **Built** | Admin merge moves listings, stock, batches, alerts and demand; refuses products with different compositions; open orders restock onto the surviving product |
| 11 | Selling price above MRP | **Built** (existing check, plus MRP > 0) | · Government price caps (DPCO/NPPA) **Later** |
| 12 | Price changed while the item sat in the cart | **Built** | Client sends `quotedSubtotal`; the server returns 409 with the new price instead of charging a different amount |
| 13 | Price per tablet vs per strip | **Built** for comparison (`packUnits`) · selling loose strips **Later** |
| 14 | Store lists a product it may not sell online | **Built** | Listing refused for banned and Schedule X |

### Stores
| # | Case | Status | How |
|---|---|---|---|
| 15 | Store doesn't respond | **Built** | SLA, reassignment, auto-pause |
| 16 | Store forgot to switch off and rejects with "closed" | **Built** | Pause for 30 min |
| 17 | Opening hours, including past midnight, in India time | **Built** | `isWithinOperatingHours` |
| 18 | Drug licence expired | **Built** | Dropped from search and checkout automatically |
| 19 | Store doesn't take prescription orders | **Built** | Filtered in planning and checkout |
| 20 | Store accepts, then can't fulfil | **Built** | "Can't fulfil" with a reason: reassign or cancel and refund |
| 21 | Pharmacy chains with several branches and shared pricing | **Later** | Organization → stores; staff roles per branch |
| 22 | Holidays and festival closures | **Later** | Date-based closures on top of weekly hours |

### Orders and money
| # | Case | Status | How |
|---|---|---|---|
| 23 | Some items missing | **Built** | Drop those lines, refund them, carry on |
| 24 | Reassigned store is dearer or cheaper | **Built** | Never dearer; cheaper refunds the difference |
| 25 | Customer cancel vs store decline, or store accept vs timeout worker | **Built** | Compare-and-set; race tests |
| 26 | Refund sent twice (retry after lost write) | **Built** | Per-entry lock + gateway lookup by entry id |
| 27 | Orders placed before this release | **Built** | All updates work when the attempts log is missing |
| 28 | Payment arrives after the order was cancelled | **Built** (existing) | Auto-refund |
| 29 | Cart split across two stores at checkout | **Built** (cash on delivery) · one online payment across stores **Next** | `POST /pharmacy/checkouts` creates child orders all-or-nothing |
| 30 | Supplies for a nurse visit reassigned | **Built** | Booking follows the order |
| 31 | Damaged or wrong item delivered | **Later** | Return flow; returned medicine is never restocked (ledger `RETURN_DAMAGED`) |
| 32 | Refund gateway down | **Built** | Queued, retried, alerted |

### Compliance
| # | Case | Status | How |
|---|---|---|---|
| 33 | Pharmacist verifies the prescription; Schedule H1 register | **Built** | Packing is blocked until the pharmacist records the doctor, their registration number and the prescription date (max age `PHARMACY_RX_MAX_AGE_DAYS`, default 180, which is a business rule to confirm with your pharmacist); H1 register export per store (CSV, formula-safe) and for admins |
| 34 | Prescription reused for refills beyond the prescribed quantity | **Later** | Track dispensed quantity per prescription |
| 35 | Prescriptions stay private | **Built** (existing) | Private storage, owner-scoped links |

### Operations and scale
| # | Case | Status | How |
|---|---|---|---|
| 36 | Several API instances run the worker at once | **Built** | Compare-and-set, plus an overlap guard in each process |
| 37 | Demand nobody nearby can meet | **Built** | `PharmacyDemandSignal` per medicine, ~5 km cell and day; "what customers near you couldn't find" for stores, and an admin view |
| 38 | "Notify me when back in stock" | **Built** | Alert fires once when a store that delivers to the customer goes from 0 to in stock; alerts lapse after 14 days |
| 39 | Stores keep stock in billing software (Marg, GoFrugal, Busy) | **Built** CSV upload: barcode or exact name applies, anything else waits in a review queue, and confirmed barcodes are learned · **Later** direct sync |
| 40 | Availability load at scale | **Later** | Cache per geohash with background refresh (Zepto pattern) |

---

### Phase 2 notes

- **Batch-tracked items** keep the listing count equal to the sum of the ACTIVE batch counts. A product switches to batches only once its untracked count is zero, and after that the store updates batch counts, not the listing count. Units from a batch that was quarantined or recalled while an order held them are never put back on sale.
- **A recall** pulls the batch at every store. Open orders holding it get a timeline warning so the store swaps units, and customers who received it can optionally be notified.
- **Monthly caps** are checked at checkout. Two orders placed at the very same moment can both pass; the review flags and the H1 register catch that rare case (a hard guarantee needs a per-patient lock).
- **Split checkout** is cash on delivery only. One online payment across several stores needs a shared gateway order, which is still **Next**.

## 4. Code map

| Piece | File |
|---|---|
| Rules and tunables | `config/pharmacyOps.js` |
| Store gate, hours (IST), trading filter | `services/serviceabilityService.js` |
| Availability, cart plan, substitutes, demand | `services/pharmacyAvailabilityService.js` |
| Accept, decline, missing items, timeouts, worker | `services/pharmacyAssignmentService.js` |
| Partial refunds + retry | `services/pharmacyPaymentService.js` |
| Checkout rules, compare-and-set cancel and progress, stock confirm | `services/pharmacyService.js` |
| Models | `models/medicine.js` (salt key, sale flags), `models/vendorInventory.js` (`stockUpdatedAt`), `models/pharmacyVendor.js` (licence, pharmacist, fridge, reliability, pause), `models/pharmacyOrder.js` (item status, `acceptBy`, attempts, refunds), `models/pharmacyDemandSignal.js` |
| API | `GET /pharmacy/medicines/:id/availability`, `POST /pharmacy/cart/plan`, `POST /pharmacy/vendor/orders/:id/items/unavailable`, `POST /pharmacy/vendor/inventory/confirm`; the status update accepts `reasonCode` and `unavailableMedicineIds`; order create accepts `quotedSubtotal` |
| Store screens | `frontends/mobile/app/vendor.tsx`, `frontends/web/app/vendor/page.tsx`: accept countdown, reject reasons, per-item "Not available", "Can't fulfil", confirm counts |
| Customer screens | App pharmacy tab and web `/pharmacy`: "Find nearby" (other stores and same-salt brands); checkout sends `quotedSubtotal` |
| Phase 2 services | `services/pharmacyBatchService.js` (batches, earliest-expiry-first, quarantine, recall), `services/pharmacyComplianceService.js` (monthly caps, risk flags, Rx verification, H1 register), `services/pharmacyCatalogService.js` (merge, CSV import, demand), `services/pharmacyStockAlertService.js`, `services/pharmacyCheckoutService.js` |
| Phase 2 API | Store: `/vendor/inventory/batches` (list, receive, recount), `/vendor/inventory/import` (CSV) and `/vendor/inventory/imports/:id/rows/:line`, `/vendor/orders/:id/prescription/verify`, `/vendor/register/h1?format=csv`, `/vendor/demand`. Customer: `/medicines/:id/notify-me`, `/checkouts`. Admin: `/admin/medicines/:id/merge`, `/admin/recalls`, `/admin/demand`, `/admin/orders/flagged`, `/admin/register/h1` |
| Tests | `tests/integration/pharmacy-store-network.test.js` and `pharmacy-store-network-phase2.test.js` (real MongoDB, including races), `tests/unit/pharmacy/store-network-rules.test.js` |

## 5. Settings and rollout

| Env var | Default | Meaning |
|---|---|---|
| `PHARMACY_ACCEPT_SLA_SECONDS` | 180 (staging: 600 via Terraform) | Store acceptance window |
| `PHARMACY_MAX_ASSIGNMENT_ATTEMPTS` | 3 | Stores tried before cancelling |
| `PHARMACY_AUTO_PAUSE_AFTER_MISSES` / `PHARMACY_AUTO_PAUSE_MINUTES` | 3 / 30 | Auto-pause |
| `PHARMACY_MIN_SHELF_LIFE_DAYS` | 30 | Expiry cut-off for online sale |
| `PHARMACY_STALE_STOCK_HOURS` | 48 | When a count becomes "likely" |
| `PHARMACY_MAX_SPLIT_STORES` | 2 | Cart split limit |
| `PHARMACY_ASSIGNMENT_WORKER_ENABLED` | true | Set `false` to stop the worker (also runs batch quarantine and alert expiry every 10 min) |
| `PHARMACY_RX_MAX_AGE_DAYS` | 180 | Oldest prescription date a pharmacist can accept |

Rollout steps:

1. Deploy the API.
2. Run `npm run db:indexes` (adds the demand-signal and order sweep indexes).
3. Run `npm run db:backfill:pharmacy-catalog -- --write` (salt keys for existing medicines).
4. Deploy the website and rebuild the apps.

Existing listings show as "likely available" until stores confirm or recount. This is intended.

## Sources

- Zomato POS integration docs: [Order inaction](https://www.zomato.com/developer/integration/docs/getting-started/development-for-integration/live-order-flow/order-inaction/), [Restaurant rejects order](https://www.zomato.com/developer/integration/docs/getting-started/development-for-integration/live-order-flow/restaurant-rejects-order/), [Zomato rejects order](https://www.zomato.com/developer/integration/docs/getting-started/development-for-integration/live-order-flow/zomato-rejects-order/)
- [Uber Eats: retail order fulfilment](https://developer.uber.com/docs/eats/guides/retail-order-fulfillment)
- [How Zepto scales to millions of orders per day using Amazon DynamoDB (AWS)](https://aws.amazon.com/blogs/database/how-zepto-scales-to-millions-of-orders-per-day-using-amazon-dynamodb/)
- [Performance engineering at Zepto, part 2](https://blog.zepto.com/performance-engineering-at-zepto-how-we-build-low-latency-systems-part-2-4315de1f8e83)
- [Solving the out-of-stock problem: a product case study on Blinkit](https://medium.com/@ateeqrahman4087/solving-the-out-of-stock-problem-a-product-case-study-on-improving-blinkit-s-grocery-retention-0d0032b528d1)
- [Swiggy refund and cancellation policy](https://www.swiggy.com/refund-policy)
