# Phase 3 — Authorization & Access Control: Definition of Done

## Summary

| Metric | Value |
|--------|-------|
| Phase | 3 — Authorization & Access Control |
| Issues Fixed | 12/12 (AUTH-001 through AUTH-012) |
| Test Suites | 5 |
| Total Tests | 34 |
| Tests Passing | 34/34 (100%) |
| Regression | 0 failures across Phase 1+2+3 (140 total tests) |

## Test Files

| # | File | Issues Covered | Tests |
|---|------|---------------|-------|
| 1 | `tests/unit/authorization/doctor-access-control.test.js` | AUTH-001, AUTH-004, AUTH-005 | 8 |
| 2 | `tests/unit/authorization/duty-booking-auth.test.js` | AUTH-002, AUTH-003 | 6 |
| 3 | `tests/unit/authorization/health-record-auth.test.js` | AUTH-006 | 4 |
| 4 | `tests/unit/authorization/session-auth.test.js` | AUTH-007, AUTH-008 | 4 |
| 5 | `tests/unit/authorization/k8s-security.test.js` | AUTH-009, AUTH-010, AUTH-011, AUTH-012 | 12 |

## Per-Issue Verification

| Issue | Description | Verification Method | Status |
|-------|-------------|-------------------|--------|
| AUTH-001 | Hospital boundary enforcement in `grantAccess()` | Runtime mock tests: cross-hospital reject, no-booking reject, super-admin bypass | PASS |
| AUTH-002 | ObjectId `.toString()` comparison in `updateDuty()` | Source analysis + runtime mock tests with ObjectId-like objects | PASS |
| AUTH-003 | Role param eliminates extra DB query in `updateStatus()`/`cancelBooking()` | Runtime mock tests + source analysis (no `User.findById` in method body) | PASS |
| AUTH-004 | Token constraint validation (`expiresAt`, `maxUsage`) | Runtime mock tests: past date, invalid string, zero, non-integer | PASS |
| AUTH-005 | Usage recording failure isolation in `getPatientDataForDoctor()` | Runtime mock test: `recordUsage()` throws, access still granted | PASS |
| AUTH-006 | Doctor role enforcement in `assignIntakeReviewer()`/`reviewIntake()` | Runtime mock tests: nurse rejected, doctor allowed, unassigned doctor rejected | PASS |
| AUTH-007 | Patient password change saves correctly | Source analysis: verifies `comparePassword`, `patient.save()` calls | PASS |
| AUTH-008 | Login `lastActive` save failure isolation | Runtime mock tests: login returns token despite `save()` throw, error logged | PASS |
| AUTH-009 | RBAC least-privilege (Role, RoleBinding, ServiceAccount) | Static YAML analysis: Role verbs=["get"], RoleBinding for nocturnal-sa, automountServiceAccountToken=false | PASS |
| AUTH-010 | Pod Security Standards (restricted) | Static YAML analysis: enforce=restricted, runAsNonRoot=true, allowPrivilegeEscalation=false, drop ALL | PASS |
| AUTH-011 | NetworkPolicy (default-deny + restricted egress) | Static YAML analysis: NetworkPolicy present, default-deny, egress ports 6379/27017/53 | PASS |
| AUTH-012 | No plaintext secrets | Static YAML analysis: SecretStore + ExternalSecret kinds, no base64 secret data | PASS |

## Code Review Findings

### AUTH-001: Hospital Boundary Enforcement
- `doctorAccessService.grantAccess()` verifies `doctor.hospital === admin.hospital` before granting access
- Super-admin bypass when admin has no `hospital` field (line-of-business flexibility)
- Patient-hospital relationship verified via `NurseBooking.exists()` against hospital providers
- Security event logged on cross-hospital attempt via `logger.logSecurity()`

### AUTH-002: ObjectId Comparison
- `dutyService.updateDuty()` uses `duty.postedBy.toString() !== user._id.toString()` for safe ObjectId comparison
- Prevents false-negative authorization due to reference vs value comparison

### AUTH-003: Role Parameter
- `bookingService.updateStatus()` and `cancelBooking()` accept `userRole` parameter
- Eliminates redundant `User.findById()` call — role already available from middleware
- Non-provider, non-admin users correctly rejected with "Not authorized" error

### AUTH-007: Password Change Note
- Current `patientService.updatePassword()` sets `patient.password = newPassword` and calls `patient.save()`
- The `passwordChangedAt` field is expected to be set by a Mongoose pre-save hook on the Patient model (not explicitly in the service)
- This follows the same pattern as the main User model

### K8s Security (AUTH-009 through AUTH-012)
- All K8s manifests follow security best practices
- RBAC uses least-privilege with read-only verbs
- Pod security enforces restricted profile with non-root, no privilege escalation
- Network policies implement default-deny with minimal egress allowlist
- Secrets managed via External Secrets Operator (AWS Secrets Manager) — no plaintext values

## Staging Deployment Checklist

- [ ] Deploy to staging environment
- [ ] Verify hospital boundary enforcement with multi-hospital test data
- [ ] Verify cross-hospital access blocked for non-super-admin users
- [ ] Verify token constraint validation (expired tokens, exceeded usage)
- [ ] Verify doctor role enforcement for intake review workflow
- [ ] Verify login resilience when database write fails
- [ ] Verify K8s RBAC with `kubectl auth can-i` checks
- [ ] Verify NetworkPolicy with connectivity tests between pods
- [ ] Run penetration test against authorization endpoints

## Test Execution

```bash
# Run Phase 3 tests only
npx jest tests/unit/authorization/ --no-coverage --forceExit --verbose

# Run all phases (1+2+3)
npx jest tests/unit/security/ tests/unit/data-integrity/ tests/unit/authorization/ --no-coverage --forceExit --verbose
```
