# Deployment Guide - Microservices Migration

## Current Status: ✅ SAFE TO DEPLOY

The monolith is still operational and deployment-ready. The microservices infrastructure (packages/shared, docker-compose.yml) is **additive only** and doesn't affect production.

## Deployment Methods

### Method 1: Render (Current - Recommended During Migration)

**What's Updated:**
- ✅ Dockerfile now includes `packages/` directory
- ✅ Build command uses `--legacy-peer-deps` for Express 5 compatibility
- ✅ Monorepo structure is deployment-safe

**Deploy Now:**
```bash
# Commit and push changes
git add .
git commit -m "Add microservices infrastructure (Phase 0)"
git push origin main
```

Render will auto-deploy. Expected build time: 3-5 minutes.

**Verify Deployment:**
- Health check: `https://your-app.onrender.com/api/v1/health`
- Check logs in Render dashboard for any errors

### Method 2: Docker (Local Testing)

```bash
# Build image
docker build -t nocturnal-api .

# Run container
docker run -p 5000:5000 \
  -e MONGODB_URI=your_mongo_uri \
  -e JWT_SECRET=your_secret \
  nocturnal-api

# Test
curl http://localhost:5000/api/v1/health
```

## What Changed (Phase 0)

### Safe Changes ✅
1. **Added** `packages/shared/` - Shared library for future microservices
2. **Added** `docker-compose.yml` - Local development infrastructure (NOT used in production)
3. **Updated** `package.json` - Added workspace support (backwards compatible)
4. **Updated** `Dockerfile` - Includes packages directory
5. **Added** `.dockerignore` - Optimized Docker builds

### NOT Changed ❌
- `server.js` - Unchanged
- `app.js` - Unchanged
- Routes, models, controllers - Unchanged
- Production runtime - Still uses monolith

**Result:** The monolith runs exactly as before. No breaking changes.

## Environment Variables Required

Current production env vars (already set in Render):
```bash
MONGODB_URI=mongodb+srv://...
JWT_SECRET=...
ENCRYPTION_KEY=...
ALLOWED_ORIGINS=https://yourdomain.com
NODE_ENV=production
```

**No new env vars needed for Phase 0.** The shared package and Docker Compose are for local development only.

## Phase 1 Deployment (Future)

When we deploy the Patient Booking microservice:

### New Infrastructure Needed:
1. **Separate Render Service** for patient-booking-service
2. **RabbitMQ** - Use CloudAMQP (free tier available)
3. **Redis** - Use Render Redis or Upstash
4. **MongoDB Database** - Create separate database `nocturnal-patient-booking`

### New Environment Variables:
```bash
# Event Bus
RABBITMQ_URL=amqp://...

# Redis Cache
REDIS_URL=redis://...

# Service-to-Service Auth
SERVICE_SECRET=your_service_secret

# Microservice URLs
PATIENT_BOOKING_SERVICE_URL=https://patient-booking.onrender.com
STAFFING_SERVICE_URL=https://nocturnal-api.onrender.com
```

### Migration Strategy:
```
┌─────────────────────────────────────────────────────┐
│  Phase 0 (NOW): Monolith + Shared Infrastructure   │
│  - Render deploys monolith (server.js)              │
│  - packages/shared available but not used           │
│  - docker-compose.yml for local dev only            │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  Phase 1 (Week 1-4): Dual Deployment                │
│  - Render Service 1: Monolith (B2B Staffing)        │
│  - Render Service 2: Patient Booking Service        │
│  - API Gateway routes traffic based on path         │
│  - Both use packages/shared                         │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  Phase 2-5 (Months 2-6): Full Microservices         │
│  - Multiple Render services (one per microservice)  │
│  - Gradual decommission of monolith                 │
│  - Event-driven architecture via RabbitMQ           │
└─────────────────────────────────────────────────────┘
```

## Cost Implications

### Current (Monolith):
- Render Free Tier: $0/month
- MongoDB Atlas Free: $0/month
**Total: $0/month**

### Phase 1 (Monolith + 1 Microservice):
- Render Free Tier (Monolith): $0/month
- Render Free Tier (Patient Booking): $0/month
- MongoDB Atlas Free: $0/month
- CloudAMQP Free (RabbitMQ): $0/month
- Upstash Redis Free: $0/month
**Total: $0/month**

### Production (Multiple Microservices):
- Render Starter: $7/service/month × 3-5 services = $21-35/month
- MongoDB Atlas M10: $10/month
- CloudAMQP Lemur: $0-9/month
- Redis Upstash: $0-10/month
**Total: ~$31-64/month**

## Rollback Plan

If deployment fails:
```bash
# Revert to previous commit
git revert HEAD
git push origin main
```

Or manually revert in Render:
1. Go to Render Dashboard
2. Select "nocturnal-api" service
3. Click "Manual Deploy" → Select previous successful deploy

## Pre-Deployment Checklist

Before pushing to GitHub:

- [x] Dockerfile updated to include packages/
- [x] render.yaml uses --legacy-peer-deps
- [x] .dockerignore created
- [x] Monolith code unchanged
- [x] Local testing: `npm start` works
- [ ] Git status clean (commit all changes)
- [ ] Tests passing: `npm test`

## Monitoring Post-Deployment

After Render deploys:

1. **Check Logs** (first 5 minutes):
   ```
   Render Dashboard → nocturnal-api → Logs
   ```
   Look for:
   - ✅ "Server Started Successfully"
   - ✅ "MongoDB connected"
   - ❌ Any error stack traces

2. **Test Endpoints**:
   ```bash
   # Health check
   curl https://your-app.onrender.com/api/v1/health

   # Auth endpoint
   curl https://your-app.onrender.com/api/v1/auth/login
   ```

3. **Monitor Performance**:
   - Response times (should be same as before)
   - Memory usage (Render dashboard)
   - Error rate (Sentry if configured)

## Next Steps

**Safe to deploy NOW:**
```bash
git add -A
git commit -m "Phase 0: Add microservices infrastructure (deployment-safe)"
git push origin main
```

**Or wait until Phase 1:**
- Continue building patient-booking-service locally
- Deploy both monolith + microservice together
- Reduced deployment frequency

**Recommendation:** Deploy now to validate the infrastructure changes work in production before adding complexity.
