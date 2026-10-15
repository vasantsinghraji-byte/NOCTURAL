# MedRush — Getting Started (Simple Architecture & How to Run)

The goal here is **easy to run**: one backend, one database, two frontends.
Everything else in this repo (Docker, k8s, Grafana, RabbitMQ, replica sets) is
**optional production tooling you can ignore** for local development.

---

## 1. The simple architecture

```
                         ┌─────────────────────────────┐
   Next.js web  ───────▶ │                             │
   (frontends/web)       │   Express API  (server.js)  │ ──▶  MongoDB
                         │   http://localhost:5000     │      (nocturnal_dev)
   Expo mobile  ───────▶ │   REST at /api/v1/...        │
   (frontends/mobile)    │                             │ ──▶  Redis (OPTIONAL,
                         └─────────────────────────────┘       off by default)

   @medrush/shared  ── typed API client + domain types, imported by BOTH frontends
```

- **One process to run the server:** `npm run dev` (nodemon on port 5000).
- **One database:** local MongoDB (`nocturnal_dev`). No table creation step —
  collections appear on first insert; you only `seed` demo data.
- **Redis is off** unless you set `REDIS_ENABLED=true`; the app degrades
  gracefully without it. Same for Razorpay, Firebase, S3 — all optional.
- Frontends never touch the database — they only call the API.

You need exactly **three things installed**: Node ≥ 22, MongoDB (local or Atlas),
and npm. That's it for the full stack.

---

## 2. First-time setup (5 steps)

```bash
# 1. From the repo root — install backend deps
npm install

# 2. Create your .env (generates strong JWT_SECRET + ENCRYPTION_KEY for you)
npm run setup:env
#    …or copy .env.example to .env and set the two REQUIRED values:
#      JWT_SECRET      = 64+ random chars
#      ENCRYPTION_KEY  = 64 hex chars   ->  openssl rand -hex 32
#    MONGODB_URI defaults to mongodb://localhost:27017/nocturnal_dev in dev.

# 3. Make sure MongoDB is running locally (or point MONGODB_URI at Atlas)

# 4. Create indexes + seed demo pharmacy data (vendors, medicines, inventory)
npm run db:indexes
npm run db:seed:pharmacy

# 5. Start the backend
npm run dev            # API on http://localhost:5000  (health: /api/v1/health)
```

The seed prints the demo logins. Set `SEED_DEMO_PASSWORD` in your local `.env` first; all demo accounts use it.

---

## 3. Run the frontends

Open two more terminals.

**Web (Next.js):**
```bash
cd frontends/web
cp .env.local.example .env.local     # NEXT_PUBLIC_API_BASE_URL=http://localhost:5000
npm install
npm run dev                          # http://localhost:3000
```

**Mobile (Expo):**
```bash
cd frontends/mobile
npm install
npx expo start                       # press w (web preview), a (Android), i (iOS)
```
On a real phone, set `EXPO_PUBLIC_API_BASE_URL=http://<your-LAN-IP>:5000`.

> First time only: `cd frontends/shared && npm install` so the shared package's
> TypeScript is available to both apps (they import it directly from source).

---

## 4. Try the flow

1. Web → **Pharmacy** (`/pharmacy`): it geolocates (or falls back to the demo
   area), lists seeded vendors, shows a catalog, and builds a cart.
2. Web → **Vendor** (`/vendor`): paste a `pharmacy_vendor` token to see the
   order queue and move orders `ACCEPTED → PREPARING → READY → …`.
3. API directly:
   ```bash
   curl "http://localhost:5000/api/v1/pharmacy/vendors/nearby?lat=12.9352&lng=77.627&radiusKm=10"
   ```

### Online payment (Razorpay, optional)

Without Razorpay keys, checkout offers **Cash on delivery** only. To test prepaid:

1. Create a Razorpay account → Dashboard in **Test mode** → *API Keys* → generate.
2. Add to the backend `.env` and restart `npm run dev`:
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
   # optional: PHARMACY_PAYMENT_TTL_MINUTES=15  (how long unpaid orders hold stock)
   ```
3. Checkout now shows **Pay online**. Use Razorpay's test card / UPI
   (`success@razorpay`) to pay.

How it behaves:
- A prepaid order reserves stock and is **hidden from the pharmacy until paid**.
- Payment is verified server-side (signature + amount/currency/order re-fetched
  from Razorpay) before the order becomes `PAID`.
- If the patient closes the payment window, the order page shows **Pay now**
  until the hold expires; then a background sweeper cancels it and restocks
  (it asks Razorpay first, so a paid-but-unverified order is kept, not cancelled).
- Cancelling or rejecting a paid order refunds it automatically. If the refund
  call fails, the order stays `REFUND_PENDING` with `razorpay.refundError` set.
  Reconcile those by hand for now.

---

## 5. Everyday commands

| Task | Command (repo root) |
|---|---|
| Backend dev server | `npm run dev` |
| Backend + web frontend together | `npm run dev:all` |
| Seed pharmacy demo data | `npm run db:seed:pharmacy` |
| Create DB indexes | `npm run db:indexes` |
| Lint | `npm run lint` |
| Fast tests | `npm test` |
| Lint + fast tests (pre-PR) | `npm run verify:local` |

---

## 6. What to ignore for now (keep it simple)

These exist for production and are **not needed to develop**:
`docker-compose*.yml`, `k8s/`, `terraform/`, `grafana/`, `prometheus/`, `loki/`,
`logstash/`, `filebeat/`, `nginx/`, RabbitMQ, MongoDB replica sets, PM2.
Ignore them until you deploy. Local dev is just **Node + MongoDB + two `npm run dev`s.**

See also: [MEDRUSH_PHARMACY_MARKETPLACE_PLAN.md](MEDRUSH_PHARMACY_MARKETPLACE_PLAN.md) (roadmap) and
[MEDRUSH_DATA_MODEL.md](MEDRUSH_DATA_MODEL.md) (collections/tables & how to add one).
