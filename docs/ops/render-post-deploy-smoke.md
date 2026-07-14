# Post-Deploy Render Smoke

The `Render Smoke` workflow (`.github/workflows/render-smoke.yml`) verifies the
**deployed** instance (auth/CORS contract, service-worker cache headers, CSP).

## Why a webhook is needed

Render runs **auto-deploy outside GitHub Actions**, so there is no GitHub
`Deploy` workflow run to chain off. The `workflow_run` fallback waits after
successful `main` CI, but the Render webhook is the authoritative way to run the
smoke **after** the new build is live. The workflow intentionally does not run
on pull requests: existing production health must not block unrelated changes.

## One-time setup

1. Create a GitHub **fine-grained PAT** with `Contents: read` + `Actions: write`
   (or a classic token with `repo`) and store it where Render can use it.
2. In the Render dashboard for the web service → **Settings → Deploy Hooks /
   Notifications**, add a webhook (or a "Deploy succeeded" notification) that
   POSTs to the GitHub repository_dispatch API:

   ```
   POST https://api.github.com/repos/vasantsinghraji-byte/NOCTURAL/dispatches
   Authorization: Bearer <PAT>
   Accept: application/vnd.github+json
   Body: {"event_type":"render-deploy-succeeded"}
   ```

   If Render's notification body isn't customizable, use a tiny relay (a Render
   "Deploy hook" → a small function/Cloudflare Worker that forwards to the
   dispatch endpoint).

3. Confirm the repo variables point at production:
   - `RENDER_SMOKE_BASE_URL = https://nocturnal-api.onrender.com`
   - `RENDER_SMOKE_ORIGINS  = https://nocturnal-frontend-208z.onrender.com,https://nocturnal-api.onrender.com`

   `RENDER_SMOKE_ORIGINS` is comma-separated. Keep both the canonical frontend
   and API origins so the deployed login/register contract is exercised for
   cross-origin browser traffic and the API service origin.

## Manual run

Until the webhook is wired, trigger it manually (defaults already target prod):

```
gh workflow run render-smoke.yml --ref main \
  -f deployed_base_url=https://nocturnal-api.onrender.com \
  -f origin=https://nocturnal-frontend-208z.onrender.com,https://nocturnal-api.onrender.com
```

## Residue-free production verification

When manually verifying a deploy (e.g. "registration/login work"), **do not use
`POST /api/v1/auth/register`** — those accounts are permanent and must be deleted
by hand. Instead use the staging smoke endpoint, which mints a short-lived account
that **auto-expires via the existing TTL index** on `User.smokeTestExpiresAt`
(`models/user.js`) and can be revoked immediately:

```
# enable the gated test API (temporarily) and set a secret on the service:
#   ENABLE_STAGING_TEST_APIS=true   STAGING_TEST_API_SECRET=<secret>

# create a short-lived account (auto-expires; default TTL via the service)
curl -X POST https://noctural.onrender.com/api/v1/staging/webauthn-smoke/accounts \
  -H "x-staging-test-secret: <secret>"

# revoke it immediately when done
curl -X DELETE https://noctural.onrender.com/api/v1/staging/webauthn-smoke/accounts/<accountId> \
  -H "x-staging-test-secret: <secret>"
```

MongoDB's TTL monitor removes any expired account within ~60s, so even an
un-revoked account leaves no lasting residue. Regular users (no
`smokeTestExpiresAt`) are never affected.
