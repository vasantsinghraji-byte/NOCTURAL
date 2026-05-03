# NPM Audit Review

Reviewed: 2026-05-03

Command:

```bash
npm audit --omit=dev --json
```

Current production audit result after removing `pm2`, overriding `protobufjs`, and upgrading direct `file-type` usage:

- Critical: 0
- High: 0
- Moderate: 8
- Low: 2
- Total: 10

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

## Remaining Chains

### `@google-cloud/storage` transitives

Severity: low/moderate.

Chain:

```text
@google-cloud/storage -> retry-request -> teeny-request -> http-proxy-agent -> @tootallnate/once
@google-cloud/storage -> uuid
@google-cloud/storage -> gaxios -> uuid
```

Risk: GCS upload support pulls older request/UUID transitives. `npm audit` suggests a semver-major downgrade path to `@google-cloud/storage@5.20.4`, which is not acceptable without API testing.

Next action: test current `@google-cloud/storage` upgrade/override options in a branch with the GCS upload unit tests and one real signed/upload flow. Do not blindly apply the audit downgrade.

### AWS SDK XML Builder

Severity: moderate.

Chain:

```text
@aws-sdk/client-s3 -> @aws-sdk/core -> @aws-sdk/xml-builder -> fast-xml-parser
```

Risk: XML output escaping issue in `fast-xml-parser` through AWS SDK internals.

Next action: update AWS SDK packages together and rerun S3/GCS upload tests. Avoid partial SDK updates.

### `node-vault -> axios -> follow-redirects`

Severity: moderate.

Chain:

```text
node-vault -> axios -> follow-redirects
```

Risk: optional Vault integration pulls a vulnerable redirect dependency.

Next action: keep `node-vault` optional and only enable Vault in environments that require it. Review whether an npm override can safely bump `follow-redirects` without breaking `node-vault`.

## Priority Order

1. `@google-cloud/storage` transitives
2. AWS SDK XML builder
3. optional Vault redirect chain
