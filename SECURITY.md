# Security Policy

Nocturnal is a healthcare duty-shift platform that handles personal and health-related
data. We take security issues seriously and appreciate responsible disclosure.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, report privately through GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
for this repository (Security tab → "Report a vulnerability"). Maintainers must enable
this under **Settings → Code security and analysis → Private vulnerability reporting**.

When reporting, please include:

- A description of the vulnerability and its impact
- Steps to reproduce (proof-of-concept where possible)
- Affected component(s), endpoint(s), or file(s)
- Any suggested remediation

We aim to acknowledge reports within 3 business days and to provide a remediation
timeline after triage.

## Scope

In scope: authentication/authorization, tenant isolation, data exposure, injection,
secrets handling, and the backup/restore pipeline.

Out of scope: findings that require a compromised host, social engineering, or
denial-of-service via volumetric traffic.

## Handling of Secrets

- Never commit secrets (database URIs, JWT/encryption keys, cloud credentials). They
  belong in environment variables / the platform's secret store.
- `.env` is git-ignored; only `.env.example` (with placeholder values) is tracked.
- Demo/seed accounts are for local development only and must never exist on a deployed
  database.

## Security Engineering Policies

- Sensitive identifiers must not be added to GET route paths or query strings.
  See [Sensitive GET Route Policy](docs/security/sensitive-get-route-policy.md)
  for the enforced route-contract scanner, allowlist requirements, and PR
  justification checklist.
