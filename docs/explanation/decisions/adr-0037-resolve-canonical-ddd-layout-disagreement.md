# ADR-0037 — Resolve the canonical-DDD-layout disagreement

- **Status:** Proposed
- **Date:** 2026-06-05
- **Related:** Revises [ADR-0011](./adr-0011-where-the-canonical-ddd-layout-lives.md). Referenced by [ADR-0044](./adr-0044-feature-boundaries-and-their-frozen-exceptions.md).
- **Origin:** `ADR-011` in the SaaS readiness audit kit — [`saas-readiness`](../../internal/audits/saas-readiness/decisions.md)

---

## Context

ADR-003 (Proposed 2026-05-01) mandates the layout `infrastructure/persistence/{models, repositories, mappers}/` and names `shared/auth` as the **reference slice**. The 2026-06-05 re-audit (`audit-2026-06-05.md` §5) found that the reference slice does **not** match the prescribed layout: `src/features/shared/auth/infrastructure/persistence/` is **flat** — seven `*RepositorySequelize.ts` files at the top level with only `models/` nested. Meanwhile, non-reference slices (`metric`, `metric-log`) match the ADR's nested layout. `.claude/rules/architecture.md` documents the nested layout as canonical, deepening the disagreement. The 2026-05-24 audit acknowledged this only obliquely via C4 (the arch test does not detect it).

## Decision

Pin the **nested layout** (`infrastructure/persistence/{models, repositories, mappers}/`) as canonical for all slices, including `shared/auth`. Migrate `shared/auth/infrastructure/persistence/` to the nested shape in a dedicated cleanup PR. Update `.claude/rules/architecture.md`'s code block to match and reference this ADR. Strengthen `__tests__/unit/architecture.test.ts` (closing C4) to assert the nested layout exists in every feature slice.

Choosing nested over flat is motivated by:

1. The architecture rule already documents nested.
2. Non-reference slices already match nested, so the migration cost is lower (one slice moves, not five).
3. The `mappers/` and `repositories/` subdirs scale better when a slice grows beyond ~3 entities.

## Options considered

- _Flatten everything to match `shared/auth`._ Rejected: four slices migrate vs. one, and the rules doc must change anyway. Higher cost, same outcome.
- _Allow either layout (leave ADR-003 deliberately ambiguous)._ Rejected: ambiguity is what produced the drift. The arch test (ADR-011 follow-on) needs a single shape to assert.
- _Defer until C4 closes._ Deferred is what the 05-24 audit effectively did. The disagreement is small but real and easy to fix now.

## Consequences

- `shared/auth/infrastructure/persistence/` is restructured into `{models, repositories, mappers}/`. Mechanical change; no behavior delta.
- ADR-003 is amended (in-place) to flip from Proposed → **Accepted (revised 2026-06-05)** with this ADR as the supersession marker. The "reference slice = auth" wording is retained because `auth/feature.ts`, use-case organization, and port placement remain reference-grade; only the persistence layout is realigned.
- C4 closure becomes simpler — the arch test now has one shape to enforce.

## Links

- `audit-2026-06-05.md` §5 (the contradiction surfaced explicitly)
- `decisions.md` § ADR-003 (the original Proposed decision being revised)
- `.claude/rules/architecture.md`
- `__tests__/unit/architecture.test.ts:39–118` (the test that must be strengthened)
