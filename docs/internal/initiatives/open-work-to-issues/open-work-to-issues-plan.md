# Open work to issues — Plan

- **Status:** Approved (2026-10-29)
- **Appetite:** 3 days — past that, cut what remains into its own issue
- **Date:** 2026-10-29

The plan as approved in plan mode, kept as written. What changed while it ran is in
[decisions.md](decisions.md) and the checklist's Discovered section.

## Context

ADR-0084 (Accepted) moves the backend's open work to GitHub Issues. Step 1 is done (#230, #231):
labels, forms, PR template, `SECURITY.md`, private reporting. Register row B-101 holds the rest.
This PR does **steps 2 and 3 together**, as lakira-frontend did in #180 (its ADR-0044). Three
separate PRs were rejected there because "what's next" would read a frozen register in between.

Sources read for this plan:

- the frontend's ADR-0044;
- #180's file list, and its diffs of `.claude/rules/workflow.md` and `documentation.md`;
- `open-work-records.test.ts`, the frozen register's head, `known-gaps.md`, and issues #165 (task)
  and #156 (decision);
- the Notion record's step 2 and 3;
- the "Lakira Tracking Setup" artifact, as background only. Its figures are the frontend's.

Owner's choices (2026-10-29):

- **B-26 and B-41 go to `docs/reference/known-gaps.md`**, not issues. They are settled: kept on
  purpose, and deliberately not built.
- **A decision is written Accepted in the PR that makes it.** Merging is the acceptance, so no
  close-out commit follows a merge. Your global `~/.claude/CLAUDE.md` still says "Accepted on
  merge"; I won't edit it, but you may want them to agree.

**Size: Standard kit**, `docs/internal/initiatives/open-work-to-issues/` (the frontend's slug):
README, plan, checklist, decisions. It is the last kit under the old rules, and it is 2+ days of
work anyway. Branch `chore/open-work-to-issues`, cut with `--no-track` from `origin/dev` at
`8f68b0d`.

**ADR-0085** ("Every task starts from an issue; a kit only for two days or more"), written
Accepted, as the new rule says. It mirrors the frontend's ADR-0044, plus the decision-status rule.

## Step 2: open work becomes issues

**What moves, measured on `dev` at `8f68b0d`:** 28 open rows and 4 owner questions.

| Rows                                 | Where they go                              | Count |
| ------------------------------------ | ------------------------------------------ | ----- |
| O-02 to O-05                         | `type:decision` + `state:owner` issues     | 4     |
| B-26, B-41                           | `known-gaps.md`                            | —     |
| Every other open row, B-101 included | one `type:task` (or `type:bug`) issue each | 26    |

The issues total 30. **B-101** becomes "Version releases (ADR-0084 step 4)", blocked by B-57's
issue, because steps 2 and 3 are this PR.

**Issue bodies** use the frontend's shape:

- **Why**, from the row and its todo;
- **Source**: audit section, Notion record or todo path;
- **Acceptance criteria**, from the todo's suggested fix or the row;
- **Size**, the row's;
- **Tracking**: "Register row B-NN, moved from the frozen debt register on <date>", plus "Blocked
  by #N" where a decision blocks it, and any F-NN.

Each issue's labels come from its row:

| Label    | Taken from                                                  |
| -------- | ----------------------------------------------------------- |
| `tier:`  | its section of the register                                 |
| `sev:`   | Sev; none if ungraded                                       |
| `state:` | State: ready, owner, FE → `frontend`, upstream, unexplained |

**Creation, in batches you confirm.** Creating an issue is outward-facing. I write each body to
`.git/issues/<ID>.md` and each batch to `.git/issues/batch-N.sh` (one `gh issue create` per
issue). I show the titles, labels and bodies, then hand over `! bash .git/issues/batch-N.sh`. I
check the result with `gh issue list` before the next batch.

| Batch | Holds                                                                                        | Count |
| ----- | -------------------------------------------------------------------------------------------- | ----- |
| 1     | the 4 decisions, first, so later bodies can cite them as blockers                            | 4     |
| 2     | tiers 2 to 4: B-03, B-04, B-05, B-94, B-95, B-96, B-97, B-11                                 | 8     |
| 3     | tier 5 security, architecture, API: B-81, B-98, B-42, B-99, B-48, B-71, B-87, B-100          | 8     |
| 4     | tier 5 forkability, tests, repo: B-54, B-55, B-57, B-59, B-62, B-63, B-67, B-73, B-86, B-101 | 10    |

**Freeze the register.** `register.md` gets:

- a `**Frozen:** <date>` line and a pointer to the issues;
- a `## Where each row went` table, from each open `B-NN`/`O-NN` to `#N` or `` `known-gaps.md` ``.

The rows themselves stay as written, a record. The Closed section stays (step 0 was skipped). The
register README says it is frozen.

**`docs/reference/known-gaps.md`**: B-26 and B-41, each with why it stays and where it was decided.

**Todo files become records.** Each open todo (today's Status vocabulary) gets its Status line
changed to name its issue: `Open. Issue #N (was register row B-NN)`. Nothing else in the todo
changes.

**The test.** `__tests__/unit/open-work-records.test.ts` replaces `debt-register-todos.test.ts`,
modelled on the frontend's. It checks that:

- the register says it is frozen;
- every open-section `B-NN`/`O-NN` row is mapped to `#N`, `` `known-gaps.md` `` or `closed in #N`;
- every open todo names an issue or `known-gaps.md`;
- no todo is dated after the freeze.

It keeps the finished-status words from B-60.

## Step 3: the rules read the tracker

| File                                               | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/rules/workflow.md`                        | Task Flow starts at `issue #N`. "The issue number is the traceability spine": branch `<type>/<N>-<slug>`, footer `refs: #N`, PR `Closes #N`, kit only for 2+ days with the issue in its README; older slug branches stay. **What's next**: `gh issue list --state open --label state:ready` ranked by `tier:`, then `sev:` (none after P3), then number; gaps are higher issues waiting on someone (`state:owner`, `state:frontend`, …); `type:decision` issues are your questions. A new finding, audit item or Notion record becomes an issue (confirmed with you) in the handover of the PR that found it. A fix PR says `Closes #N`. Tracking Progress loses ephemeral todos. Decisions are written Accepted in the PR. |
| `.claude/rules/documentation.md`                   | Kit table: Full, Standard (2–5 days), "Under two days: no kit, the issue body is the plan, the PR the record"; the Lean, Micro and ephemeral rows go, kept as history. Placement table: "work to do, however small → a GitHub issue". The "Found:" template line files an issue. The decision template's Status line and the "Proposed until merge" wording follow the new rule.                                                                                                                                                                                                                                                                                                                                            |
| `.claude/agents/doc-writer.md`                     | Placement row as above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `docs/explanation/documentation-standards.md`      | Kit-size table as above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `docs/how-to/ci-cd/daily-pipeline-playbook.md:118` | "create a TODO in `docs/internal/todos/`" becomes "file an issue".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `CLAUDE.md`                                        | "What's next" points at the issues query and `issue-tracker.md`, not the register; the register is described as frozen; 85 ADRs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `docs/reference/issue-tracker.md`                  | The "until step 2" paragraph becomes the What's next query and the frozen register's mapping.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Left as written: ADRs and dated docs that cite a todo path as their record (`api-design.md:88`,
`dependency-policy.md`, ADR bodies).

**Ranking decision:** the register kit's D-12, "Rank by labels: state, tier, severity, number",
mirroring the frontend's D-02.

## Records

- Kit `open-work-to-issues`:
  - D-01: steps 2 and 3 in one PR, the owner's choice of the frontend's order; promoted to
    ADR-0085;
  - D-02: settled rows to `known-gaps.md`;
  - D-03: decisions Accepted in their PR;
  - D-04: issue bodies and batches.

  All are written Accepted.

- ADR-0085, its index row, ADR-0086 next, `CLAUDE.md` 85 ADRs.
- Loose ends of #231, the last close-out under the old rule: `tracker-as-code` D-05 Accepted
  (#231, `8f68b0d`), "As of" `8f68b0d`.
- **Notion, after the issues exist:**
  - on the record "The frontend's open work is in GitHub Issues…", post the `B-NN`/`O-NN` → `#N`
    table, so the frontend can repoint its #162, #166, #169, #170 and #172. Status stays In
    progress (step 4 is an issue) and the Index row is updated;
  - on the logCount record, its issue number.

  These are frontend-affecting records, so they are allowed. Shown to you before writing.

## Acceptance criteria (go in the plan)

- AC-1: Every open register row and owner question is an issue with labels from its row, or a
  `known-gaps.md` entry; the register maps each one.
- AC-2: `open-work-records.test.ts` passes, and fails on an unmapped row, an open todo with no
  issue, and a todo dated after the freeze.
- AC-3: The rules, `CLAUDE.md` and the reference answer "what's next" from
  `gh issue list --label state:ready`, and a new task starts from an issue.
- AC-4: Kits are only for 2+ days, and the docs that describe kit sizes say so.
- AC-5: The frontend has the mapping table on Notion.

## Verification

- Each batch: `gh issue list --label <...> --json number,title,labels` matches the batch file.
- After batch 4: the count is 30, every issue has one `type:` label, and every task has one
  `tier:` and one `state:`.
- Run "what's next" from the new rule and check it names the top `state:ready` issue (it should be
  B-94's).
- typecheck, lint, format (named files), unit with coverage, build. Integration, OpenAPI, image
  smoke, security delta: not run, documentation and tests only.

## Open questions

None left: both were answered on 2026-10-29 (Context).

## Decisions expected

D-01 to D-04 in [decisions.md](decisions.md).

## Out of scope

- Step 4 (release versioning): an issue, waiting on B-57's.
- Archiving finished kits and todos (the skipped step 0).
- A Project board.
