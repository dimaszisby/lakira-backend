# Feature boundaries — Plan

- **Status:** Done
- **Appetite:** 3 days across two PRs — past that, PR 1 alone closes two of C4's three claims
- **Date:** 2026-09-22

## Context and goals

SaaS-readiness caveat **C4**: _"Architecture test too weak — enforces only 3 narrow checks, no
negative cases; real app→infra ORM writes, `AppError` in domain entities, and cross-feature deep
imports pass green."_

A previous handoff claimed two of the three do not reproduce. **All three do.** Measured on
`dev` @ `21f12eb`:

| Claim                      | Measured                                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| app→infra ORM writes       | **3 files** — the `GenerateDummy*` use cases import `models` from `@/infrastructure/db/models.js` inside `application/`                            |
| `AppError` in domain       | **3 files, 12 throws**, all `400` — plus `InvalidTokenError` _extends_ `AppError`, so the one existing "domain error" precedent is itself the leak |
| cross-feature deep imports | **25** — 11 model associations, 14 other. Every one reaches into another feature's `infrastructure/`; none touch `domain/` or `application/`       |

Two the caveat does not mention: **2 self-imports**, where a feature reaches itself through the
global `@/features/…` alias instead of a relative path.

`.claude/rules/architecture.md` states _"Features export through `index.ts` only"_ and
_"Application layer depends on domain only"_. The code contradicts both and
`__tests__/unit/architecture.test.ts` passes green — this repo's signature defect, a gate that
cannot fail.

When this lands, the rules are enforced where they can be, the one exception is frozen rather than
blessed, and every new rule has been seen to reject before being trusted.

## Acceptance criteria

- **AC-1** — No file under `src/features/*/*/application/` imports `@/infrastructure/db/models.js`,
  and the ESLint rule rejects it.
  _Why:_ C4's first claim; the layering rule says application depends on domain and ports only.
- **AC-2** — The 14 non-model cross-feature imports resolve through the target feature's
  `index.ts`; the 2 self-imports become relative paths.
  _Why:_ `architecture.md` § Export Convention already requires it.
- **AC-3** — Exactly **11** model-association imports remain, asserted by count. A 12th fails CI,
  and so does a removal.
  _Why:_ [D-02](decisions.md). A freeze is only a ratchet if it resists movement in both directions.
- **AC-4** — Every new rule is proven to reject: a deliberate violation fails, and is seen failing
  before the rule is trusted.
  _Why:_ C4 exists **because** the current test cannot fail. Adding rules without proving rejection
  reproduces the defect at a larger size.
- **AC-5** _(PR 2)_ — No file under `src/features/*/*/domain/` imports `AppError`, including
  `InvalidTokenError`.
  _Why:_ C4's second claim. An HTTP status code inside a domain entity is the violation.
- **AC-6** _(PR 2)_ — The error envelope is unchanged for the 12 converted throws: same status, same
  body shape.
  _Why:_ C3 rewrote this envelope once already and every client parses it. A refactor must not
  change it.

## Open questions

- [x] **Q-1** — Should `authMiddleware`, `requireVerifiedEmail` and `assertHasOrgRole` be one
      exported middleware surface? **Answered during PR 1: yes**, and not for the cosmetic reason
      the question assumed — `src/features/shared/auth/public.ts` had to exist anyway to break the
      barrel cycle ([D-05](decisions.md)), and all three belong on it.

## Out of scope

- **Removing cross-module foreign keys / moving to ID-only references.** This is the real fix per
  [D-03](decisions.md) and a multi-week initiative. ADR-0044 names it as the destination so the
  freeze is not mistaken for approval.
- TF-16, the `config.cjs` ↔ `db.ts` drift — a different boundary.
- C2's residual branding judgement — a decision, not code.

## Decisions expected

All four settled during planning and written to [`decisions.md`](decisions.md) when taken.

- **D-01** — Enforce via ESLint `no-restricted-imports`, not only the Jest test.
- **D-02** — Freeze the 11 model associations at an exact count, not an allowlist.
- **D-03** — Cross-module FKs are the real violation; ID-only references are the destination.
- **D-04** — Dummy generators take the repository port rather than being relocated.

D-02 and D-03 together are the promotion candidate for **ADR-0044** (next free — the registry holds
43, highest `adr-0043`). Promote at end of task.

## Phases

### PR 1 — `fix/feature-boundaries`

**Phase 0 — Prove the negative.** Write the ESLint rule and the count assertion, run against
unchanged source, record what they reject. Nothing is trusted until seen failing.

**Phase 1 — Public surfaces.** Each feature's `index.ts` currently exports only its router(s) and
`buildXFeature`. Export what other features legitimately need: `authMiddleware` (5 importers),
`MetricAccessSequelize` (3), the shared mappers (5), the one cross-feature DTO.

**Phase 2 — Rewrite 14 + 2.** Cross-feature imports point at `index.ts`; self-imports become
relative.

**Phase 3 — Dummy generators.** Inject `MetricRepository` + `TransactionPort` per
[D-04](decisions.md); drop the `models` import. `feature.ts:34` already has both in scope.

**Phase 4 — Rule and freeze.** Per-feature ESLint `files:` blocks; `toHaveLength(11)` in the
architecture test, with the 11 enumerated so a reader knows what is frozen and why.

**Phase 5 — Negative fixtures** for every new rule.

### PR 2 — `refactor/feature-boundaries-errors`

1. Characterisation tests **first** — capture the current envelope for all 12 throws.
2. `DomainError` base carrying a semantic `kind`, no HTTP status.
3. `Metric.ts` (8) and `MetricSettings.ts` (4) throw `ValidationError extends DomainError`;
   `InvalidTokenError` re-bases.
4. `src/shared/middleware/error.ts:64-87` gains a `DomainError → status` branch alongside its
   `instanceof AppError` dispatch.

## Risks and trade-offs

- **Widening `index.ts` to satisfy the rule weakens the boundary it enforces.** Exporting
  `MetricAccessSequelize` makes a concrete Sequelize class part of metric's public API. Accepted:
  two features already import it directly, so this makes existing coupling visible rather than
  creating it. ADR-0044 names it as a candidate for a port.
- **An exact-count freeze is noisy by design.** A legitimate new association fails CI until someone
  edits the number. That is the intent, but it will read as a false positive to whoever hits it
  first — so the failure message must explain itself.
- **PR 2 touches every error path.** Mitigated by writing the characterisation tests before the
  refactor, not after.

## Rollback

No migration. PR 1 is revert-safe — imports and lint configuration only. PR 2 is revert-safe
provided AC-6 holds: if the envelope is unchanged, no client can distinguish the versions.

## Security and data

PR 2 touches the error envelope, which is a disclosure boundary — `error.ts:83` suppresses 5xx
messages in production. The `DomainError` mapping must not route a domain message into a 5xx path,
where it would newly be suppressed, nor into a 4xx that leaks internals. AC-6 is the guard.

PR 1 has no security surface: imports and lint config.

## Observability

If PR 2's mapping branch is wrong the symptom is a changed status code, not an exception — invisible
in logs. The characterisation tests are the detection mechanism; there is no runtime signal to
watch for.

## Success metrics

None stated. The acceptance criteria are the check.

## References

- `docs/internal/audits/saas-readiness/FINAL-AUDIT-SUMMARY.md` § 4, caveat C4
- `.claude/rules/architecture.md` — the rules this enforces
- `eslint.config.mjs:67-95` — the existing `no-restricted-imports` block this extends
- `__tests__/unit/architecture.test.ts` — the test that passes green today
