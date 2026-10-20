# Floating promises and bounded shutdown

**Status:** Implemented on `fix/floating-promises-and-bounded-shutdown`; PR open. Register rows
B-37 and B-38. D-01 to D-03 promoted to
[ADR-0076](../../../explanation/decisions/adr-0076-promises-are-awaited-and-shutdown-has-a-deadline.md)
(Proposed).
**Slug:** `floating-promises-and-bounded-shutdown` · **Branch:**
`fix/floating-promises-and-bounded-shutdown`

**Why these two rows now.** D-01 of the debt register alone would pick B-33, the first `ready`
row. The owner's standing priority on 2026-10-20 is the most demanding work that is still
important, and the owner approved B-37 with B-38 as one kit. They go together because B-37's rule
reports the signal handlers B-38 rewrites.

- [Plan](floating-promises-and-bounded-shutdown-plan.md) — goals, acceptance criteria, phases
- [Checklist](floating-promises-and-bounded-shutdown-checklist.md) — work items, acceptance, gates
- [Decisions](decisions.md) — `D-NN` entries; promoted ones point at the ADR registry
