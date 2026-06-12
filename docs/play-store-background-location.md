# Google Play Background Location Submission

## Feature justification

Nocturnal uses background location only when a patient-care provider explicitly
starts tracking for an active care visit or duty workflow.

Core purposes:

- Verify arrival at an assigned care visit or duty location.
- Support active-duty safety and care coordination.
- Maintain location continuity when the app is closed or not in use.

Tracking is not enabled by default. Before Android requests permission, the app
shows a prominent disclosure explaining collection, use while closed, purpose,
and how to stop it. The app verifies that the user selected "Allow all the
time" before starting. A persistent Android notification is shown while tracking.

## Play Console declaration text

> Nocturnal collects precise location while the app is closed or not in use
> only after a user explicitly starts tracking for an active care visit or duty
> workflow. Background location supports arrival verification, active-duty
> safety, and care coordination. Tracking displays a persistent notification and
> continues until the user stops it. Nocturnal does not sell location data.

## Review video checklist

Record a short video showing:

1. Login to a provider account.
2. Start an active care visit or duty workflow.
3. Open the background-tracking action.
4. Show the prominent disclosure before Android permission prompts.
5. Accept permission and show the persistent tracking notification.
6. Put the app in the background and demonstrate the active workflow.
7. Return to the app and stop tracking.

## Submission checklist

- Publish the privacy policy containing the Location Data section.
- Complete Play Console App Content > Background location permissions.
- Upload the review video and provide reviewer login credentials.
- Explain why foreground-only location cannot provide continuity during an
  active visit when the app is closed.
- Confirm the store listing describes the active-care tracking feature.
- Confirm data safety answers disclose precise location collection.

Google Play approval is performed by Google and cannot be completed from the
repository.
