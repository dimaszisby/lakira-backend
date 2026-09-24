# GitHub Branch Protection Settings

**Last updated:** 2026-08-30
**Context:** Solo developer project — rules focus on CI gates and accidental self-destruction prevention, not team review workflows.
**Verification:** the tables below were read back from the live API on 2026-08-30, not written from intent. Re-check with the command in [Verifying this document](#verifying-this-document).

---

> [!WARNING]
> **`main` is severed from the promotion chain.** It holds exactly one commit
> (`2fc7944 "Initial commit"`, 2025-01-21) and one file (`LICENSE`), and shares **no
> common ancestor** with `staging` or `dev` — the repo has two unrelated root commits.
> `GET /repos/:owner/:repo/compare/main...staging` returns `404 No common ancestor`, so a
> `staging → main` PR **cannot be opened**.
>
> Consequences: the `main (release gate)` ruleset has never been exercised;
> `deploy_production` (`if: github.ref == 'refs/heads/main'`) has never deployed real code;
> and `main`, being the default branch, is what the GitHub landing page shows.
>
> `dev → staging` is healthy (merge-base `6490bf1`). Only the top of the chain is broken.
> See [Reconnecting `main`](#reconnecting-main).

---

## Branch Hierarchy

```
feature-branch → dev → staging → main
```

All changes must flow in this direction. Never PR directly into `staging` or `main` from a non-dev branch. If a hotfix lands directly on `staging`, cherry-pick it back to `dev` immediately to prevent divergence.

---

## Rulesets

All three are **Active** with an **empty bypass list** — the rules apply to the repo owner too.

### `dev` — integration gate

| Rule                             | Setting                                                    | Why                                                                                                                         |
| -------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Require linear history           | ON                                                         | Feature branches are squashed in — keeps dev history clean                                                                  |
| Allowed merge methods            | Squash                                                     | Squash only, as of 2026-08-30 — see [merge methods](#key-design-decision-squash-for-featuredev-merge-commit-for-promotions) |
| Require a pull request           | ON                                                         | Ensures CI runs before anything lands on dev                                                                                |
| Required approvals               | 0                                                          | Solo dev — [see rationale](#solo-developer-rationale)                                                                       |
| Require conversation resolution  | ON                                                         | Unresolved review threads block the merge                                                                                   |
| Extra approval, unattributed PRs | ON (inert)                                                 | No-op at 0 approvals — [see rationale](#solo-developer-rationale)                                                           |
| Required CI checks               | Lint & Typecheck, Unit & Integration Tests, contract_local | [Two more are pending](#pending-changes)                                                                                    |
| Require branches up to date      | OFF                                                        | Would serialise every merge; `dev` favours throughput                                                                       |
| Restrict deletions               | ON                                                         | `dev` cannot be deleted                                                                                                     |
| Block force pushes               | ON                                                         | Prevents accidental history rewrites                                                                                        |
| Require signed commits           | OFF                                                        | [See rationale](#solo-developer-rationale)                                                                                  |

### `staging` — promotion gate

| Rule                             | Setting                                                    | Why                                                                                       |
| -------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Require linear history**       | **OFF**                                                    | Must be OFF — merge commits are required for promotion branches to preserve git ancestry  |
| **Allowed merge methods**        | **Merge commit**                                           | Preserves shared history between dev and staging; prevents conflicts on future promotions |
| Require a pull request           | ON                                                         | Audit trail for every promotion                                                           |
| Required approvals               | 0                                                          | Solo dev — [see rationale](#solo-developer-rationale)                                     |
| Require conversation resolution  | ON                                                         |                                                                                           |
| Extra approval, unattributed PRs | ON (inert)                                                 | No-op at 0 approvals                                                                      |
| Required CI checks               | Lint & Typecheck, Unit & Integration Tests, contract_local | Same gate as dev                                                                          |
| Require branches up to date      | OFF                                                        |                                                                                           |
| Restrict deletions               | ON                                                         |                                                                                           |
| Block force pushes               | ON                                                         |                                                                                           |
| Require signed commits           | OFF                                                        |                                                                                           |

### `main` — release gate

Currently unexercised — see the warning at the top of this document.

| Rule                             | Setting                                                    | Why                                                                  |
| -------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| Require linear history           | OFF                                                        | Same reason as staging — merge commits needed                        |
| Allowed merge methods            | Merge commit                                               | Preserves ancestry from staging                                      |
| Require a pull request           | ON                                                         |                                                                      |
| Required approvals               | 0                                                          | Solo dev — 1 approval would permanently block self-merges            |
| Require conversation resolution  | ON                                                         |                                                                      |
| Extra approval, unattributed PRs | ON (inert)                                                 | No-op at 0 approvals                                                 |
| Required CI checks               | Lint & Typecheck, Unit & Integration Tests, contract_local |                                                                      |
| Require branches up to date      | ON                                                         | Ensures main always tests against latest                             |
| Restrict deletions               | ON                                                         |                                                                      |
| Block force pushes               | ON                                                         |                                                                      |
| Require signed commits           | ON                                                         | Narrower than it sounds — [see rationale](#solo-developer-rationale) |

### Stale ruleset

Ruleset `11838021`, **"Protect main & develop (contract gate)"**, is present but **disabled**. It predates the three above and targets a `develop` branch that does not exist. Safe to delete; kept only because deleting it is not urgent.

---

## Solo-developer rationale

These settings look like gaps in a team repo and are deliberate here. Lakira FE and BE are developed and maintained by one person; this section exists so audits stop re-flagging them.

**Required approvals: 0 on all three branches.** A non-zero count would permanently block self-merges — GitHub does not let you approve your own PR. The CI gates, not review, are the real quality bar. Revisit if a second maintainer joins.

**Extra approval for unattributed Copilot PRs: ON but inert.** GitHub applies this only "if a non-zero approval count is required", so at 0 approvals it does nothing. Left enabled deliberately: it costs nothing and starts working automatically if the approval count is ever raised.

**Signed commits: OFF on `dev` and `staging`.** Local signing setup is overhead that buys little when one person holds the only key.

**Signed commits: ON for `main` — but understand what it buys.** All authoring happens on feature branches and enters at `dev`, unsigned. A `staging → main` merge commit is created and signed by _GitHub's_ key, not the author's. So the rule attests to GitHub's key on one merge commit while every authored commit beneath it is unsigned. Its real value is narrow but genuine: it blocks unsigned **direct pushes** to `main`. It is not "the release branch is signed".

---

## Key Design Decision: Squash for feature→dev, Merge commit for promotions

**Feature branches → dev:** Use squash. Condenses 10 WIP commits into 1 clean commit on dev. Linear history stays readable.

**dev → staging → main:** Use merge commit. This is critical — squash merge on a promotion branch erases the shared git ancestry between the two branches. Every subsequent promotion PR will show conflicts on all files that differ, even if the content is identical. Merge commits preserve the ancestry so git knows exactly what's already been merged.

**The symptom of getting this wrong:** Every `dev → staging` PR shows conflicts on docs files even though nothing actually changed. Requires a `conflict/` temp branch workaround for every single promotion. This was the original problem with the GPT-5.3-generated setup.

### Why `Rebase` was removed from `dev` (2026-08-30)

`dev` allowed Squash **and** Rebase until 2026-08-30. Rebase was dropped as redundant and
mildly harmful:

- **Redundant.** For a one-commit branch, squash produces the same single commit. Rebase
  offered nothing squash did not, while for a multi-commit branch it replayed every commit
  onto `dev` — the opposite of what an integration branch wants.
- **It was the only path that landed unvalidated subjects on `dev` verbatim.** commitlint
  runs from a bypassable local hook and, until `Commit Lint`, never ran in CI.
- **Often unavailable anyway.** Branches here routinely carry `Merge branch 'dev'` commits,
  which GitHub's rebase-merge cannot cleanly replay.

`Require linear history` stays ON: squash-only already guarantees it, and the rule keeps a
merge commit from being pushed directly.

### Why commit subjects need a CI gate

`squash_merge_commit_title` is `COMMIT_OR_PR_TITLE`. On a multi-commit PR that resolves to the **PR title** — which the local `commit-msg` hook never sees, because it validates the feature-branch commits that squashing then collapses away. Squash makes `dev` history _deterministic_; it does not make it _validated_.

That gap is what the `Commit Lint` job (`.github/workflows/commit-lint.yml`) closes. It lints the PR title on every PR, and additionally lints branch commits on PRs targeting `dev`, where new commits actually enter.

It deliberately does **not** lint commit ranges on promotion PRs. Verified reasons:

- `dev → staging` fails on pre-existing history: `chore(dev-env): make local setup work from a fresh clone` begins with a space (`header-trim`, `subject-empty`, `type-empty`) — the mangled commit from the heredoc incident recorded in `.claude/rules/workflow.md`. Immutable without rewriting a shared branch.
- `staging → main` cannot run at all — commitlint aborts with `Cannot find merge-base`.

---

## Pending changes

Recommended, **not yet applied**. Delete each entry as it lands.

1. **Add `Security Delta Checks` as a required check on all three branches.** It is not required anywhere, yet it hard-fails (`Enforce security gate result` → `exit 1`) and `Unit & Integration Tests` + `contract_local` both `needs:` it. If it fails, those two jobs are **skipped**, and GitHub counts skipped required checks as passing — so a PR can satisfy every required check with the test suite never having run.
2. **Add `Commit Lint` as a required check on all three branches**, once `.github/workflows/commit-lint.yml` has reported once on a PR. (A required check that has never reported leaves PRs pending forever.)
3. **Reconnect `main`** — see below.
4. **Delete the disabled `Protect main & develop (contract gate)` ruleset.**

---

## Reconnecting `main`

`main` cannot be reached by PR from `staging`. Three options, in preference order — all destroy nothing of substance, since `main` holds only `LICENSE`:

1. **Fast-forward `main` onto `staging`'s history** by force-pushing. Cleanest result, but blocked by `Block force pushes` + `Restrict deletions`; requires temporarily adding yourself to the ruleset bypass list, or setting the ruleset to Disabled for the push and back to Active immediately after.
2. **Merge with `--allow-unrelated-histories`** on a temp branch off `main`, then PR that into `main`. Keeps the ruleset untouched and produces an auditable PR, but permanently grafts the orphan root into history.
3. **Delete and recreate `main` from `staging`.** Blocked by `Restrict deletions`, and it would reset the default-branch pointer. Least attractive.

Confirm `LICENSE` survives whichever path is taken — it is the one file `main` has that `staging` may not.

---

## Verifying this document

Live state, all rulesets, one command:

```bash
for id in $(gh api repos/:owner/:repo/rulesets --jq '.[].id'); do
  gh api "repos/:owner/:repo/rulesets/$id" --jq \
    '"=== \(.name) [\(.enforcement)] ===", (.rules[] | "  \(.type): \(.parameters // {} | tostring)")'
done
```

Promotion-chain health:

```bash
git fetch origin dev staging main
git merge-base origin/dev origin/staging   # expect a SHA
git merge-base origin/staging origin/main  # empty output = still severed
```

---

## Conflict Resolution (if it happens again)

If `dev` and `staging` diverge (e.g. a hotfix was applied directly to staging):

```bash
# Create a temp branch from staging
git checkout -b promote/dev-to-staging origin/staging

# Regular merge (not squash) — preserves ancestry
git merge origin/dev

# Resolve conflicts (keep dev's versions for docs)
git checkout --theirs <conflicting-files>
git add <conflicting-files>
git commit

# Push and open PR to staging
git push origin promote/dev-to-staging
```

Open PR: `promote/dev-to-staging → staging`. After merging, delete the temp branch.
