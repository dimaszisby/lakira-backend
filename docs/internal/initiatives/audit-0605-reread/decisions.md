# Decisions — audit-0605-reread

## D-01 — `body-parser` is not declared; Express's copy parses the body

- **Status:** Proposed
- **Date:** 2026-10-27

**Context.** R13 of the 2026-09-29 run (`audit-2026-09-29.md:186`) found `body-parser` declared in
`package.json` and imported by nothing. Still true at `e6f7d4b`: the pipeline parses JSON with
`express.json()`, which is Express's own `body-parser`, and `architecture.test.ts:639` already
fails on a direct import of it.
**Decision.** `npm uninstall body-parser`. The lockfile loses the root's declaration and nothing
else: all 896 package entries keep their version and integrity, and the production tree holds the
same 261 packages, `body-parser` 1.20.9 among them, now under Express. No ADR: no installed
version and no behaviour changes.
**Options considered.** _Keep it, to pin the patched version:_ Express's own range already admits
1.20.9, and #221 moved it through the lockfile, which this keeps.
**Consequences.** A `body-parser` advisory is now reached through Express alone, which is how the
app reaches it anyway.

---

## D-02 — Each finding of the 2026-06-05 run gets a state; what is open is filed, not fixed

- **Status:** Proposed
- **Date:** 2026-10-27

**Context.** B-61: the run's 20 findings (§ 4.4 and § 6) were never read against the code again.
Later runs graded their own findings; nothing said which of these still held.
**Decision.** One row per finding in the checklist, with a state (Fixed, Tracked, Open, Not a
defect) and evidence a reader can follow. Each Open finding gets a todo and a register row at the
run's grade, placed by D-01 of the register; none is fixed here. The dated audit file is not
edited. Six are open: N6, N7, N8, N9, F6 and the unclamped sample rate. N6 and N7 wait on the
owner: per-organization queue fairness is a product decision, and N7 has ADR-0038, still Proposed.
**Options considered.** _Fix the small ones here (N8, the sample-rate clamp):_ each is ranked
against the rest of the register, and a re-read that also changes code is harder to review.
**Consequences.** Four P2 rows enter tier 4, so the next "what's next" may be N8, not a P3.

---

## D-03 — F5: ownership is checked in the use case, as everywhere else

- **Status:** Proposed
- **Date:** 2026-10-27

**Context.** F5 (P2) asked `MetricSettingsRepositorySequelize.create()` to re-check that the metric
belongs to the caller's organization. It still does not. `CreateMetricSettings` calls
`MetricAccessPort.ensureMetricOwnership(userId, organizationId, metricId)` before it creates, the
pattern `.claude/rules/architecture.md:158` sets for every feature that touches a metric (11 call
sites), and the repository is reached only through that use case.
**Decision.** Not a defect. Authorization stays in the application layer.
**Options considered.** _A composite foreign key, `(metric_id, organization_id)` onto metrics:_
defence in depth at the database, but a migration on a table every settings row uses, for a path
with one caller; a register row if it is wanted.
**Consequences.** A new caller of the repository must go through the port, as every other does.

---

## D-04 — N11: the join carries ownership and soft delete, not organization alone

- **Status:** Proposed
- **Date:** 2026-10-27

**Context.** N11 (P2) called the `metric` join in `MetricLogQueryRepoSequelize.listLogs` redundant,
since `metric_logs.organizationId` is NOT NULL.
**Decision.** Not a defect. The join (`includeForOwnership`, `:225-233`) also filters on
`metric.userId` and `metric.deletedAt IS NULL`, neither of which `metric_logs` holds: dropping it
would list another member's logs and the logs of a deleted metric.
**Options considered.** _Copy `userId` and a deleted flag onto `metric_logs`:_ a migration and a
second source of truth, for a join on an indexed key.
**Consequences.** None.

---

## D-05 — F7: the refresh cookie stays `SameSite=Strict`, as ADR-0019 records

- **Status:** Proposed
- **Date:** 2026-10-27

**Context.** F7 (P3) warned that `sameSite: "strict"` on the refresh cookie may push a fork with a
cross-origin frontend to weaken it to `"none"`. ADR-0019's status note records `Strict` as the
choice, over the `Lax` it first proposed.
**Decision.** Not a defect: a recorded choice, not an oversight, so it needs no owner's question.
**Options considered.** _An `O-NN` question:_ the decision exists; asking again re-opens it without
a new fact.
**Consequences.** A fork with a frontend on another site reads ADR-0019 before changing it.
