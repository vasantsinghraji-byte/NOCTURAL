# WebAuthn Lost-Device Recovery Runbook

## Scope

Users with enrolled passkeys can recover password-change access using one-time recovery codes.

## Operator Checks

1. Confirm the requester can authenticate with their password before using recovery-code flows.
2. Confirm recovery-code attempts are not being brute-forced.
3. Check whether passkeys were revoked by `POST /api/v1/webauthn/lost-device/recover`.
4. Confirm new passkeys are enrolled after recovery.

## User Guidance

1. Use one unused recovery code from the most recent batch.
2. Complete lost-device recovery, which revokes existing passkeys by default.
3. Change password if needed.
4. Enroll a new passkey and generate a new recovery-code batch.

## Escalation

- Escalate to security on-call for repeated invalid recovery-code attempts.
- Require manual identity verification if the user has no passkey and no recovery codes.
