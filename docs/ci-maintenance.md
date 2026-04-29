# CI Maintenance Notes

## Required gates

The deploy-blocking GitHub Actions path now uses a narrow smoke suite through
`npm run test:ci`, plus lint, secret scanning, auth static analysis, deployment
gate validation, and a container smoke build.

## Legacy Jest cleanup

The historical Jest suite is now split into two groups:

- `npm run test:legacy:healthy` runs the repaired legacy suites and is a
  required CI gate.
- `npm run test:legacy:quarantine` runs the remaining stale suites and is
  reported by **Legacy Jest Quarantine (non-blocking)**.

Move suites from quarantine into the healthy gate as they are repaired. The
NoSQL sanitization helper suite has been repaired and promoted. The current
quarantine contains stale model suites that no longer match the active schemas
or take too long under CI MongoDB.

## Dependency audit follow-up

The dependency audit chains have been reviewed:

- `firebase-admin` was unused and removed.
- `file-type` was upgraded to the current ESM package, with a CommonJS helper
  wrapper used by upload middleware.
- `@google-cloud/storage` was removed from package dependencies because the app
  only loads it behind `USE_GCS=true`; production now fails fast if GCS is
  enabled without installing/configuring the package.
- `pm2` was removed from package dependencies because Render runs the container
  with direct `node server.js`. The `pm2:*` scripts remain as manual
  non-Render commands and require PM2 to be installed outside this package.

Both `npm audit` and `npm audit --omit=dev` now report zero vulnerabilities.
