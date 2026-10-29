# ADR-0084 — Open work moves to GitHub Issues, with the tracker kept as code

- **Status:** Proposed
- **Date:** 2026-10-28
- **Related:** lakira-frontend ADR-0042 (the same decision there, #154), ADR-0044 (every task
  starts from an issue, #180) and ADR-0045 (release versioning, #183); the Notion record "The
  frontend's open work is in GitHub Issues; the same setup is offered to the backend"
- **Origin:** `D-01` in the tracker-as-code kit —
  [`tracker-as-code`](../../internal/initiatives/tracker-as-code/decisions.md)

---

## Context

Open work lives as Markdown in git: the debt register
(`docs/internal/initiatives/backend-debt-register/register.md`, 101 KB, about 32 open rows and 4
owner questions), a dated todo per item, and a kit per task. Every change of status is a commit,
which is why each merged PR has needed a close-out of its loose ends in the next one, and why a
fact is written three times: in the kit, the PR body and the register. Two tests keep the
Markdown honest (`commands-doc.test.ts`, `debt-register-todos.test.ts`); neither makes it cheaper
to keep.

lakira-frontend moved its open work to GitHub Issues on 2026-10-24 and 2026-10-25, with its
tracker defined in `.github/`, and offered the same setup here. The repository has issues on and
has never used them; it carries GitHub's nine default labels.

## Decision

The owner chose, on 2026-10-27, to adopt the frontend's setup, in steps, one pull request each.

1. **The tracker is defined in the repository** (this record's first PR), so a fork gets it
   without the upstream backlog:
   - labels in `.github/labels.json`: `type:` (task, bug, decision), `tier:1` to `tier:5` (the
     register's D-01 tiers), `sev:P1` to `sev:P3` (as the source graded), and `state:` (ready,
     owner, frontend, upstream, unexplained, deferred), one per state in the register's State
     column (kit D-02);
   - issue forms in `.github/ISSUE_TEMPLATE/`, with blank issues off and a security problem sent
     to private vulnerability reporting, which `SECURITY.md` describes (kit D-04);
   - one pull request template, the frontend's shape with this repository's gates and security
     checklist (kit D-03);
   - `npm run labels:sync`, dry by default, `--apply` to write. It is run by hand; no workflow
     holds a token that can edit labels.
2. **Open work moves.** One issue per open register row and per owner question, in register order,
   in batches the owner confirms. The register is then frozen, with a table from each `B-NN` and
   `O-NN` to its issue at its top, and its test checks that table.
3. **The rules read the tracker.** "What's next" becomes `gh issue list --label state:ready`,
   ranked by tier, then severity, then number. A task starts from an issue: branch
   `<type>/<N>-<slug>`, footer `refs: #N`, pull request `Closes #N`.

Release versioning (the frontend's ADR-0045) is a fourth step, and waits on register row B-57:
`main` shares no history with `dev` or `staging`, so no promotion can reach it yet.

## Options considered

- **Keep the register:** the cost of a close-out PR per merge stays, and the two repositories'
  trackers drift apart in shape.
- **Copy the frontend's `.github/` unchanged:** its tier 2 is "owed to the backend", it has a
  `state:backend` and no `state:unexplained`, and it keeps two Dependabot labels this repository
  has no use for.
- **A Project board for the ranking:** a board belongs to an account, not the repository, so a
  fork does not get it; labels carry the same ranking and fork with the files.
- **A workflow that syncs labels on push:** it would need a job with `issues: write` to save a
  command run a few times a year.

## Consequences

- A fork runs `npm run labels:sync -- --apply` once, and points the security link and
  `SECURITY.md` at its own owner (`docs/tutorials/fork-and-rebrand.md`).
- The sync deletes GitHub's nine default labels. No issue carries them.
- Until step 2 lands the tracker is empty, and a form used before then files an issue the
  register does not rank.
- Decisions stay in git: kits and ADRs are unchanged by this record.
