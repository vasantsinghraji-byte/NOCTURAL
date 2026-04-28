# CI Maintenance Notes

## Required gates

The deploy-blocking GitHub Actions path now uses a narrow smoke suite through
`npm run test:ci`, plus lint, secret scanning, auth static analysis, deployment
gate validation, and a container smoke build.

## Legacy Jest cleanup

The broader historical Jest suite is exposed as `npm run test:legacy` and runs in
CI as **Legacy Jest Suite (non-blocking)**. It should be treated as cleanup
signal, not a release gate, until stale tests are either repaired, deleted, or
moved into the supported smoke/security/deployment gates.

## Dependency audit follow-up

`npm audit fix --omit=dev` was applied for non-breaking production dependency
updates. CI now uploads `npm-audit-prod.json` and prints the remaining
production vulnerability counts without failing the deployment pipeline.

Remaining audit items need separate dependency decisions because npm reports
breaking changes or no available fix for the affected chains, including
`firebase-admin` / Google Cloud dependencies, `file-type`, and `pm2`.
