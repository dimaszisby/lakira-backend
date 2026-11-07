# ADR-0085 — Every task starts from an issue; a kit only for two days or more

- **Status:** Accepted
- **Date:** 2026-10-29
- **Related:** completes [ADR-0084](./adr-0084-open-work-moves-to-github-issues.md), steps 2 and 3;
  lakira-frontend's ADR-0044 (the same decision there, #180)
- **Origin:** `D-01` in the open-work-to-issues kit —
  [`open-work-to-issues`](../../internal/initiatives/open-work-to-issues/decisions.md)

---

## Context

ADR-0084 put the tracker in the repository and kept the debt register as the source of "what's
next" until its open rows moved to issues. On 2026-10-29 the register held 28 open rows and four
owner questions; the repository had labels, forms and no issues. Every task wrote a kit or a todo,
a register row and, after the merge, a close-out of statuses and PR numbers in the next pull
request: the bookkeeping the move exists to remove.

## Decision

The owner chose, on 2026-10-29, the frontend's shape:

1. **Open work is GitHub Issues.** The register's open rows became issues #236 to #262 and its four
   owner questions `type:decision` issues #232 to #235, each labelled from its row. B-41, settled
   on purpose, is in `docs/reference/known-gaps.md`. The register is frozen as a record, with a
   table of where each row went.
2. **Every task starts from an issue.** Its number goes in the branch (`fix/123-slug`) and the
   commit footer (`refs: #123`), and the pull request says `Closes #123`, so the merge closes it.
   A finding made during other work is filed as an issue, confirmed with the owner, in that pull
   request's handover.
3. **A kit only for work of two days or more.** That work keeps its kit, with the issue number in
   its README. Smaller work has no kit, no todo file and no register row: the issue body is the
   plan, and the pull request is the record.
4. **"What's next" is a query:** `gh issue list --state open --label state:ready`, ranked by
   tier, then severity, then the lower number (register D-12).
5. **A decision is Accepted in the pull request that makes it.** A `D-NN` entry or an ADR the owner
   approved is written `Accepted` there, and merging is the acceptance. A merge needs no follow-up
   commit: the issue closes itself.
6. **Todo files are records.** Each one that was still open names its issue; no new todo file is
   written after 2026-10-29.

ADRs are otherwise unchanged: a decision that constrains the system is still a record here.

## Options considered

- **Steps 2 and 3 as separate pull requests:** between them, "what's next" would read a frozen
  register.
- **A kit only for multi-week work:** the 2–5 day kits are where a decisions log has earned its
  keep.
- **A kit for every non-trivial task, linked to its issue:** keeps the bookkeeping.
- **Settled rows as issues:** an issue nobody will work is noise in the query. B-26 was settled
  until its trigger fired during the move; it became an issue.
- **Decisions Proposed until merge, as before:** every merge then needs a commit to flip them.
- **Folding the todos into issues and deleting them:** the dated file is the finding's record, and
  merged pull requests link to it.

## Consequences

- `__tests__/unit/open-work-records.test.ts` replaces `debt-register-todos.test.ts`: the frozen
  register maps every open row, each open todo names its issue, and a todo dated after the freeze
  fails the unit gate.
- Issues do not copy to a fork; `known-gaps.md`, the labels and the forms do.
- The owner's global `~/.claude/CLAUDE.md` still says a record is "Accepted on merge"; this
  repository's rules say otherwise for this repository.
- Release versioning is issue #261, blocked by #254 (`main` shares no history with `staging`).
