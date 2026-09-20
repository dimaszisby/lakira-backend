# Documentation standards

How `docs/` is organised, and where a new document goes.

## The organising principle

Documents are filed by **what the reader is doing**, not by what the artifact is called. That is
[Diátaxis](https://diataxis.fr/), and it gives four shipped quadrants:

| Quadrant            | The reader is…                     |
| ------------------- | ---------------------------------- |
| `docs/tutorials/`   | learning by doing, start to finish |
| `docs/how-to/`      | accomplishing one specific task    |
| `docs/reference/`   | looking something up               |
| `docs/explanation/` | trying to understand why           |

The failure mode this prevents is the one that produced this tree's predecessor: filing by
artifact type (`plans/`, `checklists/`, `audits/`) puts a stale migration plan beside a current
API reference with nothing to distinguish them.

Two rules keep it honest:

1. **One quadrant per document.** A page that both teaches and specifies should be split. The
   most common mistake is a "guide" that is really a reference with a tutorial bolted on.
2. **Generated files are never hand-edited.** `docs/reference/api/lakira-backend-openapi.json` is
   produced from Zod schemas and drift-gated in CI.

The full placement table lives in `.claude/rules/documentation.md` and is mirrored verbatim in
`.claude/agents/doc-writer.md`. **Those two must stay identical** — they once disagreed about
where architecture docs belonged, both were followed, and the result was two parallel
architecture trees.

## `internal/` is not a quadrant

Diátaxis describes documentation _of a system_. It says nothing about **working material** —
plans, checklists, tickets, progress trackers, audit runs — which is most of what a real project
accumulates.

That material lives under `docs/internal/`, beside the quadrants rather than inside them, and
`scripts/bootstrap-fork.sh` deletes it on fork. A fork inherits documentation about the template,
not this project's history.

## Doc kits, for working material only

Inside `docs/internal/initiatives/<topic>/`, an initiative gets a kit. Size it to the work:

| Scope                                             | Kit          | Contents                                                                     |
| ------------------------------------------------- | ------------ | ---------------------------------------------------------------------------- |
| Large initiative (multi-week, affects CI/process) | Full kit     | README + plan + checklist + ticket + decisions + incidents + metrics-tracker |
| Medium effort (2–5 working days)                  | Standard kit | README + plan/ticket (merged) + checklist + decisions                        |
| Small infra change / quick sweep                  | Lean kit     | README + checklist + at least one `decisions.md` entry                       |
| Single-commit fix                                 | Micro entry  | One entry in the nearest `decisions.md` referencing the commit SHA           |

A document in one of the four shipped quadrants is a **single file**. Do not scaffold a kit
around it.

### Keep checklists honest

An unticked box means outstanding work. If the work shipped, tick it — a kit that reads
"Planning — awaiting approval" while the code has been live for months is worse than no kit,
because it actively misleads. This happened here: the audience-restructure kit sat at 0/99 with
`YYYY-MM-DD` placeholder dates while `src/features/public/` had been in production for months.

## Architectural decisions

A kit's `decisions.md` is a working log, its entries numbered `D-01`, `D-02` within the kit.
Decisions that constrain how the system is built get **promoted** to `docs/explanation/decisions/`
as numbered records, one per file, in Nygard format — `D-03 → ADR-0044` — with a pointer left
behind in the kit. The two numbering spaces are separate on purpose.

Promote if it would still matter to someone who never saw the initiative: token hashing, FK
cascade behaviour, port boundaries, queue topology, module layout. Leave in the kit if it only
coordinates the work: phase order, audit cadence, which sweep to run first.

Statuses are `Proposed` / `Accepted` / `Superseded`, and a record is **immutable** — supersede it
with a new one rather than editing it. `Proposed` means written down and _not implemented_.

See `docs/explanation/decisions/README.md` for the format and the next free number.

## Naming and cross-links

- kebab-case filenames; date-prefix anything chronological (`YYYY-MM-DD-*`).
- Cross-link with **repo-root-relative** paths, so a link survives the file being moved.
- Relative links (`../foo.md`) are fine within a kit, but they break the moment a file is lifted
  out of it — which is how the architecture references broke during this restructure.

## Workflow for New Topics

1. **Create folder skeleton**
   ```bash
   mkdir -p docs/internal/initiatives/<topic>
   touch docs/internal/initiatives/<topic>/{README.md,<topic>-plan.md,<topic>-checklist.md,<topic>-ticket.md,decisions.md,incidents.md}
   ```
2. **Populate README first** so teammates know why the folder exists.
3. **Draft the plan** (phases, dependencies, guardrails). Reuse content blocks from `docs/internal/initiatives/tests-overhaul/test-structure-plan.md`.
4. **Open the ticket doc** with summary + acceptance criteria; link to the GitHub issue/Jira ID if relevant.
5. **Maintain checklist** as work proceeds; add `commit: <sha>` or branch references to every completed item for traceability in a single-developer workflow.
6. **Tag related docs** (`decisions.md`, `incidents.md`, trackers) with the same commit/branch links so readers can jump straight to the change.
7. **Log decisions/incidents** immediately after they occur; include owner + references to PRs, issues, or Slack threads.
8. **Review & socialize**: mention new docs in PR descriptions and Slack so others know the source of truth.

## Maintenance Expectations

- Update README/plan when scope changes; don’t leave stale instructions.
- Keep checklists honest: unchecked items signal outstanding work even if code shipped.
- For decisions, follow ADR statuses (`Proposed`, `Accepted`, `Superseded`) so future readers know what still applies.
- Incidents should include corrective actions; close the loop by linking to follow-up tasks or tickets.
- When a topic sunsets, add a “Status: Deprecated” section to README and link to the successor document.

### Cadence (Single-Developer Friendly)

- **After every merge/commit batch:** update the checklist entry with the latest SHA, and refresh README sections impacted by the change.
- **Weekly review:** skim the plan/checklist for stale items; move deferred work into a backlog note and note blockers in `decisions.md`.
- **Monthly/major release:** audit `incidents.md` and `metrics-tracker.md` to confirm targets are still relevant and record any trend changes.

## Templates

Use the snippets below as copy/paste starters.

### README Template

```md
# <Topic Name>

## Overview

- Purpose
- Owning squad / DRI

## Scope

- In Scope: …
- Out of Scope: …

## Commands & Tooling

- `npm run …` — description
- External services / env vars

## Verification

- How to run tests/checks locally
- Expected CI jobs/artifacts

## References

- [Plan](./<topic>-plan.md)
- [Checklist](./<topic>-checklist.md)
- Related docs / ADRs / tickets
```

### Plan Template

```md
# <Topic> Plan

## Context & Goals

- …

## Phases / Milestones

1. Phase 0 – …
2. Phase 1 – …

## Success Criteria

- KPI / SLAs / coverage targets

## Risks & Mitigations

- …

## Open Questions

- …
```

### Checklist Template

```md
# <Topic> Checklist

## Phase 0 – …

- [ ] Task — owner (target date)
- [x] Completed Task — link to PR #123
```

### Ticket Template

```md
# Ticket: <Concise goal>

## Summary

…

## Background

…

## Acceptance Criteria

- …

## Out of Scope

- …

## Dependencies / Stakeholders

- …
```

### Decision record (promoted to the registry)

```md
# ADR-NNNN — <Decision title>

- **Status:** Proposed | Accepted | Superseded
- **Date:** YYYY-MM-DD
- **Related:** Supersedes / superseded by ADR-NNNN
- **Origin:** `D-NN` in the <topic> kit — [`<topic>`](../../internal/initiatives/<topic>/decisions.md)
  (or the audit programme, for a record written here directly)

---

## Context

## Decision

## Options considered

## Consequences

## Links
```

### Incident Log Entry

```md
## Incident YYYY-MM-DD — <Title>

- Impact: …
- Detected by: …
- Commit / Branch: `<sha>`
- Root cause: …
- Mitigation: …
- Follow-up actions: …
```

### Metrics Tracker Template

```md
| Metric        | Target | Baseline            | Current             | Owner          | Next Action / Link           |
| ------------- | ------ | ------------------- | ------------------- | -------------- | ---------------------------- |
| Lint duration | < 2m   | 3m 10s (2025-01-05) | 2m 45s (2025-02-10) | @dimaspramudya | Optimize ESLint cache (#123) |
```

Adhering to this guide ensures each future topic—static checks, observability, feature migrations—ships with the same high-quality documentation kit showcased in `docs/internal/initiatives/tests-overhaul/`, reinforcing both team DX and portfolio polish.
