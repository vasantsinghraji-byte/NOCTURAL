# Merging workflow-touching Dependabot PRs

## The problem

Dependabot PRs that bump GitHub Actions modify files under `.github/workflows/`.
GitHub refuses to let an OAuth token **without the `workflow` scope** create or
update workflow files — so these PRs **cannot be merged from the `gh` CLI** with
the default user token (scopes `repo`, `read:org`, `gist`). They must be merged
in the **web UI** instead (a browser session isn't subject to that scope limit).

This is only friction if you want to merge such PRs via CLI/automation.

## Option A — refresh your personal `gh` token (quickest, per-user)

```bash
gh auth refresh -h github.com -s workflow
```

Follow the browser prompt. Afterwards `gh pr merge <n> --merge` works on
workflow-touching PRs. (Per-machine; each maintainer who merges via CLI needs it.)

## Option B — a GitHub App for automation (durable, recommended for CI)

Use this if a workflow/bot should merge these PRs unattended.

1. **Create the App** — GitHub → Settings → Developer settings → GitHub Apps →
   *New GitHub App*. Repository permissions:
   - **Contents: Read & write** (to merge)
   - **Pull requests: Read & write**
   - **Workflows: Read & write**  ← the key one; this is what the user token lacks
   - **Checks / Commit statuses: Read** (to gate on green CI)
2. **Install** it on this repo, and note the App ID + generate a private key.
3. **Store secrets** on the repo: `MERGE_APP_ID`, `MERGE_APP_PRIVATE_KEY`
   (the repo already uses this pattern for `BRANCH_PROTECTION_APP_*`).
4. **Mint a token in a workflow** with `actions/create-github-app-token`
   (already a dependency here) and merge with it, e.g.:

   ```yaml
   - uses: actions/create-github-app-token@v3
     id: app-token
     with:
       app-id: ${{ secrets.MERGE_APP_ID }}
       private-key: ${{ secrets.MERGE_APP_PRIVATE_KEY }}
   - run: gh pr merge "$PR" --merge
     env:
       GH_TOKEN: ${{ steps.app-token.outputs.token }}
   ```

   The App token carries the `workflow` permission, so the merge succeeds.

## Notes

- This only governs **merging**; Dependabot itself already has the rights to
  *open* workflow PRs.
- After grouping Actions updates (see `.github/dependabot.yml`) and ignoring
  Action majors, the volume of workflow-touching Dependabot PRs drops to ~one
  grouped minor/patch PR per week, so Option A is usually sufficient.

## Activating auto-merge for routine updates

`.github/workflows/dependabot-automerge.yml` will auto-merge **green
minor/patch** Dependabot PRs (majors are left for a human). It ships **dormant**
and only runs once all of the following are in place:

1. **Merge App** (Option B above) installed, with `MERGE_APP_ID` and
   `MERGE_APP_PRIVATE_KEY` secrets set.
2. **App added to `.github/CODEOWNERS`** (e.g. `* @your-merge-app[bot]` or a
   scoped entry) so the App's approval satisfies the required **code-owner
   review** — otherwise `--auto` merge waits indefinitely for a review.
3. **Repo variable** `DEPENDABOT_AUTOMERGE_ENABLED = true`
   (Settings → Secrets and variables → Actions → Variables). Until this is set,
   the workflow job is skipped on every run.

To pause auto-merge later, set the variable to anything other than `true` (or
delete it) — no need to remove the workflow.
