# Todo — `main` shares no history with `dev` or `staging`

- **Status:** Open
- **Created:** 2026-09-24
- **Owner:** unassigned
- **Origin:** raised in the 2026-09-24 handoff and filed by the `saas-audit-closeout` kit; see its
  checklist § Work items

---

## What

`main` is a single commit, `2fc7944 Initial commit` (2025-01-21). `git merge-base` finds no common
ancestor between it and either `origin/dev` (498 commits) or `origin/staging` (461 commits):

```bash
git merge-base origin/main origin/dev      # prints nothing, exits 1
git merge-base origin/main origin/staging  # same
```

The documented promotion path is `feat/* → dev → staging → main`
(`.claude/rules/workflow.md` § Branching Convention), and `deploy_production` in
`.github/workflows/backend-ci.yml` runs only on `refs/heads/main`. The last step of that path
cannot happen as things stand: a `staging → main` PR has no merge base, so GitHub refuses it, and
a local merge needs `--allow-unrelated-histories`.

## Why it has not bitten yet

No release has been cut, so nothing has tried to promote into `main`. The unrelated history has
actually acted as a safety net: `gh pr create` without `--base` targets the repository's default
branch, which is `main`, and GitHub refused one such PR only because there was no merge base.

## Why it matters

It blocks the first production release, and it will surface at the worst moment, in the middle of
a promotion. It also removes the safety net above: once `main` shares history, a PR opened against
it by mistake will be accepted.

## Options (not chosen here)

- **Reset `main` to `staging`** (force-push). This is the simplest: `main` then starts where
  promotion expects. It rewrites a protected branch, so branch protection has to be relaxed
  briefly. The old `Initial commit` is lost unless tagged first.
- **Merge `staging` into `main` with `--allow-unrelated-histories`.** Keeps the old commit, but
  every file will conflict as add/add, and it leaves a permanently confusing root in the history.
- **Change the default branch to `dev`**, alongside either option above. This closes the
  wrong-base PR hazard for good instead of relying on the accident.

Whichever is chosen, do it deliberately before the first release, not as part of it. That work
also depends on the ADR-0042 VPS, which replaces the Render target `deploy_production` still
points at.
