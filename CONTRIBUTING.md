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

## Hooks

Git hooks are stored in `.githooks` and are installed automatically by `npm install` through the `prepare` script.

Current safeguards:

- `pre-commit`: blocks obvious secret leaks
- `commit-msg`: enforces structured commit messages
- `pre-push`: blocks direct pushes to protected branches and validates branch naming

To install hooks manually:

```bash
npm run hooks:install
```

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
