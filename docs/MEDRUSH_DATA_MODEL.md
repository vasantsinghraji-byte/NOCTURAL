# MedRush Data Model & Guide

How MedRush stores its data, why it's shaped this way, and how to extend it.
It's the single reference for the pharmacy marketplace and the home-health data layer.

> **MongoDB, not SQL. "Collections" are our "tables".** A collection ≈ table,
> document ≈ row, field ≈ column. Collections appear on first insert, and their
> shape is enforced by the Mongoose schema in `models/`. The only thing we
> "migrate" is **indexes** (`npm run db:indexes`, which also runs as a one-off ECS
> task on every deploy).

---

## 0. Design principles (learned from quick-commerce leaders)

MedRush is a Swiggy-style **aggregator of local pharmacies**, not a Zepto/Blinkit
dark-store chain. Most of their data lessons still apply:

| # | Principle | Who does it | How MedRush applies it | Status |
|---|---|---|---|---|
| 1 | **Serviceability is a zone decision, not just a radius.** Resolve the customer to an ops-drawn polygon (point-in-polygon), with a radial fallback | Swiggy serviceability platform | `ServiceZone` polygons + `serviceabilityService` | ✅ built |
| 2 | **Shrink serviceability under stress** (rain, rider shortage) instead of breaking promises | Swiggy ("reduce last-mile distance") | `ServiceZone.stress` → radius multiplier; `isActive:false` pauses a zone | ✅ built |
| 3 | **Hierarchical cell ids** for hyperlocal keys (cache, heatmaps, analytics) | Swiggy geohash, Uber H3 | `geohash` on vendors, `deliveryGeohash` on orders | ✅ built |
| 4 | **ETA is a sum of legs**: assignment + first mile vs prep, then last mile. Store the promise *and* the actual per-leg timestamps so each leg can be modelled | Swiggy ETA models (O2A, FM, WT, LM) | `order.eta` (promise per leg) + `order.milestones` (actuals) | ✅ built |
| 5 | **"Listed" ≠ "in stock"** | Blinkit | `VendorInventory.isAvailable` = vendor's intent; stock is `stockQty`; orderable = both | ✅ built (fixed a bug) |
| 6 | **Reserve stock atomically at checkout; release on cancel/expiry** | Zepto/Blinkit OMS | atomic `$inc` with a `stockQty >= qty` guard; unpaid orders expire and restock | ✅ built |
| 7 | **Every stock change is ledgered** (explainable inventory, reconciliation) | standard OMS/WMS practice | `InventoryMovement` (append-only) | ✅ built |
| 8 | **Strict order state machine** + event timeline | Zomato | `VENDOR_STATUS_TRANSITIONS`, `timeline[]` | ✅ built |
| 9 | **Snapshot everything the customer agreed to** (price, fee, address, ETA) | all | item price snapshots, `amounts`, `deliveryAddress`, `eta` | ✅ built |
| 10 | **Delivery is its own entity**, separate from the order (assignment, batching, re-assignment) | Swiggy, Zomato | `DeliveryTask` | 🔜 Phase 3 (§5) |
| 11 | **Live rider location lives in Redis GEO, not the database** (pings every few seconds) | Zomato/Swiggy tracking pipelines | Redis `GEOADD` + sampled trail | 🔜 Phase 3 (§5) |
| 12 | **Money moves through a ledger** (commission, payouts, refunds) | Zomato commission ledger | `SettlementEntry` | 🔜 Phase 5 (§5) |

What we deliberately **don't** copy: dark-store inventory ownership (our
pharmacies own their stock) and per-SKU warehouse bins and pick paths (that's the
pharmacy's own process).

---

## 1. The big picture (ERD)

```
                         ┌───────────────┐
                         │    Patient    │  (B2C consumer, own auth)
                         └──────┬────────┘
                                │ places / books
   ┌──────────────┬─────────────┼──────────────┬──────────────┐
   ▼              ▼             ▼              ▼              ▼
PharmacyOrder  NurseBooking  LabTestBooking  Consultation  EmergencyBooking
   │  │  └─────────▶ ServiceZone ◀────────┐  (point-in-polygon: which zone is this?)
   │  │ fulfilled by                      │
   │  ▼                                   │ sits in
   │ PharmacyVendor ──────────────────────┘
   │  │ lists (vendor × medicine)
   │  ▼
   │ VendorInventory ──────▶ Medicine (master catalog)
   │  │
   │  └──── every stock change ───▶ InventoryMovement (append-only ledger)
   │
   └── (Phase 3) DeliveryTask ──▶ User(role: delivery_partner) ──▶ Redis GEO (live location)
```

**Two identity collections**, kept separate on purpose:
- **`Patient`**: end users, with their own login (`middleware/patientAuth.js`).
- **`User`**: every staff/partner role (`pharmacy_vendor`, `delivery_partner`,
  `medical_staff`, `phlebotomist`, doctors/nurses, admins), with their own login (`middleware/auth.js`).

---

## 2. Collections (data dictionary)

Legend: **FK** = ObjectId reference. `[Point]` = GeoJSON `{ type:'Point', coordinates:[lng,lat] }`
(2dsphere). ⚠️ Never give a GeoJSON `type` a default: a coordinate-less `{type:'Point'}`
breaks 2dsphere inserts.

### ServiceZone · `models/serviceZone.js` *(NEW)*
An ops-drawn delivery polygon ("cluster").

| Field | Type | Notes |
|---|---|---|
| code | String, unique | `KORAMANGALA-1` |
| name, city | String | |
| boundary | GeoJSON Polygon/MultiPolygon | 2dsphere; MongoDB rejects invalid rings |
| isActive | Boolean | `false` = deliveries into the zone paused |
| maxLastMileKm | Number | hard cap on store→customer distance here |
| stress | {level, radiusMultiplier, reason, until, updatedBy} | `NORMAL`/`HIGH`(0.7)/`SEVERE`(0.4); `until` auto-expires |

**Effective radius** of a store for a customer =
`min(store.serviceRadiusKm, zone.maxLastMileKm) × stressMultiplier`. With no zone
drawn at that point, it's just `store.serviceRadiusKm` (radial fallback).
Admin API: `GET/POST /pharmacy/admin/zones`, `PATCH /pharmacy/admin/zones/:id`
(stores are re-linked automatically when a boundary changes).

### PharmacyVendor · `models/pharmacyVendor.js`
The local pharmacy (the marketplace seller).

| Field | Type | Notes |
|---|---|---|
| name, slug, owner (FK User) | | owner = `pharmacy_vendor` login |
| drugLicenseNumber, gstin, documents | | KYC |
| address, location [Point] | | 2dsphere |
| serviceRadiusKm | Number | store's own max reach (**now enforced**) |
| **zone** | FK ServiceZone | set on create / when zones change |
| **geohash** | String | derived from `location` (precision 7 ≈ 150 m), never hand-set |
| operatingHours, isOpen, avgPreparationMinutes | | prep time feeds ETA |
| deliveryFee, minOrderValue | Number | |
| status | Enum | `PENDING`/`APPROVED`/`SUSPENDED`/`REJECTED` |
| payout | Object | settlement details (`accountNumber` is `select:false`) |

### Medicine · `models/medicine.js`
Global master catalog: one row per sellable product, de-duplicated across vendors.
`name`, `genericName`/`composition`, `form`, `strength`, `packSize`, `scheduleType`
(`OTC`/`PRESCRIPTION`/`SCHEDULE_H`/`H1`/`X`), `category`, `requiresPrescription`,
`referenceMrp`. Has a text index for search.

### VendorInventory · `models/vendorInventory.js`
A vendor's listing of a Medicine (join: vendor × medicine, unique).

| Field | Notes |
|---|---|
| mrp, sellingPrice, discountPercentage | discount recomputed on save |
| stockQty | on-hand units. Changes only via atomic `$inc` (orders) or explicit vendor counts |
| **isAvailable** | **LISTED**: the vendor's intent to sell. Stock level never changes it |
| lowStockThreshold, batchNumber, expiryDate | |

**Orderable = `isAvailable && stockQty > 0`.** Previously, hitting 0 stock delisted
the item and every cancellation re-listed it, overriding a vendor who had switched
it off.

### InventoryMovement · `models/inventoryMovement.js` *(NEW, append-only)*

| Field | Notes |
|---|---|
| vendor, medicine | FKs |
| type | `ORDER_RESERVED` (−) / `ORDER_RELEASED` (+) / `ADJUSTMENT` (±) |
| delta, balanceAfter | signed units, stock after the move |
| order | FK PharmacyOrder (for order-driven moves) |
| actor {kind, id}, reason | PATIENT / VENDOR / ADMIN / SYSTEM |

`VendorInventory.stockQty` stays the source of truth. The ledger is the audit
trail: it explains every unit and supports reconciliation. Linked to order → patient →
prescription, it's also the raw material for the **Schedule H1 register**. Never
update or delete rows; correct mistakes with a new `ADJUSTMENT`. Retention: keep
at least as long as the drug-register rules require (plan for ≥ 3 years; confirm
with compliance).

### PharmacyOrder · `models/pharmacyOrder.js`
A patient's order to one vendor. Everything the customer agreed to is **snapshotted**.

| Field | Notes |
|---|---|
| orderNumber, patient, vendor | |
| items[] | price/name/pack snapshots per line |
| requiresPrescription, prescription {key, verified…} | `key` = private S3 object under `prescriptions/<patientId>/` |
| status, timeline[] | state machine (§3) + full event log |
| deliveryAddress, deliveryLocation [Point] | |
| **deliveryGeohash, zone, distanceKm** | serviceability snapshot at checkout |
| **eta** {promisedAt, prepMinutes, assignmentMinutes, lastMileMinutes} | the promise, per leg |
| **milestones** {placedAt, paidAt, acceptedAt, readyAt, riderAssignedAt, pickedUpAt, deliveredAt, cancelledAt} | first time each stage was reached (actuals per leg) |
| rider, deliveryStatus | superseded by `DeliveryTask` in Phase 3 |
| amounts {itemsSubtotal, deliveryFee, tax, discount, total} | INR snapshot |
| paymentMode, paymentStatus, paymentExpiresAt, razorpay{…} | prepaid flow (see payments section in `context.md`) |

**Leg metrics** fall straight out of `milestones`: prep = `readyAt − acceptedAt`,
last mile = `deliveredAt − pickedUpAt`, promise kept = `deliveredAt ≤ eta.promisedAt`.

### User / Patient (extended)
User: `pharmacyVendor` FK, `currentLocation` [Point] (last *known*, throttled, not
every GPS ping), `isOnline`, `isAvailable`, `vehicle`, `servicesOffered[]`.
Patient: `emergencyContacts[]`, `preferredLanguage`.

### Reused as-is
`Review`, `Notification`, `ServiceCatalog`, `NurseBooking`. (The legacy `Payment` model
is for staff payouts and is **not** used by pharmacy orders.)

---

## 3. State machines

**PharmacyOrder**, with vendor transitions enforced by `VENDOR_STATUS_TRANSITIONS`:
```
PLACED ─▶ ACCEPTED ─▶ PREPARING ─▶ READY_FOR_PICKUP ─▶ OUT_FOR_DELIVERY ─▶ DELIVERED
   │         │            │
   └▶ REJECTED └▶ CANCELLED ◀┘        (both release stock → ORDER_RELEASED)
```
- Prepaid orders are invisible to the vendor until `paymentStatus = PAID`. Unpaid
  ones expire (`SYSTEM` cancel + restock).
- Patients may cancel only while `PLACED`/`ACCEPTED`. Cancelling a paid order refunds it.
- Each transition stamps its milestone once. `timeline[]` keeps every event.

**Sample** (`SAMPLE_STATUSES`): `SCHEDULED → COLLECTED → IN_TRANSIT → AT_LAB → PROCESSING → REPORT_READY → DELIVERED`.
**Consultation**: `REQUESTED → ACCEPTED → IN_PROGRESS → COMPLETED` (+ `CANCELLED`/`NO_SHOW`).

---

## 4. Where each kind of data lives

| Data | Store | Why |
|---|---|---|
| Orders, catalog, inventory, users, zones, ledger | **MongoDB Atlas** (system of record) | documents + geo + transactions |
| Prescriptions, reports, photos | **S3** (private, encrypted) | files never go in the DB |
| Rate limits, caches (e.g. serviceability by geohash) | **Redis** | disposable, rebuildable |
| Live rider positions (Phase 3) | **Redis GEO** | a ping every ~3 s × riders would crush Mongo; only the latest value matters |
| Analytics (later) | S3 + Athena/warehouse via change streams | keep heavy queries off the OLTP DB |

Containers store nothing: see `docs/MEDRUSH_AWS_DEPLOYMENT.md` §2.

---

## 5. Target model for the next phases (designed, not built)

### DeliveryTask *(Phase 3)*
The delivery job, separate from the order (Swiggy/Zomato), so one order can be
re-assigned and, later, two orders can be **batched** for one rider.
```
order (FK), batchId?, rider (FK User), status (DELIVERY_STATUSES),
pickup {location, vendor}, drop {location, addressSnapshot},
assignment {attempts:[{rider, offeredAt, response, respondedAt}], assignedAt},
distanceKm, eta {firstMileMinutes, lastMileMinutes},
proofOfDelivery {otpHash, deliveredAt, photoKey?}, codCollected?
indexes: {rider, status}, {order}, {status, createdAt}
```
Assign the rider *during* prep, not at order time, so they don't idle at the counter
(Swiggy's O2A/FM vs prep insight). Only offer riders in the store's geohash
neighbourhood (`GEOSEARCH` on Redis).

### Rider location *(Phase 3)*
- Hot path: app → API (rate-limited ≈ 1 ping / 3 s) → `GEOADD riders:<city> lng lat riderId`
  + `HSET rider:<id> {lat,lng,speed,battery,at}` with a short TTL (offline if it expires).
- Tracking: Socket.IO room per order; clients receive pushes instead of polling.
- Mongo gets **sampled** points only (`User.currentLocation` updated every ~30 s, plus a
  per-task trail capped at N points) for disputes and ETA training.

### SettlementEntry *(Phase 5: vendor payouts)*
Double-entry style ledger, one row per money movement per party:
`party {type: VENDOR|RIDER|PLATFORM, id}, order, kind (ORDER_REVENUE, COMMISSION,
DELIVERY_FEE, REFUND_REVERSAL, PAYOUT), amount (paise, signed), payoutBatch?, createdAt`.
Balances are sums, and payouts are just entries, so it reconciles with Razorpay settlements.

### Also planned
- **PaymentTransaction**: one row per gateway attempt, refund and webhook event (today the
  refs sit on the order). Needed for partial refunds and webhook idempotency.
- **Server-side Cart**: cross-device carts for the mobile app. Price re-validated at checkout.
- **Promotion / Coupon** with usage caps and per-user redemption rows.
- **Order events outbox** → notifications/analytics (the repo already uses outbox workers).

### Scaling notes
- **Money in paise (integers)** for new money fields (`SettlementEntry`). Existing rupee
  fields are converted with `toPaise` at the gateway boundary.
- **Hot counters**: inventory stays per-(vendor, medicine) documents with atomic `$inc`.
  No global counters.
- **Sharding (when needed)**: orders by `{vendor: 1, createdAt: 1}` or zone, and inventory
  by `{vendor: 1}`, so each store's traffic stays on one shard.
- **Archival**: delivered orders > 18 months → Atlas Online Archive (queryable, cheap).

---

## 6. Indexes (the only thing we "migrate")

Declared in the schemas and built by `scripts/add-indexes.js` (explicit `createIndexes()`
for every MedRush model, which fails the deploy if one can't be built). Key ones:
- `PharmacyVendor`: `location 2dsphere`, `{status,isActive,isOpen}`, `{zone,status}`, `geohash`
- `ServiceZone`: `boundary 2dsphere`, `code` unique
- `VendorInventory`: unique `{vendor,medicine}`, `{vendor,isAvailable}`
- `InventoryMovement`: `{vendor,medicine,createdAt}`, `{order}`, `{vendor,type,createdAt}`
- `PharmacyOrder`: `{patient,createdAt}`, `{vendor,status,createdAt}`, `deliveryLocation 2dsphere`,
  `{paymentMode,paymentStatus,paymentExpiresAt}` (sweeper), `{zone,status,createdAt}`, `{deliveryGeohash,createdAt}`
- `Medicine`: text index (search). `User`: `currentLocation 2dsphere`, `{role,isOnline,isAvailable}`

---

## 7. How to add a model (step-by-step)

1. **Vocabulary first.** Enums in `constants/enums.js` (roles in both `constants/roles.js`
   and `STAFF_ROLES`). Then re-copy the file to `apps/patient-health/constants/` (mirror test).
2. **Schema** in `models/<name>.js`, with no-arg hooks only and the export guard
   `mongoose.models.X || mongoose.model('X', S)`.
3. **Service** holds the logic and throws `utils/errors.js` types. The **controller** is thin
   (`responseHelper`). **Routes** use express-validator plus `protect`/`authorize`/`protectPatient`,
   wired in `routes/v1/index.js`.
4. **Types + client** in `frontends/shared/src/{types,api}.ts`.
5. **Indexes**: add the model to the MedRush loop in `scripts/add-indexes.js`.
6. **Tests**: DB-free unit tests for pure logic, plus `tests/integration/*` against a real
   MongoDB for anything geo/atomic (see `medrush-data-model.test.js`).

---

## Sources

- Swiggy Bytes: [Designing the Serviceability Platform at Swiggy, Part 1](https://bytes.swiggy.com/designing-the-serviceability-platform-at-swiggy-for-high-scale-part-1-751a631f0379), [Part 2](https://bytes.swiggy.com/designing-the-serviceability-platform-at-swiggy-for-high-scale-part-2-ab20365fbc23), [What serviceability means at Swiggy](https://bytes.swiggy.com/what-serviceability-means-at-swiggy-c94c1aad352a)
- Swiggy Bytes: [How ML powers "When is my order coming?", Part II](https://bytes.swiggy.com/how-ml-powers-when-is-my-order-coming-part-ii-eae83575e3a9), [Predicting food delivery time at cart](https://bytes.swiggy.com/predicting-food-delivery-time-at-cart-cda23a84ba63), [Delivery partners app architecture](https://bytes.swiggy.com/architecture-and-design-principles-behind-the-swiggys-delivery-partners-app-4db1d87a048a)
- Uber Engineering: [H3: Uber's Hexagonal Hierarchical Spatial Index](https://www.uber.com/us/en/blog/h3/)
- Real-time rider tracking pattern (Redis GEO + pub/sub + WebSockets): [How Zomato/Swiggy update rider location in real time](https://dev.to/rachit_avasthi/how-platforms-like-zomato-swiggy-uber-and-ola-update-riders-location-in-real-time-3ic5), [Zomato-style data model](https://acquaintsoft.com/blog/food-delivery-app-like-zomato)
- Blinkit listed vs in-stock and inventory planning: [EcomSarthi: Blinkit inventory planning](https://ecomsarthi.com/blog/blinkit-inventory-planning-for-d2c-brands.php), [Inc42: Blinkit inventory model](https://inc42.com/features/blinkit-inventory-model-quick-commerce-cash-burn-problem/)
- Zepto OMS/WMS (serviceability → reserve → pick → dispatch): [How Zepto delivery works](https://www.appsrhino.com/blogs/zepto-10-minute-grocery-delivery)

Secondary sources (non-engineering blogs) informed patterns only. Every design choice
above is verified in our own tests, not taken on trust.
