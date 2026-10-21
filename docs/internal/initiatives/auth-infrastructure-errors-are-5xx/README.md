# Auth infrastructure errors are 5xx

**Status:** Done; merged in #200 (`230aada`). Register row B-77 (finding
X61 of the dated run of 2026-10-20).
**Slug:** `auth-infrastructure-errors-are-5xx` · **Branch:** `fix/auth-infrastructure-errors-are-5xx`

Lean kit — no plan; acceptance criteria live in the checklist. No ADR: the documented contract
(`.claude/rules/api-design.md`: 401 for a missing or invalid JWT, 500 for a server error) does not
change; the code is brought to it.

**Why this row now.** B-77 is the first `ready` row under the register's D-01: tier 1 holds only
the dated run the owner set aside, tier 2 waits on the owner and the frontend, tier 3 is empty, and
B-77 is the first of tier 4's smallest. The owner chose it on 2026-10-21.

- [Checklist](auth-infrastructure-errors-are-5xx-checklist.md) — acceptance, work items, gates
- [Decisions](decisions.md) — `D-NN` entries
