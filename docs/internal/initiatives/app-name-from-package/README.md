# The app takes its name from the package

**Status:** Merged in #144 (`b04b350`); D-01 and D-03 promoted to ADR-0060.
**Slug:** `app-name-from-package` · **Branch:** `fix/app-name-from-package`

Lean kit — no plan; acceptance criteria live in the checklist. Fixes caveat C2 as the second dated
run of 2026-10-05 graded it (finding U2, P2, `docs/internal/audits/saas-readiness/audit-2026-10-05-b.md`
§ 6): a fork deployed without `APP_NAME` as a platform variable is branded as the template. C2 stays
as graded in the audit until a dated run confirms the fix (ADR-002).

- [Checklist](app-name-from-package-checklist.md) — work items, acceptance, gates
- [Decisions](decisions.md) — `D-NN` entries; promoted ones point at the ADR registry
- Origin: [`2026-10-06-todo-fork-deployed-without-app-name.md`](../../todos/2026-10-06-todo-fork-deployed-without-app-name.md)
