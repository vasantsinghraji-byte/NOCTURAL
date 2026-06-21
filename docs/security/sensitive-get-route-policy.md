# Sensitive GET Route Policy

Sensitive identifiers must not be carried in GET route paths or query strings.
Use POST bodies or authenticated headers for patient IDs, access-token IDs,
reset tokens, refresh tokens, and health-data access identifiers.

## Enforced By

- `tests/helpers/sensitiveGetRouteScanner.js`
- `tests/unit/security/static-analysis.test.js`
- `tests/fixtures/security/sensitive-get-route-scanner.json`
- CI job: `Sensitive GET Route Gate`
- CI job: `CODEOWNERS Security Governance Gate`

The scanner currently blocks sensitive names such as:

- `patientId`
- `accessorId`
- `tokenId`
- `accessToken`
- `refreshToken`
- `resetToken`
- `healthToken`
- `qrToken`

It detects direct `req.query` reads, bracket notation, simple aliases such as
`const query = req.query`, and destructuring such as `const { patientId } = req.query`.

## Requesting An Allowlist Entry

Avoid allowlisting unless the URL is intentionally shareable and cannot be moved
to POST or headers. A new allowlist entry must include the following in the PR:

- Why the token or identifier must be in a GET URL.
- Whether the value is short-lived, one-time-use, or both.
- How referrer leakage is prevented.
- How access is audited.
- Rate limiting or abuse controls.
- Expiry and revocation behavior.

Update the allowlist in `tests/helpers/sensitiveGetRouteScanner.js` only after
documenting the justification in the PR checklist.

## Route Wrapper Support

If the project introduces helper wrappers around route registration, pass those
wrapper names through `tests/fixtures/security/sensitive-get-route-scanner.json`
and add a fixture test before using the wrapper broadly. Security-governance
files related to this policy are covered by `.github/CODEOWNERS` and validated
by `npm run validate:codeowners-security`.
