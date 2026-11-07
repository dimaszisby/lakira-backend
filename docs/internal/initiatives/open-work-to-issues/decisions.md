# Decisions — open-work-to-issues

All written Accepted, in the pull request that makes them, as D-03 and ADR-0085 set.

## D-01 — Steps 2 and 3 in one pull request: issues, then rules that read them

- **Status:** Accepted
- **Date:** 2026-10-29

Promoted to the architecture decision registry as **[ADR-0085](../../../explanation/decisions/adr-0085-every-task-starts-from-an-issue.md)**.
That file is authoritative; this entry is a pointer.

---

## D-02 — A settled row goes to `known-gaps.md`, not to an issue

- **Status:** Accepted
- **Date:** 2026-10-29

**Context.** Two open rows were settled on purpose: B-26 (the `esbuild` override, kept until `tsx`
declares `esbuild >=0.28`) and B-41 (no cleanup of `processed_messages`, deliberately not built).
An issue nobody will work is noise in the "what's next" query.
**Decision.** Owner's choice, 2026-10-29: settled rows go to `docs/reference/known-gaps.md`, with
why each stays and where it was decided. While the move ran, B-26's trigger fired: `tsx` 4.23.12
to 4.23.15 declare `esbuild ~0.28.0`. Asked again, the owner made it an issue (#262), ready. Only
B-41 is in `known-gaps.md`.
**Options considered.** _Every row an issue, the settled ones `state:deferred`:_ two issues nobody
works, in every query that forgets the label.
**Consequences.** A fork inherits `known-gaps.md`, where it learns what was kept and why.

---

## D-03 — A decision is Accepted in the pull request that makes it

- **Status:** Accepted
- **Date:** 2026-10-29

**Context.** Decisions and ADRs were `Proposed` until merge and `Accepted` after, so every merge left
statuses and PR numbers to change, which went in the next pull request as "loose ends". The
frontend now writes a decision `Accepted` in its pull request. The owner's global
`~/.claude/CLAUDE.md` still says "Accepted on merge".
**Decision.** Owner's choice, 2026-10-29: a `D-NN` entry or an ADR the owner approved in the plan,
or that the PR's review confirms, is written `Accepted` in that pull request; merging is the
acceptance. `Proposed` is only for one still waiting for that approval. This repository's rules
say so; the global file is the owner's to change.
**Options considered.** _Keep Proposed until merge:_ the close-out the move to issues exists to
remove.
**Consequences.** A merged pull request needs no follow-up commit. A decision the review rejects is
changed before merge, as any other part of the pull request is.

---

## D-04 — Issue bodies, labels and batches

- **Status:** Accepted
- **Date:** 2026-10-29

**Context.** 32 open rows and questions had to become issues without losing what the register held,
and creating an issue is outward-facing.
**Decision.** Each body has Why, Source, Acceptance criteria, Size and Tracking ("Register row
B-NN, moved from the frozen debt register on 2026-10-29", plus what blocks it and any F-NN);
decisions have Question, Options, What it blocks. Labels come from the row: `tier:` from its
section, `sev:` from Sev (none when ungraded), `state:` from State (FE becomes `frontend`; a row
waiting on the owner and the frontend takes `state:owner`, the first wait). A row whose register
state was stale got the true one: B-71 is ready, since the frontend chose its remedy on
2026-10-23. Bodies went to `.git/issues/`, run by the owner in five confirmed batches: the four
decisions first (#232 to #235), so later bodies could cite them as blockers.
**Options considered.** _One script for all 31:_ no point at which a wrong label or body is caught
before the rest are made.
**Consequences.** Every issue names its old row, so a frontend issue that cites a `B-NN` can be
followed through the frozen register's table.
