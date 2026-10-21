# Queue failure paths

**Status:** Done; merged in #203 (`2c1c098`). Register rows B-78 (finding X63 of the dated
run of 2026-10-20) and B-84 (X64 to X68, N4), bundled by register D-10.
**Slug:** `queue-failure-paths` · **Branch:** `fix/queue-failure-paths`

Standard kit. Decisions promote to ADR-0080. After it merges, the dated audit run owed in register
tier 1 follows, so one run confirms B-74 to B-80 and this kit (owner, 2026-10-21).

**Why these rows now.** D-01 alone picks B-78, the only `ready` row of tier 4. The owner's standing
choice for this run of days is the most token-demanding important work; B-84's queue and lifecycle
P3s share B-78's files and its test harness, and the owner chose both on 2026-10-21.

- [Plan](queue-failure-paths-plan.md) — the spec, with acceptance criteria
- [Checklist](queue-failure-paths-checklist.md) — the tickets
- [Decisions](decisions.md) — `D-NN` entries
- Todo: [`2026-10-20-todo-broker-setup-failure-stops-the-api.md`](../../todos/2026-10-20-todo-broker-setup-failure-stops-the-api.md)
