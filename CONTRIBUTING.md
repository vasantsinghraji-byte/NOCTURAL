# Contributing

This repository uses a lightweight team workflow designed to keep changes traceable, reviewable, and safe to deploy.

## Branch Strategy

- `main`: production-ready history only
- `develop`: integration branch for approved work
- `feature/<ticket-or-scope>`: new features
- `fix/<ticket-or-scope>` or `bugfix/<ticket-or-scope>`: defects
- `hotfix/<ticket-or-scope>`: urgent production fixes
- `refactor/<ticket-or-scope>`: behavior-preserving cleanup
- `docs/<ticket-or-scope>`: documentation-only work
- `chore/<ticket-or-scope>`: tooling and maintenance
- `experiment/<ticket-or-scope>`: short-lived spikes that should not be merged casually

Direct pushes to `main` and `develop` are blocked by the local `pre-push` hook. Use a pull request instead.

## Commit Standard

Use focused, atomic commits with Conventional Commit prefixes:

- `feat: add provider booking filters`
- `fix(auth): handle expired sessions gracefully`
- `refactor: extract booking validation helpers`
- `docs: clarify deployment checklist`
- `chore(ci): cache Playwright browsers`
- `test: stabilize analytics contract fixtures`

Rules:

- One logical change per commit
- Keep subject lines short and descriptive
- Separate refactors from behavior changes when possible
- Avoid mixing feature work, bug fixes, and formatting in one commit

## Pull Request Workflow

1. Branch from `develop` for normal work or from `main` only for urgent production hotfixes.
2. Run the local verification checklist before pushing.
3. Open a pull request with a small, reviewable scope.
4. Link the issue, ticket, or incident that explains the change.
5. Document risk, rollback steps, and test evidence in the PR template.
6. Merge only after review and passing checks.

## Sync And Back-Merge Pull Requests

Pull requests that synchronize protected branches, such as `main` into `develop`, must use GitHub's **Create a merge commit** option. Never squash or rebase-merge a sync/back-merge PR.

Squashing copies the resulting files without preserving branch ancestry. This can make later `develop` into `main` pull requests show unrelated historical changes and can cause newer production files to appear as deletions.

After synchronizing `main` into `develop`, verify:

```bash
git fetch origin --prune
git merge-base --is-ancestor origin/main origin/develop
git diff --name-status origin/main..origin/develop
```

The ancestry command must succeed, and the diff must contain only intentional `develop` changes before merging `develop` into `main`.

## Render Deploy Queue Recovery

Render creates a separate auto-deploy for each new commit and can leave older deployments queued while newer commits reach `main`. Triggering a manual deployment does not cancel those queued deployments, so an older commit can later replace the manually deployed version.

Before manually deploying the production API:

1. List deployments and identify any queued or running deployment for an older commit.
2. Cancel stale deployments before deploying the current `main` commit.
3. Wait for the manual deployment to become live.
4. List deployments again and confirm no older deployment remains queued or running.
5. Probe `/api/v1/health` and confirm the expected runtime marker, such as `X-Request-Id`.

```bash
render deploys list <service-id> --output json
render deploys cancel <service-id> <stale-deploy-id> --confirm
render deploys create <service-id> --commit <main-commit-sha> --wait --confirm
curl -i https://nocturnal-api.onrender.com/api/v1/health
```

If a deployment reports `update_failed` without reaching checkout, build, or application startup logs, treat it as a Render platform/service-update failure rather than an application failure. Preserve the last healthy deployment, retry the exact current `main` commit after the queue is drained, and verify the live response.

## Local Verification Checklist

Run the smallest relevant set before every PR:

```bash
npm run lint
npm test
npm run test:deploy-gate
```

Recommended:

- Use `npm run verify:local` for the common lint-plus-test path
- Use `act pull_request -W .github/workflows/ci.yml` when you want to dry-run the main CI workflow locally
- Use `git fetch --prune` regularly to remove stale remote-tracking branches

## Frontend Formatting

For frontend display formatting, prefer the shared `AppFormat` helpers in `client/public/js/config.js` over ad hoc string formatting. See [docs/guides/frontend-conventions.md](docs/guides/frontend-conventions.md) for the short frontend conventions note.

- Use `AppFormat` for UI dates, date-time strings, percentages, hours, and currency displays
- When calling shared helpers from `client/public/js/utils.js`, keep them delegating to `AppFormat` rather than duplicating formatting logic
- Avoid new direct `.toFixed(...)`, `toLocaleDateString(...)`, or `toLocaleString(...)` calls in page scripts unless the formatting is genuinely one-off and cannot be expressed through `AppFormat`

## Validated Query Updates

For query-based writes that persist nested or user-controlled payloads, prefer the shared `VALIDATED_QUERY_UPDATE_OPTIONS` helper in `utils/queryUpdateOptions.js` over ad hoc `{ new, runValidators, context: 'query' }` objects.

- Use `VALIDATED_QUERY_UPDATE_OPTIONS` for `findByIdAndUpdate(...)` / `findOneAndUpdate(...)` when the update writes structured profile, clinical, payment, refund, or similar nested document data
- Keep lock or lease-style query updates scoped to their coordination needs instead of automatically applying the helper everywhere
- If a query update needs extra options such as `arrayFilters`, extend the shared helper with object spread rather than retyping the validator trio

## Hooks

Git hooks are stored in `.githooks` and are installed automatically by `npm install` through the `prepare` script.

Current safeguards:

- `pre-commit`: runs Gitleaks when available and blocks obvious secret leaks
- `commit-msg`: enforces structured commit messages
- `pre-push`: blocks direct pushes to protected branches and validates branch naming

Install Gitleaks for full local secret scanning:

```bash
# Windows
winget install --id Gitleaks.Gitleaks -e

# macOS
brew install gitleaks

# Linux with Homebrew
brew install gitleaks
```

After installing, restart your shell and verify:

```bash
gitleaks version
npm run hooks:install
```

To install hooks manually:

```bash
npm run hooks:install
```

## Secret History Cleanup

If a real `.env` or credential file is ever committed or pushed, rotate the exposed credentials first. Then verify whether Git history contains the file:

```bash
git fetch --all --tags --prune
git log --all --oneline -- .env
git rev-list --objects --all | grep -E '(^|/)\.env$|(^|/)\.env\.'
```

Only rewrite history after coordinating with the team and working from a fresh clone:

```bash
python -m pip install git-filter-repo
git filter-repo --path .env --invert-paths
git push origin --force-with-lease --all
git push origin --force-with-lease --tags
```

After a history rewrite, every developer must re-clone or hard-reset local branches to the rewritten remote history.

## GitHub Settings To Enforce

These are repository settings rather than code changes, but they should be enabled to complete the workflow:

- Protect `main` and `develop`
- Require pull requests before merge
- Require at least one reviewer for non-trivial changes
- Require status checks to pass before merge
- Restrict force-pushes on protected branches
- Auto-delete head branches after merge

## Branch Hygiene

- Rebase or merge from `develop` early when your branch drifts
- Resolve conflicts while the branch is small
- Close or delete stale branches after merge
- Prefer short-lived branches over long-running workstreams
