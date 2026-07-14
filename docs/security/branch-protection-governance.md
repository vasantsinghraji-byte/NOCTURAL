# Branch Protection Governance

## GitHub App Ownership

Branch-protection automation should authenticate as the dedicated GitHub App, not a developer's personal day-to-day token.

Required GitHub App repository permissions:
- `Administration`: read and write
- `Contents`: read-only
- `Metadata`: automatic

Required repository secrets:
- `BRANCH_PROTECTION_APP_ID`: the GitHub App ID.
- `BRANCH_PROTECTION_APP_PRIVATE_KEY`: the full downloaded PEM private key.

The GitHub App must also be installed on `vasantsinghraji-byte/NOCTURAL`. If the app is not installed, GitHub returns `404` when the workflow asks for a repository installation token.

The private key must look like a PEM block:

```text
-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----
```

A value that starts with `SHA256:` is only the key fingerprint. It is not enough for workflow authentication.

The workflows are GitHub App only. If `BRANCH_PROTECTION_APP_ID`, `BRANCH_PROTECTION_APP_PRIVATE_KEY`, or the app installation is missing, the governance workflows must fail instead of falling back to a personal or bot PAT.

## Rotation

Rotate the GitHub App private key at least every 90 days and immediately after any suspected exposure.

The `Security Governance Key Rotation Reminder` workflow runs quarterly and opens or updates a GitHub issue with the rotation checklist.

Rotation procedure:
1. Generate a new private key from the GitHub App settings page.
2. Update the repository secret with the full PEM contents:
   ```powershell
   gh secret set BRANCH_PROTECTION_APP_PRIVATE_KEY --repo vasantsinghraji-byte/NOCTURAL
   ```
3. Run `Security Governance Protection Rollback` from `main`.
4. Confirm `main` and `develop` become bootstrap-safe.
5. Run `Security Governance Protection Bootstrap` from `main`.
6. Confirm `main` and `develop` return to fully enforced.
7. Run `Security Governance Drift Audit` from `main`.
8. Delete the previous private key from the GitHub App settings page.

## Expected Fully Enforced State

Both `main` and `develop` must require:
- `CODEOWNERS Security Governance Gate`
- `CodeQL Alert Gate`
- Code-owner reviews enabled

`Post-Deploy Render Smoke` is intentionally not a required pull-request check.
It validates the already-deployed production environment after successful main
CI, on a schedule, through Render dispatch, or manually. This keeps production
monitoring actionable without allowing an existing outage to block unrelated
source changes.

## Drift Audit

The `Security Governance Drift Audit` workflow runs monthly and can be run manually. It executes:

```bash
node scripts/manage-security-governance-protection.js --mode=status --branches=main,develop --fail-on-drift
```

If either branch is not fully enforced, the workflow opens or updates a GitHub issue and fails the run.
