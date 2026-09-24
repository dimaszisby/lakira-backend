# Internal — project working material

**This directory is removed when the repository is forked.**
`scripts/bootstrap-fork.sh` deletes it, so a fresh fork inherits documentation about the
_template_ rather than this project's history.

Nothing here describes how the system works today. For that, use the four Diátaxis quadrants:

| I want to…                 | Go to                                |
| -------------------------- | ------------------------------------ |
| learn by doing             | [`../tutorials/`](../tutorials/)     |
| accomplish a specific task | [`../how-to/`](../how-to/)           |
| look something up          | [`../reference/`](../reference/)     |
| understand why             | [`../explanation/`](../explanation/) |

## What lives here

| Folder                   | Contents                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `initiatives/`           | Doc kits for individual pieces of work — plan, checklist, ticket, decisions, trackers. One folder per initiative. |
| `audits/saas-readiness/` | The SaaS-base readiness audit series and its roadmap.                                                             |
| `audits/security/`       | Dated security audit runs, scaffolded from `../reference/security/audit-run-template/`.                           |
| `audits/twelve-factor/`  | Twelve-Factor App compliance runs. Source-first; owns ADR-0038 through ADR-0041.                                  |
| `incidents/`             | Postmortem-style records of past failures.                                                                        |
| `dev-log/`               | Dated single-session engineering notes.                                                                           |
| `todos/`                 | Ephemeral `YYYY-MM-DD-todo-*.md` notes. User-controlled; may be deleted without a follow-up PR.                   |
| `archive/`               | Completed migrations, superseded plans, old code reviews, and documentation for the separate frontend repository. |

## Two things to know before pruning

**`audits/saas-readiness/` tracks unresolved risk, not history.** Its live status is
[`FINAL-AUDIT-SUMMARY.md`](audits/saas-readiness/FINAL-AUDIT-SUMMARY.md). As of 2026-09-24 there
are no open P0 or HIGH findings: the 2026-06-05 cache-key P0s and the rate-limit HIGH closed in
`f5f28b9` (#64), and all six C1–C6 caveats are closed. Open P1/P2 findings (N4, N6–N11, F4–F7)
are listed in that file's § 7. Read it, not an individual dated audit, before assuming what is
open.

**Historical documents are left factually as-written.** Review evidence and incident records
quote paths and commands as they were at the time. Where those paths have since moved, the text
is deliberately _not_ updated — rewriting an observation to match today's layout would falsify
the record. Current instructions live in `how-to/`; treat anything here as a dated snapshot.
