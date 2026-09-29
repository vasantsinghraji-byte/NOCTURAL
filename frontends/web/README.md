# MedRush Web (Next.js)

Patient storefront + vendor/doctor/admin dashboards. Talks to the existing
Express API (`/api/v1`) and shares types via `@medrush/shared`.

## Run

```bash
cd frontends/web
cp .env.local.example .env.local     # set NEXT_PUBLIC_API_BASE_URL
npm install
npm run dev                          # http://localhost:3000
```

The backend must be running (default `http://localhost:5000`) and seeded:

```bash
# from the repo root
npm run dev            # backend on :5000
npm run db:seed:pharmacy
```

## Routes
- `/` — home, category tiles
- `/pharmacy` — nearby vendors + storefront + cart (uses browser geolocation, falls back to demo coords)
- `/vendor` — vendor dashboard (paste a `pharmacy_vendor` token for now)
- `/nursing`, `/lab-tests`, `/consult`, `/emergency`, `/doctor`, `/admin` — scaffolded, shipping in later phases

## Notes
- `@medrush/shared` is imported directly from `../shared/src` via a tsconfig
  path alias + `experimental.externalDir` in `next.config.mjs`.
- Auth uses httpOnly cookies against the API (`credentials: 'include'`); a
  proper login flow lands in Phase 2.
