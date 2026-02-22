# NOCTURNAL Healthcare - Bug Tracker & Fix Blueprint

> **Generated:** 2026-02-15
> **Total Issues:** 156
> **Critical:** 38 | **High:** 52 | **Medium:** 48 | **Low:** 18

---

## Table of Contents & Master Checklist

1. [Priority Matrix](#priority-matrix)
2. [Execution Roadmap](#execution-roadmap)
3. - [x] [Phase 1: Critical Security Issues](#phase-1-critical-security-issues) — 22 issues
4. - [x] [Phase 2: Data Integrity & Race Conditions](#phase-2-data-integrity--race-conditions) — 21 issues
5. - [ ] [Phase 3: Authorization & Access Control](#phase-3-authorization--access-control) — 12 issues
6. - [ ] [Phase 4: Validation & Error Handling](#phase-4-validation--error-handling) — 31 issues
7. - [ ] [Phase 5: Performance & Query Optimization](#phase-5-performance--query-optimization) — 11 issues
8. - [ ] [Phase 6: Infrastructure & DevOps](#phase-6-infrastructure--devops) — 36 issues
9. - [ ] [Phase 7: Missing Features & TODOs](#phase-7-missing-features--todos) — 9 issues
10. - [ ] [Fix Blueprints](#fix-blueprints) — 10 blueprints

---

## Priority Matrix

| Priority | Description | Count | Target |
|----------|-------------|-------|--------|
| P0 - Critical | Security vulnerabilities, data loss risk | 38 | Week 1 |
| P1 - High | Race conditions, auth bypass, infra gaps | 52 | Week 2-3 |
| P2 - Medium | Validation gaps, performance, monitoring | 48 | Week 4-6 |
| P3 - Low | Code quality, optimization, nice-to-haves | 18 | Week 7-8 |

---

## Execution Roadmap

```
Week 1          Week 2-3        Week 4-6        Week 7-8
[Phase 1]  -->  [Phase 2-3] --> [Phase 4-5] --> [Phase 6-7]
Security        Data Integrity   Validation      Infrastructure
Secrets         Race Conditions  Error Handling   Missing Features
Credentials     Auth Bypass      Performance      Code Quality
```

---

## Phase 1: Critical Security Issues

- [x] **Phase 1 Complete** (22/22 issues fixed)

### - [x] 1.1 Hardcoded Secrets in Source Code (12/12)

| # | File | Line(s) | Issue | Severity | Status |
|---|------|---------|-------|----------|--------|
| SEC-001 | `create-mongo-users.js` | 16-18 | Hardcoded admin/dev/prod passwords (`NocturnalAdmin2025!Secure`, `DevPass2025!ChangeMe`, `ProdPass2025!VeryStrong`) | P0-CRITICAL | [x] |
| SEC-002 | `create-mongo-user.js` | 19 | Hardcoded password `DevPass2025!ChangeMe` | P0-CRITICAL | [x] |
| SEC-003 | `fix-auth-with-localhost-exception.js` | 11-13 | Three hardcoded passwords (admin, dev, prod) | P0-CRITICAL | [x] |
| SEC-004 | `verify-and-fix-auth.js` | 11 | Dev credentials in connection string URI | P0-CRITICAL | [x] |
| SEC-005 | `recreate-dev-prod-users.js` | 8-10 | Admin, dev, prod passwords hardcoded | P0-CRITICAL | [x] |
| SEC-006 | `services/paymentService.js` | 15-18 | Razorpay fallback credentials (`rzp_test_YOUR_KEY_HERE`) | P0-CRITICAL | [x] |
| SEC-007 | `docker/mongo-init.js` | 8-9 | Default password `changeme` for MongoDB app user | P0-CRITICAL | [x] |
| SEC-008 | `.github/workflows/ci.yml` | 74-76 | Hardcoded JWT_SECRET and ENCRYPTION_KEY in CI | P1-HIGH | [x] |
| SEC-009 | `.github/workflows/ci.yml` | 150-152 | Plaintext credentials in build validation step | P1-HIGH | [x] |
| SEC-010 | `docker-compose.yml` | 10,28,47 | Weak default passwords (`admin123`, `redis123`) | P0-CRITICAL | [x] |
| SEC-011 | `docker-compose.prod.yml` | 21,56,86,140,188 | Production defaults to `changeme` passwords | P0-CRITICAL | [x] |
| SEC-012 | `k8s/secrets.yaml` | 13-25 | Plaintext secrets in Kubernetes manifest | P0-CRITICAL | [x] |

### - [x] 1.2 Payment Security (3/3)

| # | File | Line(s) | Issue | Severity | Status |
|---|------|---------|-------|----------|--------|
| PAY-001 | `services/paymentService.js` | 105-185 | Payment signature verified but amount NOT re-verified against booking | P0-CRITICAL | [x] |
| PAY-002 | `services/paymentService.js` | 27-97 | No idempotency check - duplicate orders created for same booking | P0-CRITICAL | [x] |
| PAY-003 | `services/paymentService.js` | 263-316 | Refund processed without transaction - refund succeeds but record may not update | P1-HIGH | [x] |

### - [x] 1.3 Dangerous Data Mutation (2/2)

| # | File | Line(s) | Issue | Severity | Status |
|---|------|---------|-------|----------|--------|
| SEC-013 | `services/patientService.js` | 203-205 | Unsafe `Object.keys(updateData).forEach` - allows setting ANY field including role, password | P0-CRITICAL | [x] |
| SEC-014 | `services/authService.js` | 46-50 | Error details with stack traces exposed in development mode | P1-HIGH | [x] |

### - [x] 1.4 Infrastructure Security (5/5)

| # | File | Line(s) | Issue | Severity | Status |
|---|------|---------|-------|----------|--------|
| SEC-015 | `docker-compose.logging.yml` | 15 | Elasticsearch `xpack.security.enabled=false` - no auth | P0-CRITICAL | [x] |
| SEC-016 | `docker-compose.logging.yml` | 147-149 | Grafana default `admin/admin` credentials | P0-CRITICAL | [x] |
| SEC-017 | `docker-compose.logging.yml` | 42-45 | Logstash exposes ports 5044, 5000, 9600 without auth | P1-HIGH | [x] |
| SEC-018 | `docker-compose.logging.yml` | 86 | Filebeat runs as root user | P1-HIGH | [x] |
| SEC-019 | `config/environments.js` | 72-77 | CORS defaults to `localhost:3000` even in production if env not set | P1-HIGH | [x] |

---

## Phase 2: Data Integrity & Race Conditions

- [x] **Phase 2 Complete** (21/21 issues fixed)

### - [x] 2.1 Missing Transaction Support / Atomicity Violations (9/9)

| # | File | Line(s) | Issue | Severity | Status |
|---|------|---------|-------|----------|--------|
| TXN-001 | `services/analyticsService.js` | 160-164 | `recordRating()` - multiple non-atomic operations; rating data corruption on partial save | P1-HIGH | [x] |
| TXN-002 | `services/applicationService.js` | 165-176 | Application acceptance - duty assigned to multiple applicants concurrently | P0-CRITICAL | [x] |
| TXN-003 | `services/bookingService.js` | 108-162 | `createBooking()` - create + save + health intake + cache invalidation not atomic | P1-HIGH | [x] |
| TXN-004 | `services/bookingService.js` | 255-325 | Provider assignment + access grant not atomic | P1-HIGH | [x] |
| TXN-005 | `services/calendarService.js` | 192-206 | `setAvailability()` - deleteMany + insertMany not atomic; user loses all availability if insert fails | P1-HIGH | [x] |
| TXN-006 | `services/healthIntakeService.js` | 42-69 | Status transition not atomic; multiple intake processes for same patient | P1-HIGH | [x] |
| TXN-007 | `services/healthMetricService.js` | 83-97 | Loop records metrics individually; some succeed, others fail silently | P1-HIGH | [x] |
| TXN-008 | `services/healthRecordService.js` | 71-126 | `appendUpdate()` - concurrent updates create orphaned versions | P1-HIGH | [x] |
| TXN-009 | `services/paymentService.js` | 263-316 | Refund processed but booking record not updated if save fails | P1-HIGH | [x] |

### - [x] 2.2 Race Conditions (12/12)

| # | File | Line(s) | Issue | Severity | Status |
|---|------|---------|-------|----------|--------|
| RACE-001 | `services/analyticsService.js` | 226-235 | `getHospitalDashboard()` counts pending apps globally (missing `postedBy` filter) | P1-HIGH | [x] |
| RACE-002 | `services/applicationService.js` | 165-176 | Same duty accepted by multiple concurrent requests | P0-CRITICAL | [x] |
| RACE-003 | `services/bookingService.js` | 255-325 | Two providers assigned to same booking concurrently | P1-HIGH | [x] |
| RACE-004 | `services/emergencySummaryService.js` | 163-175 | Multiple concurrent token revocations | P2-MEDIUM | [x] |
| RACE-005 | `services/healthIntakeService.js` | 42-69 | Multiple intake processes started for same patient | P1-HIGH | [x] |
| RACE-006 | `services/healthTrackerService.js` | 453 | Division after count query - count changes between query and calculation | P2-MEDIUM | [x] |
| RACE-007 | `services/investigationReportService.js` | 245-271 | Two doctors pick same report from queue | P1-HIGH | [x] |
| RACE-008 | `services/patientService.js` | 233-237 | Multiple concurrent address updates corrupt default flag | P2-MEDIUM | [x] |
| RACE-009 | `services/paymentService.js` | 27-97 | Multiple order creation for same booking | P0-CRITICAL | [x] |
| RACE-010 | `services/healthRecordService.js` | 71-126 | Concurrent version creation without optimistic locking | P1-HIGH | [x] |
| RACE-011 | `services/bookingService.js` | 456-498 | Service report saved before health metrics; no rollback on metric failure | P1-HIGH | [x] |
| RACE-012 | `services/bookingService.js` | 381-383 | Duration calculated with potentially null startTime/endTime | P2-MEDIUM | [x] |

---

## Phase 3: Authorization & Access Control

- [ ] **Phase 3 Complete** (0/12 issues fixed)

### - [x] 3.1 Authorization Bypass Risks (6/6)

| # | File | Line(s) | Issue | Severity | Status |
|---|------|---------|-------|----------|--------|
| AUTH-001 | `services/doctorAccessService.js` | 30-64 | `grantAccess()` - admin can grant access to ANY patient regardless of hospital boundary | P0-CRITICAL | [x] |
| AUTH-002 | `services/dutyService.js` | 117-122 | ObjectId comparison via `.toString()` vs `.id` - type mismatch bypass risk | P1-HIGH | [x] |
| AUTH-003 | `services/bookingService.js` | 180-190 | Admin role check requires extra DB query on every request | P2-MEDIUM | [x] |
| AUTH-004 | `services/doctorAccessService.js` | 36-41 | `expiresAt` not validated (can be past date); `maxUsage` can be negative | P1-HIGH | [x] |
| AUTH-005 | `services/doctorAccessService.js` | 199-220 | `recordUsage()` error doesn't revoke already-granted access | P2-MEDIUM | [x] |
| AUTH-006 | `services/healthRecordService.js` | 359-365 | Non-doctor users can be assigned as `intakeApprovedBy` | P1-HIGH | [x] |

### - [x] 3.2 Session & Authentication (2/2)

| # | File | Line(s) | Issue | Severity | Status |
|---|------|---------|-------|----------|--------|
| AUTH-007 | `patient-booking-service/.../patientService.js` | 142-160 | Password change doesn't invalidate existing sessions/tokens | P1-HIGH | [x] |
| AUTH-008 | `services/authService.js` | 122-123 | `lastActive` updated without verifying save succeeded | P2-MEDIUM | [x] |

### - [ ] 3.3 Kubernetes RBAC & Policies (0/4)

| # | File | Line(s) | Issue | Severity | Status |
|---|------|---------|-------|----------|--------|
| AUTH-009 | `k8s/deployment.yaml` | 26 | ServiceAccount `nocturnal-sa` exists but no RBAC roles defined | P1-HIGH | [x] |
| AUTH-010 | `k8s/deployment.yaml` | - | No PodSecurityPolicy or Pod Security Standards enforced | P1-HIGH | [x] |
| AUTH-011 | `k8s/deployment.yaml` | - | No NetworkPolicy - all pods can communicate freely | P1-HIGH | [x] |
| AUTH-012 | `k8s/secrets.yaml` | 1-25 | Kubernetes secrets base64 encoded, not encrypted at rest | P0-CRITICAL | [x] |

---

## Phase 4: Validation & Error Handling

- [ ] **Phase 4 Complete** (0/31 issues fixed)

### - [ ] 4.1 Missing Input Validation (0/16)

| # | File | Line(s) | Issue | Severity | Status |
|---|------|---------|-------|----------|--------|
| VAL-001 | `services/bookingService.js` | 96-106 | Surge pricing time format not validated - `parseInt(sh.start.split(':')[0])` crashes on bad format | P1-HIGH | [x] |
| VAL-002 | `services/calendarService.js` | 192-206 | No validation that slot `startTime < endTime` | P1-HIGH | [x] |
| VAL-003 | `services/emergencySummaryService.js` | 91-96 | Token expiry silently adjusted without notifying caller | P2-MEDIUM | [x] |
| VAL-004 | `services/healthIntakeService.js` | 194-206 | Only validates habits data; critical fields (allergies, medications) not required | P1-HIGH | [x] |
| VAL-005 | `services/healthTrackerService.js` | 39-44 | Allows recording diabetes metrics for non-diabetic patients | P2-MEDIUM | [x] |
| VAL-006 | `services/investigationReportService.js` | 91-107 | File URL/path not validated before sending to AI analysis | P2-MEDIUM | [x] |
| VAL-007 | `services/patientService.js` | 357-363 | Medical history `entryData` structure not validated per category | P1-HIGH | [x] |
| VAL-008 | `patient-booking-service/.../serviceCatalogService.js` | 145-160 | String-based time comparison bug - `"9:45" >= "09:00"` is FALSE (wrong) | P1-HIGH | [x] |
| VAL-009 | `services/dutyService.js` | 24-49 | Page/limit not validated - `page=999999` causes huge skip | P2-MEDIUM | [x] |
| VAL-010 | `services/geminiAnalysisService.js` | 89-97 | No file size validation before reading into memory and base64 encoding | P1-HIGH | [x] |
| VAL-011 | `services/notificationService.js` | 142-152 | `recipientModel` not validated in `createNotification()` | P2-MEDIUM | [x] |
| VAL-012 | `config/validateEnv.js` | 51-59 | JWT_SECRET minimum 32 chars - should be 64 for HS256 | P2-MEDIUM | [x] |
| VAL-013 | `config/validateEnv.js` | 71-74 | ENCRYPTION_KEY regex forces hex format, rejects other valid formats | P3-LOW | [x] |
| VAL-014 | `config/rateLimit.js` | 163-164 | Whitelisted IPs not validated at startup | P2-MEDIUM | [x] |
| VAL-015 | `config/storage.js` | 169-171 | File upload limits exist but no MIME type validation | P2-MEDIUM | [x] |
| VAL-016 | `patient-booking-service/.../bookingService.js` | 32-40 | Service availability not validated by location | P2-MEDIUM | [x] |

### - [ ] 4.2 Null/Undefined Reference Risks (0/5)

| # | File | Line(s) | Issue | Severity | Status |
|---|------|---------|-------|----------|--------|
| NULL-001 | `services/analyticsService.js` | 89-101 | `acceptedApp.applicant` accessed without null check after populate | P1-HIGH | [ ] |
| NULL-002 | `services/analyticsService.js` | 104-105 | `duty.createdAt` may be undefined - causes NaN in response time | P2-MEDIUM | [ ] |
| NULL-003 | `services/applicationService.js` | 399 | `statusHistory[length - 2]` without bounds check | P2-MEDIUM | [ ] |
| NULL-004 | `services/bookingService.js` | 381-383 | `startTime` may be undefined before completion - NaN duration | P2-MEDIUM | [ ] |
| NULL-005 | `services/patientDashboardService.js` | 183 | `statusTimestamps?.completedAt` - optional chain but structure mismatch | P3-LOW | [ ] |

### - [ ] 4.3 Error Handling Gaps (0/8)

| # | File | Line(s) | Issue | Severity | Status |
|---|------|---------|-------|----------|--------|
| ERR-001 | `services/geminiAnalysisService.js` | 119-124 | JSON.parse on regex-extracted text can throw unhandled | P1-HIGH | [ ] |
| ERR-002 | `services/healthMetricService.js` | 83-97 | Errors swallowed silently in metric recording loop | P1-HIGH | [ ] |
| ERR-003 | `services/investigationReportService.js` | 504-577 | Notification failures silently logged - patient misses critical updates | P1-HIGH | [ ] |
| ERR-004 | `services/investigationReportService.js` | 45-48 | AI analysis fire-and-forget - no job tracking | P2-MEDIUM | [ ] |
| ERR-005 | `services/bookingService.js` | 456-498 | Health metrics failure just logged - no rollback of booking | P1-HIGH | [ ] |
| ERR-006 | `services/doctorAccessService.js` | 199-220 | `recordUsage()` failure doesn't affect access decision | P2-MEDIUM | [ ] |
| ERR-007 | `config/storage.js` | 26-34 | GCS credentials parse failure silently falls back to local storage in production | P1-HIGH | [ ] |
| ERR-008 | `config/redis.js` | 49-95 | Redis client returned before confirming connection | P2-MEDIUM | [ ] |

### - [ ] 4.4 Inconsistent Error Messages (0/2)

| # | File | Line(s) | Issue | Severity | Status |
|---|------|---------|-------|----------|--------|
| ERR-009 | `patient-booking-service/.../patientService.js` | throughout | Generic "Patient not found" for both 404 and auth failures | P3-LOW | [ ] |
| ERR-010 | `services/emergencySummaryService.js` | 25-29 | New patients blocked from emergency summary until intake approved | P2-MEDIUM | [ ] |

---

## Phase 5: Performance & Query Optimization

- [ ] **Phase 5 Complete** (0/11 issues fixed)

### - [ ] 5.1 N+1 Query Problems (0/5)

| # | File | Line(s) | Issue | Severity | Status |
|---|------|---------|-------|----------|--------|
| PERF-001 | `services/applicationService.js` | 21-33 | Populates entire `duty` object without field selection | P2-MEDIUM | [ ] |
| PERF-002 | `services/healthTrackerService.js` | 291-359 | O(n) BP reading matching algorithm - should use aggregation | P2-MEDIUM | [ ] |
| PERF-003 | `services/patientDashboardService.js` | 265-370 | Loads ALL records into memory, sorts manually, then paginates | P1-HIGH | [ ] |
| PERF-004 | `services/bookingService.js` | 180-190 | Extra DB query for admin role check on every request | P2-MEDIUM | [ ] |
| PERF-005 | `services/notificationService.js` | 28-38 | Missing indexes on `relatedDuty`/`relatedApplication` foreign keys | P2-MEDIUM | [ ] |

### - [ ] 5.2 Inefficient Algorithms (0/6)

| # | File | Line(s) | Issue | Severity | Status |
|---|------|---------|-------|----------|--------|
| PERF-006 | `services/calendarService.js` | 57-58 | Conflict detection + weekly hours check on every create (no caching) | P2-MEDIUM | [ ] |
| PERF-007 | `services/healthMetricService.js` | 192-232 | O(n) alert grouping - should use MongoDB aggregation | P3-LOW | [ ] |
| PERF-008 | `services/patientDashboardService.js` | 105-119 | Application-level vitals formatting instead of DB projection | P3-LOW | [ ] |
| PERF-009 | `patient-booking-service/.../serviceCatalogService.js` | 137-177 | Surge pricing recalculated on every request (no caching) | P2-MEDIUM | [ ] |
| PERF-010 | `services/healthRecordService.js` | 133-149 | Array merge doesn't check for duplicates - creates duplicate entries | P1-HIGH | [ ] |
| PERF-011 | `services/geminiAnalysisService.js` | 26 | Model name `gemini-1.5-flash` hardcoded, not configurable | P3-LOW | [ ] |

---

## Phase 6: Infrastructure & DevOps

- [ ] **Phase 6 Complete** (0/36 issues fixed)

### - [ ] 6.1 Docker Configuration Issues (0/5)

| # | File | Line(s) | Issue | Severity | Status |
|---|------|---------|-------|----------|--------|
| INFRA-001 | `docker/mongo-replica-init.sh` | 21 | `sleep(5000)` is JavaScript syntax, not bash - script WILL FAIL | P0-CRITICAL | [ ] |
| INFRA-002 | `docker-compose.logging.yml` | 16 | Elasticsearch heap only 512MB - insufficient for production | P2-MEDIUM | [ ] |
| INFRA-003 | `docker-compose.logging.yml` | 83-99 | Filebeat container has no health check | P2-MEDIUM | [ ] |
| INFRA-004 | `docker-compose.prod.yml` | 216-220 | Only 30MB log capacity per container | P2-MEDIUM | [ ] |
| INFRA-005 | `docker-compose.prod.yml` | 290-342 | Monitoring (Prometheus/Grafana) optional via profiles - should be mandatory | P1-HIGH | [ ] |

### - [ ] 6.2 Kubernetes Configuration Issues (0/6)

| # | File | Line(s) | Issue | Severity | Status |
|---|------|---------|-------|----------|--------|
| K8S-001 | `k8s/deployment.yaml` | 34 | Image tag hardcoded as `latest` - no reproducible deployments | P1-HIGH | [ ] |
| K8S-002 | `k8s/mongodb.yaml` | 29-80 | MongoDB replica set not initialized (missing initContainer) | P1-HIGH | [ ] |
| K8S-003 | `k8s/mongodb.yaml` | 86 | References `fast-ssd` StorageClass that doesn't exist - PVC stuck pending | P1-HIGH | [ ] |
| K8S-004 | `k8s/redis.yaml` | 23 | Redis single instance (`replicas: 1`) - single point of failure | P1-HIGH | [ ] |
| K8S-005 | `k8s/ingress.yaml` | 8 | References `letsencrypt-prod` ClusterIssuer that may not exist | P1-HIGH | [ ] |
| K8S-006 | `k8s/ingress.yaml` | 20,24,41 | Domain names hardcoded - not configurable per environment | P2-MEDIUM | [ ] |

### - [ ] 6.3 CI/CD Pipeline Issues (0/8)

| # | File | Line(s) | Issue | Severity | Status |
|---|------|---------|-------|----------|--------|
| CICD-001 | `.github/workflows/cd.yml` | 61-64 | Database migrations COMMENTED OUT in deployment | P0-CRITICAL | [ ] |
| CICD-002 | `.github/workflows/cd.yml` | 66-69 | Smoke tests are just `echo` statements - no real validation | P0-CRITICAL | [ ] |
| CICD-003 | `.github/workflows/cd.yml` | 143-151 | Rollback mechanism has NO implementation | P0-CRITICAL | [ ] |
| CICD-004 | `.github/workflows/ci.yml` | 32-34 | Lint errors ignored with `continue-on-error: true` | P2-MEDIUM | [ ] |
| CICD-005 | `.github/workflows/ci.yml` | 115-116 | Security audit only fails on HIGH+ (misses MEDIUM vulnerabilities) | P2-MEDIUM | [ ] |
| CICD-006 | `.github/workflows/ci-cd.yml` | - | No Docker image vulnerability scanning (Trivy/Snyk) | P1-HIGH | [ ] |
| CICD-007 | `.github/workflows/ci-cd.yml` | - | No Docker image signing for integrity verification | P2-MEDIUM | [ ] |
| CICD-008 | `.github/workflows/ci.yml` | - | No secret scanning (Gitleaks/git-secrets) in pipeline | P0-CRITICAL | [ ] |

### - [ ] 6.4 Database & Connection Configuration (0/5)

| # | File | Line(s) | Issue | Severity | Status |
|---|------|---------|-------|----------|--------|
| DB-001 | `config/environments.js` | 46 | `MONGODB_URI` has no default and no startup validation | P1-HIGH | [ ] |
| DB-002 | `config/environments.js` | 199-200 | Production pool size 20 - may be insufficient under load | P2-MEDIUM | [ ] |
| DB-003 | `config/database.js` | 88-96 | No `writeConcern: { w: 'majority' }` specified | P2-MEDIUM | [ ] |
| DB-004 | `config/database.js` | - | No `readPreference` for replica set load balancing | P2-MEDIUM | [ ] |
| DB-005 | `update-user.js` | 8 | Uses wrong env var `MONGO_URI` instead of `MONGODB_URI` | P1-HIGH | [ ] |

### - [ ] 6.5 Rate Limiting & Caching (0/3)

| # | File | Line(s) | Issue | Severity | Status |
|---|------|---------|-------|----------|--------|
| RL-001 | `config/rateLimit.js` | 8-28 | Rate limit metrics in-memory only - reset on deploy | P1-HIGH | [ ] |
| RL-002 | `config/rateLimit.js` | 172-183 | Falls back to memory store if Redis down - multi-instance bypass | P1-HIGH | [ ] |
| RL-003 | `config/rateLimit.js` | 239-240 | Cleanup interval skipped in test causing Jest hangs | P3-LOW | [ ] |

### - [ ] 6.6 Miscellaneous Infrastructure (0/11)

| # | File | Line(s) | Issue | Severity | Status |
|---|------|---------|-------|----------|--------|
| MISC-001 | `config/vault.js` | 36 | `node-vault` required but not in package.json | P2-MEDIUM | [ ] |
| MISC-002 | `config/storage.js` | 6-7 | Production defaults to GCS even if not configured | P2-MEDIUM | [ ] |
| MISC-003 | `config/environments.js` | 207 | Production logging level `error` only - misses warnings | P2-MEDIUM | [ ] |
| MISC-004 | `ecosystem.config.js` | 49-52 | PM2 logs have no rotation policy - disk fill risk | P1-HIGH | [ ] |
| MISC-005 | `config/environments.js` | - | No OpenTelemetry/distributed tracing configuration | P3-LOW | [ ] |
| MISC-006 | `app.js` | - | No global request timeout configured | P2-MEDIUM | [ ] |
| MISC-007 | `app.js` | - | No Content-Length limit on request bodies | P2-MEDIUM | [ ] |
| MISC-008 | - | - | No Terraform state management configured | P1-HIGH | [ ] |
| MISC-009 | - | - | No automated database backup policy | P0-CRITICAL | [ ] |
| MISC-010 | - | - | No documented disaster recovery procedures | P0-CRITICAL | [ ] |
| MISC-011 | `.github/workflows/ci-cd.yml` | 201-206 | AWS secret validation missing - deployment fails silently | P2-MEDIUM | [ ] |

---

## Phase 7: Missing Features & TODOs

- [ ] **Phase 7 Complete** (0/9 issues fixed)

### - [ ] 7.1 Incomplete Implementations (0/7)

| # | File | Line(s) | Issue | Severity | Status |
|---|------|---------|-------|----------|--------|
| TODO-001 | `services/healthIntakeService.js` | 64 | TODO: Send notification to patient to complete intake | P1-HIGH | [ ] |
| TODO-002 | `services/healthIntakeService.js` | 186 | TODO: Notify admins of new pending intake | P1-HIGH | [ ] |
| TODO-003 | `services/healthIntakeService.js` | 227 | TODO: Notify assigned doctor | P1-HIGH | [ ] |
| TODO-004 | `services/healthIntakeService.js` | 293 | TODO: Notify patient of approval | P1-HIGH | [ ] |
| TODO-005 | `services/healthIntakeService.js` | 320 | TODO: Notify patient of required changes | P1-HIGH | [ ] |
| TODO-006 | `services/healthIntakeService.js` | 346 | TODO: Additional notification placeholder | P2-MEDIUM | [ ] |
| TODO-007 | `patient-booking-service/.../bookingService.js` | 80 | TODO: Publish `booking.created` event to RabbitMQ | P1-HIGH | [ ] |

### - [ ] 7.2 Missing Audit Logging (0/2)

| # | File | Line(s) | Issue | Severity | Status |
|---|------|---------|-------|----------|--------|
| AUDIT-001 | `services/applicationService.js` | 141-185 | Status changes lack old status, changed fields, timestamp precision | P2-MEDIUM | [ ] |
| AUDIT-002 | Multiple health services | - | Critical health operations not audit-logged for compliance | P1-HIGH | [ ] |

---

## Fix Blueprints

- [ ] **All Blueprints Implemented** (0/10)

### - [ ] Blueprint 1: Remove All Hardcoded Secrets (SEC-001 to SEC-012)

**Affects:** 12 issues | **Priority:** P0 | **Estimated Effort:** 1-2 days

**Strategy:**
1. Create a `.env.example` with placeholder values
2. Replace all hardcoded values with `process.env.*` reads
3. Add startup validation that required secrets are set
4. Scrub git history using `git filter-branch` or BFG Repo Cleaner
5. Rotate ALL exposed credentials immediately

**Implementation Pattern:**
```javascript
// BEFORE (bad)
const ADMIN_PASSWORD = 'NocturnalAdmin2025!Secure';

// AFTER (good)
const ADMIN_PASSWORD = process.env.MONGO_ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  console.error('MONGO_ADMIN_PASSWORD environment variable is required');
  process.exit(1);
}
```

**Files to modify:**
- `create-mongo-users.js` - Lines 16-18
- `create-mongo-user.js` - Line 19
- `fix-auth-with-localhost-exception.js` - Lines 11-13
- `verify-and-fix-auth.js` - Line 11
- `recreate-dev-prod-users.js` - Lines 8-10
- `services/paymentService.js` - Lines 15-18 (remove fallback)
- `docker/mongo-init.js` - Lines 8-9 (remove default)
- `docker-compose.yml` - Lines 10, 28, 47 (remove weak defaults)
- `docker-compose.prod.yml` - Lines 21, 56, 86, 140, 188
- `k8s/secrets.yaml` - Migrate to External Secrets Operator
- `.github/workflows/ci.yml` - Lines 74-76, 150-152 (use GitHub Secrets)

**Post-fix validation:**
```bash
# Scan for remaining secrets
grep -rn "password\|secret\|key.*=.*['\"]" --include="*.js" --include="*.yml" --include="*.yaml" .
```

---

### - [ ] Blueprint 2: Implement MongoDB Transactions (TXN-001 to TXN-009)

**Affects:** 9 issues | **Priority:** P1 | **Estimated Effort:** 3-4 days

**Strategy:**
1. Create a reusable `withTransaction` helper utility
2. Wrap all multi-step operations in sessions
3. Ensure MongoDB replica set is configured (required for transactions)

**Implementation Pattern:**
```javascript
// utils/transaction.js
const withTransaction = async (fn) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// Usage in applicationService.js (TXN-002)
async updateApplicationStatus(applicationId, status, userId) {
  return withTransaction(async (session) => {
    const application = await Application.findById(applicationId).session(session);
    application.status = status;
    await application.save({ session });

    if (status === 'ACCEPTED') {
      await Duty.findByIdAndUpdate(
        application.duty._id,
        { status: 'FILLED', assignedTo: application.applicant },
        { session }
      );
      // Reject other applications
      await Application.updateMany(
        { duty: application.duty._id, _id: { $ne: applicationId } },
        { status: 'REJECTED' },
        { session }
      );
    }
    return application;
  });
}
```

**Files to modify:**
- Create `utils/transaction.js` (new file)
- `services/analyticsService.js` - Wrap `recordRating()` (lines 160-164)
- `services/applicationService.js` - Wrap acceptance flow (lines 165-176)
- `services/bookingService.js` - Wrap `createBooking()` (lines 108-162) and provider assignment (lines 255-325)
- `services/calendarService.js` - Wrap `setAvailability()` (lines 192-206)
- `services/healthIntakeService.js` - Wrap status transitions (lines 42-69)
- `services/healthMetricService.js` - Wrap `recordMultipleMetrics()` (lines 83-97)
- `services/healthRecordService.js` - Wrap `appendUpdate()` (lines 71-126)
- `services/paymentService.js` - Wrap refund flow (lines 263-316)

---

### - [ ] Blueprint 3: Fix Race Conditions with Atomic Operations (RACE-001 to RACE-012)

**Affects:** 12 issues | **Priority:** P0-P1 | **Estimated Effort:** 2-3 days

**Strategy:**
1. Use `findOneAndUpdate` with conditions for state checks
2. Add optimistic locking via version fields
3. Use atomic `$set` and `$inc` operators

**Implementation Pattern:**
```javascript
// BEFORE (race condition - RACE-002)
const application = await Application.findById(id);
if (application.status !== 'PENDING') throw new Error('Not pending');
application.status = 'ACCEPTED';
await application.save();

// AFTER (atomic)
const application = await Application.findOneAndUpdate(
  { _id: id, status: 'PENDING' },  // condition ensures atomicity
  { $set: { status: 'ACCEPTED', updatedAt: new Date() } },
  { new: true }
);
if (!application) {
  throw new Error('Application not found or already processed');
}
```

**Key fixes by file:**

| Issue | Atomic Fix |
|-------|-----------|
| RACE-001 (analytics) | Add `postedBy: hospitalId` filter to `pendingApplications` query |
| RACE-002 (application) | `findOneAndUpdate` with `status: 'PENDING'` condition |
| RACE-003 (booking) | `findOneAndUpdate` with `status: { $ne: 'ASSIGNED' }` condition |
| RACE-005 (intake) | `findOneAndUpdate` with `intakeStatus: 'NOT_STARTED'` condition |
| RACE-007 (investigation) | Already uses `findOneAndUpdate` - add unique index for safety |
| RACE-009 (payment) | Check `booking.payment.orderId` before creating new order |
| RACE-010 (health record) | Add `__v` version field check in update condition |

---

### - [ ] Blueprint 4: Fix Payment Security (PAY-001 to PAY-003)

**Affects:** 3 issues | **Priority:** P0 | **Estimated Effort:** 1 day

**Implementation:**
```javascript
// PAY-001: Verify amount matches
async verifyPayment(bookingId, paymentData) {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = paymentData;
  const booking = await NurseBooking.findById(bookingId);

  // Step 1: Verify order ID matches
  if (razorpay_order_id !== booking.payment.orderId) {
    throw new Error('Order ID mismatch');
  }

  // Step 2: Verify signature
  const body = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSign = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body).digest('hex');

  if (razorpay_signature !== expectedSign) {
    booking.payment.status = 'FAILED';
    await booking.save();
    throw new Error('Invalid payment signature');
  }

  // Step 3: Verify amount with Razorpay API
  const payment = await razorpay.payments.fetch(razorpay_payment_id);
  if (payment.amount !== booking.payment.amount * 100) {
    throw new Error('Payment amount mismatch');
  }

  // Step 4: Update booking
  booking.payment.status = 'PAID';
  booking.payment.paymentId = razorpay_payment_id;
  await booking.save();
}

// PAY-002: Idempotency check
async createOrder(bookingId, userId) {
  const booking = await NurseBooking.findById(bookingId);
  if (booking.payment?.orderId) {
    // Return existing order instead of creating new one
    return { orderId: booking.payment.orderId, amount: booking.payment.amount };
  }
  // ... create new order
}
```

---

### - [ ] Blueprint 5: Secure Patient Data Updates (SEC-013)

**Affects:** 1 critical issue | **Priority:** P0 | **Estimated Effort:** 0.5 day

**Implementation:**
```javascript
// BEFORE (services/patientService.js:203-205)
Object.keys(updateData).forEach(key => {
  patient[key] = updateData[key];  // DANGEROUS
});

// AFTER
const ALLOWED_UPDATE_FIELDS = [
  'firstName', 'lastName', 'phone', 'dateOfBirth',
  'gender', 'bloodGroup', 'emergencyContact',
  'preferredLanguage', 'communicationPreferences'
];

ALLOWED_UPDATE_FIELDS.forEach(key => {
  if (updateData[key] !== undefined) {
    patient[key] = updateData[key];
  }
});
```

---

### - [ ] Blueprint 6: Add Input Validation Layer (VAL-001 to VAL-016)

**Affects:** 16 issues | **Priority:** P1-P2 | **Estimated Effort:** 3-4 days

**Strategy:**
1. Create validation middleware using `joi` or `express-validator`
2. Add validators for all service entry points
3. Validate at controller level before reaching services

**Key Validations to Add:**

```javascript
// validators/bookingValidators.js
const validateSurgeTime = (timeStr) => {
  const match = timeStr.match(/^(\d{2}):(\d{2})$/);
  if (!match) throw new ValidationError('Time must be HH:MM format');
  const [, hours, minutes] = match;
  if (hours > 23 || minutes > 59) throw new ValidationError('Invalid time');
  return true;
};

// validators/calendarValidators.js
const validateTimeSlot = (slot) => {
  if (!slot.startTime || !slot.endTime) throw new ValidationError('Start and end time required');
  if (new Date(slot.startTime) >= new Date(slot.endTime)) {
    throw new ValidationError('Start time must be before end time');
  }
};

// validators/healthIntakeValidators.js
const validateIntakeData = (data) => {
  const required = ['habits'];
  const recommended = ['allergies', 'currentMedications'];
  for (const field of required) {
    if (!data[field] || Object.keys(data[field]).length === 0) {
      throw new ValidationError(`${field} is required`);
    }
  }
  // Warn but don't block on recommended fields
  const warnings = [];
  for (const field of recommended) {
    if (!data[field]) warnings.push(`${field} not provided`);
  }
  return { valid: true, warnings };
};

// Fix VAL-008: Time comparison bug
// BEFORE: string comparison "9:45" >= "09:00" (WRONG)
// AFTER: numeric comparison
const isWithinTimeSlot = (currentTime, start, end) => {
  const toMinutes = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const current = toMinutes(currentTime);
  return current >= toMinutes(start) && current <= toMinutes(end);
};
```

---

### - [ ] Blueprint 7: Fix Infrastructure Issues (INFRA, K8S, CICD)

**Affects:** 25+ issues | **Priority:** P0-P2 | **Estimated Effort:** 5-7 days

**Week 1 - Critical Fixes:**

```bash
# INFRA-001: Fix bash syntax in mongo-replica-init.sh
# Change: sleep(5000);
# To:     sleep 5

# CICD-008: Add secret scanning
# Add to .github/workflows/ci.yml:
- name: Run Gitleaks
  uses: gitleaks/gitleaks-action@v2
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

```yaml
# CICD-001: Uncomment and implement migrations
- name: Run database migrations
  run: npm run migrate:staging

# CICD-002: Implement real smoke tests
- name: Smoke tests
  run: |
    for i in {1..30}; do
      if curl -sf https://staging.nocturnal.com/api/v1/health; then
        echo "Health check passed"
        exit 0
      fi
      sleep 10
    done
    echo "Health check failed after 5 minutes"
    exit 1

# CICD-003: Implement rollback
- name: Rollback deployment
  run: |
    kubectl rollout undo deployment/nocturnal-api -n production
    kubectl rollout status deployment/nocturnal-api -n production --timeout=300s
```

**Week 2 - Kubernetes Hardening:**

```yaml
# K8S-001: Use specific image tags (deployment.yaml)
image: ghcr.io/yourusername/nocturnal:{{ .Values.image.tag }}

# K8S-003: Create StorageClass or use standard
storageClassName: "standard"  # Or create fast-ssd StorageClass

# K8S-004: Redis HA
# Switch to Redis Sentinel or use Bitnami Redis Helm chart with:
# replica.replicaCount: 2
# sentinel.enabled: true

# AUTH-011: Add NetworkPolicy
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: nocturnal-api-policy
spec:
  podSelector:
    matchLabels:
      app: nocturnal-api
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: nginx-ingress
      ports:
        - port: 3000
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: mongodb
      ports:
        - port: 27017
    - to:
        - podSelector:
            matchLabels:
              app: redis
      ports:
        - port: 6379
```

---

### - [ ] Blueprint 8: Implement Notification System (TODO-001 to TODO-006)

**Affects:** 6 issues | **Priority:** P1 | **Estimated Effort:** 2-3 days

**Strategy:** Wire existing `notificationService` into health intake workflow

```javascript
// services/healthIntakeService.js - Add notifications at each TODO point

// TODO-001 (line 64): Notify patient
await notificationService.createNotification({
  recipient: patientId,
  recipientModel: 'Patient',
  type: 'INTAKE_STARTED',
  title: 'Health Intake Required',
  message: 'Please complete your health intake form to proceed with your booking.',
  relatedBooking: bookingId,
  priority: 'high'
});

// TODO-002 (line 186): Notify admins
const admins = await User.find({ role: 'admin' }).select('_id');
await Promise.all(admins.map(admin =>
  notificationService.createNotification({
    recipient: admin._id,
    recipientModel: 'User',
    type: 'INTAKE_PENDING_REVIEW',
    title: 'New Intake Pending Assignment',
    message: `Patient intake submitted and needs doctor assignment.`,
    priority: 'medium'
  })
));

// TODO-003 (line 227): Notify assigned doctor
await notificationService.createNotification({
  recipient: doctorId,
  recipientModel: 'User',
  type: 'INTAKE_ASSIGNED',
  title: 'Health Record Review Assigned',
  message: 'A new patient health record has been assigned for your review.',
  priority: 'high'
});

// TODO-004 (line 293): Notify patient of approval
await notificationService.createNotification({
  recipient: patientId,
  recipientModel: 'Patient',
  type: 'INTAKE_APPROVED',
  title: 'Health Record Approved',
  message: 'Your health record has been reviewed and approved by the doctor.',
  priority: 'high'
});

// TODO-005 (line 320): Notify patient of required changes
await notificationService.createNotification({
  recipient: patientId,
  recipientModel: 'Patient',
  type: 'INTAKE_CHANGES_REQUIRED',
  title: 'Health Record Update Required',
  message: 'Your doctor has requested changes to your health record. Please review and update.',
  priority: 'high'
});
```

---

### - [ ] Blueprint 9: Performance Optimization (PERF-001 to PERF-011)

**Affects:** 11 issues | **Priority:** P2-P3 | **Estimated Effort:** 3-4 days

**Key fixes:**

```javascript
// PERF-001: Select specific fields in populate
// BEFORE
populate: 'duty'
// AFTER
populate: { path: 'duty', select: 'title hospital startDate endDate specialty status' }

// PERF-003: Replace in-memory sort with aggregation
// BEFORE (patientDashboardService.js:265-370)
const [bookings, healthRecords, doctorNotes] = await Promise.all([...]);
const events = [...bookings, ...healthRecords, ...doctorNotes];
events.sort((a, b) => new Date(b.date) - new Date(a.date));
const paginatedEvents = events.slice(skip, skip + limit);

// AFTER: Use $unionWith aggregation
const events = await NurseBooking.aggregate([
  { $match: { patient: patientId } },
  { $project: { type: { $literal: 'booking' }, date: '$scheduledDate', title: '$serviceType' } },
  { $unionWith: {
    coll: 'healthrecords',
    pipeline: [
      { $match: { patient: patientId } },
      { $project: { type: { $literal: 'health_record' }, date: '$createdAt', title: '$recordType' } }
    ]
  }},
  { $sort: { date: -1 } },
  { $skip: skip },
  { $limit: limit }
]);

// PERF-010: Deduplicate array merges
// BEFORE (healthRecordService.js:133-149)
merged[field] = [...(existing[field] || []), ...updates[field]];
// AFTER
const existingIds = new Set((existing[field] || []).map(item =>
  item.name?.toLowerCase() || JSON.stringify(item)
));
const newItems = updates[field].filter(item => {
  const key = item.name?.toLowerCase() || JSON.stringify(item);
  return !existingIds.has(key);
});
merged[field] = [...(existing[field] || []), ...newItems.map(item => ({
  ...item, addedAt: new Date()
}))];
```

---

### - [ ] Blueprint 10: Database Configuration Hardening (DB-001 to DB-005)

**Affects:** 5 issues | **Priority:** P1-P2 | **Estimated Effort:** 1 day

```javascript
// config/database.js - Add write concern and read preference
const options = {
  maxPoolSize: parseInt(process.env.MONGO_POOL_SIZE) || 20,
  minPoolSize: 5,
  writeConcern: { w: 'majority', j: true, wtimeout: 5000 },
  readPreference: process.env.MONGO_READ_PREFERENCE || 'secondaryPreferred',
  retryWrites: true,
  retryReads: true
};

// config/environments.js - Add startup validation
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET', 'ENCRYPTION_KEY'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`FATAL: ${envVar} environment variable is required`);
    process.exit(1);
  }
}

// Fix DB-005: update-user.js wrong env var
// BEFORE: await mongoose.connect(process.env.MONGO_URI);
// AFTER:  await mongoose.connect(process.env.MONGODB_URI);
```

---

## Quick Reference: All Issues by File

| File | Issue IDs | Count |
|------|-----------|-------|
| `services/bookingService.js` | TXN-003, TXN-004, RACE-003, RACE-011, RACE-012, VAL-001, PERF-004, AUTH-003, ERR-005 | 9 |
| `services/paymentService.js` | SEC-006, PAY-001, PAY-002, PAY-003, TXN-009, RACE-009 | 6 |
| `services/applicationService.js` | TXN-002, RACE-002, NULL-003, PERF-001, AUDIT-001 | 5 |
| `services/patientService.js` | SEC-013, RACE-008, VAL-007 | 3 |
| `services/analyticsService.js` | TXN-001, RACE-001, NULL-001, NULL-002 | 4 |
| `services/healthIntakeService.js` | TXN-006, RACE-005, VAL-004, TODO-001 to TODO-006 | 9 |
| `services/healthRecordService.js` | TXN-008, RACE-010, AUTH-006, PERF-010 | 4 |
| `services/healthTrackerService.js` | RACE-006, VAL-005, PERF-002 | 3 |
| `services/healthMetricService.js` | TXN-007, ERR-002, PERF-007 | 3 |
| `services/investigationReportService.js` | RACE-007, VAL-006, ERR-003, ERR-004 | 4 |
| `services/geminiAnalysisService.js` | ERR-001, VAL-010, PERF-011 | 3 |
| `services/calendarService.js` | TXN-005, VAL-002, PERF-006 | 3 |
| `services/doctorAccessService.js` | AUTH-001, AUTH-004, AUTH-005, ERR-006 | 4 |
| `services/emergencySummaryService.js` | RACE-004, VAL-003, ERR-010 | 3 |
| `services/patientDashboardService.js` | PERF-003, PERF-008, NULL-005 | 3 |
| `services/notificationService.js` | VAL-011, PERF-005 | 2 |
| `services/authService.js` | SEC-014, AUTH-008 | 2 |
| `services/dutyService.js` | AUTH-002, VAL-009 | 2 |
| `patient-booking-service/bookingService.js` | TODO-007, VAL-016 | 2 |
| `patient-booking-service/patientService.js` | AUTH-007, ERR-009 | 2 |
| `patient-booking-service/serviceCatalogService.js` | VAL-008, PERF-009 | 2 |
| `config/environments.js` | DB-001, DB-002, MISC-003, SEC-019 | 4 |
| `config/database.js` | DB-003, DB-004 | 2 |
| `config/validateEnv.js` | VAL-012, VAL-013 | 2 |
| `config/rateLimit.js` | RL-001, RL-002, RL-003, VAL-014 | 4 |
| `config/storage.js` | ERR-007, MISC-002, VAL-015 | 3 |
| `config/redis.js` | ERR-008 | 1 |
| `config/vault.js` | MISC-001 | 1 |
| `docker-compose.yml` | SEC-010 | 1 |
| `docker-compose.prod.yml` | SEC-011, INFRA-004, INFRA-005 | 3 |
| `docker-compose.logging.yml` | SEC-015, SEC-016, SEC-017, SEC-018, INFRA-002, INFRA-003 | 6 |
| `docker/mongo-replica-init.sh` | INFRA-001 | 1 |
| `docker/mongo-init.js` | SEC-007 | 1 |
| `k8s/deployment.yaml` | K8S-001, AUTH-009, AUTH-010, AUTH-011 | 4 |
| `k8s/secrets.yaml` | SEC-012, AUTH-012 | 2 |
| `k8s/mongodb.yaml` | K8S-002, K8S-003 | 2 |
| `k8s/redis.yaml` | K8S-004 | 1 |
| `k8s/ingress.yaml` | K8S-005, K8S-006 | 2 |
| `.github/workflows/ci.yml` | SEC-008, SEC-009, CICD-004, CICD-005, CICD-008 | 5 |
| `.github/workflows/cd.yml` | CICD-001, CICD-002, CICD-003 | 3 |
| `.github/workflows/ci-cd.yml` | CICD-006, CICD-007, MISC-011 | 3 |
| `create-mongo-users.js` | SEC-001 | 1 |
| `create-mongo-user.js` | SEC-002 | 1 |
| `fix-auth-with-localhost-exception.js` | SEC-003 | 1 |
| `verify-and-fix-auth.js` | SEC-004 | 1 |
| `recreate-dev-prod-users.js` | SEC-005 | 1 |
| `update-user.js` | DB-005 | 1 |
| `ecosystem.config.js` | MISC-004 | 1 |
| `app.js` | MISC-006, MISC-007 | 2 |
| Multiple/No specific file | AUDIT-002, MISC-005, MISC-008, MISC-009, MISC-010 | 5 |

---

## Progress Tracker

| Phase | Total | Fixed | Remaining | % Complete |
|-------|-------|-------|-----------|------------|
| Phase 1: Critical Security | 22 | 22 | 0 | 100% |
| Phase 2: Data Integrity | 21 | 21 | 0 | 100% |
| Phase 3: Authorization | 12 | 0 | 12 | 0% |
| Phase 4: Validation & Errors | 31 | 0 | 31 | 0% |
| Phase 5: Performance | 11 | 0 | 11 | 0% |
| Phase 6: Infrastructure | 36 | 0 | 36 | 0% |
| Phase 7: Missing Features | 9 | 0 | 9 | 0% |
| **TOTAL** | **139** | **43** | **96** | **31%** |

> Note: Some issues are counted in multiple categories. Unique issue count: 156. Table tracks by phase assignment (primary category).

---

## Definition of Done

For each issue to be marked as fixed:
- [ ] Code change implemented
- [ ] Unit test added/updated covering the fix
- [ ] Code reviewed
- [ ] No regression in existing tests
- [ ] Deployed to staging and verified
- [ ] Security issues: Verified with penetration testing
- [ ] Performance issues: Verified with load testing

---

*Last Updated: 2026-02-15*
*Next Review: Weekly during sprint planning*
