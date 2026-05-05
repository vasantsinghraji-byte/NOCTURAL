# NPM Audit Review

Reviewed: 2026-05-05

Command:

```bash
npm audit --omit=dev --json
```

Current production audit result after removing `pm2`, overriding `protobufjs`, upgrading direct `file-type` usage, updating AWS SDK packages, removing the unused Render GCS dependency, and overriding Axios redirect transitives:

- Critical: 0
- High: 0
- Moderate: 0
- Low: 0
- Total: 0

## Resolved In This Pass

### `pm2`

Status: removed from `dependencies`.

Reason: Render runs the application directly with `node server.js`. PM2 remains a manual/non-Render operating option through the existing `npm run pm2:*` scripts, which expect PM2 to be installed globally on machines that use that deployment mode.

Impact: removes the direct PM2 ReDoS advisory and its transitive `basic-ftp` high advisory from the production dependency audit.

### `winston-loki -> protobufjs`

Status: fixed with an npm override to `protobufjs@7.5.5`.

Reason: `winston-loki@6.1.3` accepts `protobufjs@^7.2.4`, so the patched version satisfies the existing transport without replacing Loki logging.

Chain:

```text
winston-loki@6.1.3 -> protobufjs@7.5.5
```

Verification: `npm ls protobufjs --omit=dev` shows `protobufjs@7.5.5 overridden`, and `npm audit --omit=dev --json` no longer reports a critical `protobufjs` advisory.

### `file-type`

Status: fixed for direct app usage by upgrading to `file-type@22.0.1`.

Reason: direct upload validation previously used `file-type@16.5.4`, which was in the vulnerable `>=13.0.0 <21.3.1` range. The app now imports the ESM-only package through a CommonJS compatibility wrapper.

Usage:

```text
utils/fileTypeDetector.js
middleware/upload.js
middleware/uploadEnhanced.js
utils/uploadMagicByteValidator.js
```

Verification: focused upload tests cover the wrapper contract and GCS magic-byte validation. A runtime Node smoke verified that `file-type@22` detects PDF, PNG, and JPEG signatures through the wrapper.

### `@google-cloud/storage` transitives

Status: removed from installed production dependencies.

Reason: Render currently uses local storage unless `USE_GCS=true` and `GCS_BUCKET` are explicitly configured. The GCS client is only loaded through a guarded runtime `require()` in `config/storage.js`, so keeping `@google-cloud/storage` installed by default pulled a vulnerable audit chain into Render even when GCS was disabled.

Impact: removes the `@google-cloud/storage -> teeny-request/http-proxy-agent/uuid` audit chain from the production dependency graph. If GCS is enabled later, add the storage SDK back deliberately and retest the upload path at that time.

### AWS SDK XML Builder

Status: fixed by updating direct AWS SDK packages together.

```text
@aws-sdk/client-s3@3.1042.0 -> @aws-sdk/xml-builder@3.972.22 -> fast-xml-parser@5.7.2
```

Reason: the previous AWS SDK chain resolved `fast-xml-parser` below the patched audit range. Updating `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` together keeps the S3 stack aligned and resolves `fast-xml-parser` to a patched version.

### `node-vault -> axios -> follow-redirects`

Status: fixed with npm overrides.

```text
node-vault@0.10.10 -> axios@1.16.0 -> follow-redirects@1.16.0
razorpay@2.9.6 -> axios@1.16.0 -> follow-redirects@1.16.0
```

Reason: `node-vault` is optional, but its Axios chain is still installed when optional dependencies are included. Overriding both Axios and `follow-redirects` keeps the optional Vault path and Razorpay path on patched redirect/client packages.

## Verification

```text
npm audit --omit=dev --json
npm ls @aws-sdk/client-s3 @aws-sdk/s3-request-presigner fast-xml-parser axios follow-redirects node-vault --omit=dev
```

Result: production audit reports 0 vulnerabilities.

## Client Tooling Audit

Reviewed separately because the root production audit is clean and the client package is a build/dev-tooling package.

Commands:

```bash
npm --prefix client audit --omit=dev --json
npm --prefix client audit --json
```

Current client production audit result:

- Critical: 0
- High: 0
- Moderate: 0
- Low: 0
- Total: 0

Current full client audit result, including dev dependencies:

- Critical: 0
- High: 15
- Moderate: 11
- Low: 2
- Total: 28

Assessment: the remaining client findings are in development/build tooling, not in the deployed Node production dependency graph. The largest chains are `serialize-javascript` through webpack minimizer/copy plugins, `live-server -> chokidar`, `webpack-dev-server -> sockjs`, and direct or transitive build packages such as `webpack`, `postcss`, `svgo`, `ajv`, and `follow-redirects`.

Next cleanup should update or remove the unused client dev-server/build dependencies in controlled groups, then rerun the production frontend build and CSP deployment gate. Do not use a broad forced audit fix without reviewing webpack plugin major-version changes, because that could break the existing static build pipeline.
