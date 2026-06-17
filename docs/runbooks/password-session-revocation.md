# Password Session Revocation Runbook

## Alert

- `PasswordChangeRevokedZeroSessions`

## Severity

Warning. Escalate to security if repeated for the same account or during active account-takeover investigation.

## First Checks

1. Confirm whether the account had any active refresh sessions before password change.
2. Check refresh-session write errors and MongoDB transaction errors.
3. Inspect audit logs for password change, session revocation, token reuse, and WebAuthn/recovery-code events.
4. Verify `sessionVersion` incremented on the account.

## Recovery

1. If revocation failed, revoke all refresh sessions for the affected identity.
2. Force reauthentication by incrementing `sessionVersion`.
3. Confirm old refresh tokens are rejected.
4. Confirm the password-change notification outbox row completed.

## Escalation

- Page security on-call if a stolen session may remain active.
- Page platform on-call if MongoDB transactions or refresh-session writes are failing.
