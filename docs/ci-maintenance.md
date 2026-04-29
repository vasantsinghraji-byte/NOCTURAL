# CI Maintenance Notes

## Required gates

The deploy-blocking GitHub Actions path now uses a narrow smoke suite through
`npm run test:ci`, plus lint, secret scanning, auth static analysis, deployment
gate validation, and a container smoke build.

## Legacy Jest cleanup

The historical Jest suite has been repaired and moved back into the required
CI path:

- `npm run test:legacy:healthy` runs the repaired legacy suites, excluding only
  the dedicated frontend smoke suite that already runs through `test:ci`.
- `npm run test:legacy:quarantine` is currently a no-op placeholder reported by
  **Legacy Jest Quarantine (non-blocking)** so future stale suites can be parked
  deliberately without changing the workflow shape.

Keep new or repaired suites in the healthy gate by default. Only move a suite
into quarantine when it is known-stale, non-deploy-blocking, and has a follow-up
owner to repair it.

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
