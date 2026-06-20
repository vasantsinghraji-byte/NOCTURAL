# Security Notification Outbox Runbook

## Alerts

- `SecurityNotificationDeliveryFailures`
- `SecurityNotificationOutboxDeadLetters`

## Severity

- Delivery failures are `warning`.
- Dead letters are `critical` and page security plus platform on-call.

## First Checks

1. Check email, push, and webhook provider status.
2. Inspect `nocturnal_security_notification_outbox_failures_total` and `nocturnal_security_notification_outbox_dead_letters`.
3. Query recent `securitynotificationoutboxes` rows with `status` in `RETRY_PENDING`, `PROCESSING`, or `DEAD_LETTER`.
4. Confirm `ENCRYPTION_KEY` is configured and unchanged across all API and worker instances.

## Recovery

1. Fix provider credentials, network egress, DNS, or provider outage first.
2. For `RETRY_PENDING`, let the worker retry automatically.
3. For `DEAD_LETTER`, inspect `lastError`, confirm the account target is valid, then reset to `RETRY_PENDING` with a fresh `nextAttemptAt`.
4. Confirm a notification row exists with `metadata.outboxId` after successful replay.

## Escalation

- Page security on-call immediately for dead letters involving password changes.
- Escalate to platform on-call if provider health is normal but decryption or database writes fail.
- Escalate to the incident commander if security alerts remain undelivered for more than 30 minutes.
