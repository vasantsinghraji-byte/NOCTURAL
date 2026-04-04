# Phase 1: Critical Security — Definition of Done Plan

## Deliverables

### 1. Unit Test Files (5 files)

#### `tests/unit/security/hardcoded-secrets.test.js`
**Covers:** SEC-001 to SEC-012 (all 12 hardcoded secrets issues)
- Static analysis tests: grep source files for known leaked patterns
- Verify no hardcoded passwords remain (`NocturnalAdmin2025`, `DevPass2025`, `ProdPass2025`, `changeme`, `admin123`, `redis123`, `rzp_test_YOUR_KEY_HERE`)
- Verify MongoDB init scripts use env var references (`process.env.MONGO_*`)
- Verify CI workflows use `${{ secrets.* }}` not inline values
- Verify docker-compose files use `${VAR}` syntax, not plaintext
- Verify k8s secrets.yaml has base64-encoded placeholders
- Verify paymentService.js throws on missing credentials (no fallback)

#### `tests/unit/security/payment-security.test.js`
**Covers:** PAY-001 to PAY-003 (payment security)
- PAY-001: Amount re-verification test — mock Razorpay payment fetch, verify mismatched amount is rejected
- PAY-001: Currency mismatch rejection
- PAY-002: Idempotency — duplicate order creation returns existing pending order
- PAY-002: Atomic locking — concurrent order creation blocked via `findOneAndUpdate` pattern
- PAY-003: Refund transaction wrapper — mock mongoose session, verify `startSession()/startTransaction()/commitTransaction()/abortTransaction()` flow
- Test booking ownership verification
- Test signature verification logic

#### `tests/unit/security/auth-middleware.test.js`
**Covers:** SEC-001 (JWT validation), SEC-002 (token expiry), SEC-014 (error handling)
- Valid token → attaches user to req
- Missing token → 401
- Invalid/tampered JWT signature → 401 "Invalid token"
- Expired token → 401 "Token expired"
- Password changed after token issued → 401
- Inactive user → 401 "Account deactivated"
- Role authorization: valid role → next(), invalid role → 403
- No user in request → 401
- Role not in allowed list → 403 with role disclosure
- Token expiry is 7d (not 30d)

#### `tests/unit/security/data-mutation.test.js`
**Covers:** SEC-013 (field whitelist), SEC-014 (stack trace hiding)
- SEC-013: Patient update with allowed field → accepted
- SEC-013: Patient update with `role` field → rejected/ignored
- SEC-013: Patient update with `password` field → rejected/ignored
- SEC-013: Patient update with `isAdmin` field → rejected/ignored
- SEC-013: Only whitelisted fields applied (name, dateOfBirth, gender, bloodGroup, profilePhoto, address, emergencyContact, insurance, preferences)
- SEC-014: Error response in production mode → no stack trace
- SEC-014: Error response in development mode → has stack trace (if applicable)

#### `tests/unit/security/infrastructure-security.test.js`
**Covers:** SEC-015 to SEC-019 (infra security)
- SEC-015: docker-compose.logging.yml has `xpack.security.enabled=true`
- SEC-016: Grafana credentials use env vars, not `admin/admin`
- SEC-017: Logstash ports restricted to internal network
- SEC-018: Filebeat user is not root
- SEC-019: CORS config → production/staging with no ALLOWED_ORIGINS → returns empty array (not localhost)
- SEC-019: CORS config → development → allows localhost:3000
- SEC-019: CORS config → with ALLOWED_ORIGINS set → uses provided origins

### 2. Integration Test File (1 file)

#### `tests/integration/security/auth-flow.test.js`
- Full authentication flow: register → login → access protected route → token expired → re-login
- Role-based access: admin-only route with doctor token → 403
- Sanitization middleware integration: XSS payload in request body → stripped
- Rate limiting integration (if testable)

### 3. DoD Report Document

#### `docs/PHASE1_DEFINITION_OF_DONE.md`
Structured report covering all 22 issues:

```
# Phase 1: Critical Security — Definition of Done Report

## Summary
- 22/22 issues: code fixes implemented
- X/22 issues: unit tests passing
- Code review: self-reviewed, findings documented
- Staging deployment: checklist provided
- Penetration testing: recommendations documented

## Per-Issue Status Table
| # | Code Fix | Unit Test | Review | Staging | Pen Test |
...

## 1. Unit Test Results
- Test file locations
- Coverage metrics (per file)
- Pass/fail summary

## 2. Code Review Findings
- Per-subsection review notes
- Security patterns verified
- Edge cases identified

## 3. Staging Deployment Checklist
- [ ] Environment variables configured
- [ ] Secrets rotated from defaults
- [ ] Docker images rebuilt
- [ ] Database migrations applied
- [ ] Smoke tests passed

## 4. Penetration Testing Recommendations
- JWT attack surface (algorithm confusion, none algorithm)
- NoSQL injection vectors to test
- Payment tampering scenarios
- CORS bypass attempts
- Rate limit bypass strategies

## 5. Load Testing Recommendations
- Auth endpoint under load
- Payment verification concurrency
- Rate limiter behavior under DDoS
```

### 4. Bug Tracker Updates
- Update Phase 1 verification status from "pending" to detailed DoD status
- Add test file references to each issue row

## Implementation Order

1. **Auth middleware tests** — most critical, tests JWT/RBAC
2. **Payment security tests** — tests amount verification, idempotency, refunds
3. **Data mutation tests** — tests field whitelist, error hiding
4. **Hardcoded secrets tests** — static analysis, file scanning
5. **Infrastructure security tests** — config file verification, CORS
6. **Integration tests** — end-to-end auth flow
7. **DoD report document** — compile results
8. **Bug tracker update** — final tracker edits

## Notes
- `paymentService.js` requires mocking at module level because it throws on missing RAZORPAY env vars at import time. Will use `jest.mock()` to mock Razorpay constructor.
- `encryption.js` references `logger` which isn't imported in the file (bug) — tests should account for this.
- Auth tests will mock `User.findById` to avoid needing MongoDB connection.
- Docker/k8s/CI file tests use `fs.readFileSync` for static analysis — no runtime dependencies.
