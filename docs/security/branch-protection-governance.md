# Branch Protection Governance

## Secret Ownership

`BRANCH_PROTECTION_ADMIN_TOKEN` must be a dedicated bot/admin token, not a developer's personal day-to-day token.

Recommended owner:
- Account: a repository governance bot or durable admin service account.
- Access: limited to this repository where possible.
- Required capability: edit branch protection and read repository metadata.
- Storage: GitHub repository secret named `BRANCH_PROTECTION_ADMIN_TOKEN`.

## Rotation

Rotate the token at least every 90 days and immediately after any maintainer offboarding or suspected exposure.

Rotation procedure:
1. Create a replacement token from the bot/admin account.
2. Update the repository secret:
   ```powershell
   gh secret set BRANCH_PROTECTION_ADMIN_TOKEN --repo vasantsinghraji-byte/NOCTURAL
   ```
3. Run `Security Governance Protection Rollback` from `main`.
4. Confirm `main` and `develop` become bootstrap-safe.
5. Run `Security Governance Protection Bootstrap` from `main`.
6. Confirm `main` and `develop` return to fully enforced.
7. Revoke the previous token.

## Expected Fully Enforced State

Both `main` and `develop` must require:
- `Required Post-Deploy Render Smoke`
- `CODEOWNERS Security Governance Gate`
- `CodeQL Alert Gate`
- Code-owner reviews enabled

## Drift Audit

The `Security Governance Drift Audit` workflow runs monthly and can be run manually. It executes:

```bash
node scripts/manage-security-governance-protection.js --mode=status --branches=main,develop --fail-on-drift
```

If either branch is not fully enforced, the workflow opens or updates a GitHub issue and fails the run.
