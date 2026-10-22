# ADR-0022 — Transaction port consolidation for metric slice

- **Status:** Proposed
- **Date:** 2026-05-03
- **Origin:** `ADR-001` in the Feature vertical-slice migration kit — [`feature-vertical-slice-migration`](../../internal/initiatives/feature-vertical-slice-migration/decisions.md)

> **Status note (2026-10-23).** Carried out across the app, not only the metric slice: one
> `TransactionPort` in `src/shared/application/ports/` and one `SequelizeTransactionPort` in
> `src/shared/infrastructure/persistence/`, used by auth and metric. Auth's and metric's copies,
> and a third declaration with its adapter in auth's refresh-token repository, are deleted
> ([`architecture-dead-code` D-01](../../internal/initiatives/architecture-dead-code/decisions.md),
> audit finding R11). The status becomes Accepted when that branch merges.

---

## Context

`src/features/public/metric/application/ports/` exposes two transaction abstractions: `PersistenceTransaction.ts` and `TransactionPort.ts`. They appear to be a stalled refactor — one is used by create/update use cases, the other may be dead code. Having two confuses forkers about which to use.

## Decision

1. Audit call sites for both ports. The one with more consumers becomes canonical.
2. Migrate the remaining call sites to the canonical port.
3. Delete the unused port file.
4. If the contracts differ materially, merge the richer one into the simpler one's name (prefer the shorter, more descriptive name).

## Options considered

- _Keep both._ Rejected: ambiguity is the core problem.
- _Create a third, "better" port._ Rejected: premature abstraction; pick one and iterate.

## Consequences

- One fewer file in `application/ports/`.
- All transaction-using tests must import the surviving port.

## Links

- `docs/internal/audits/saas-readiness/audit-2026-05-01.md` § 10.1
- `plans/phase-drift-cleanup-plan.md` § Phase A

---
