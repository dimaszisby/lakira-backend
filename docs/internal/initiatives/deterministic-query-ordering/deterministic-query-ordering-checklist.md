# Deterministic Query Ordering — Checklist

## Phase 0 — Kit and branch

- [x] Post-merge `dev` CI run `36697179482` green
- [x] Branch `fix/deterministic-query-ordering` off `dev` at `7ea5ec6`, `--no-track`
- [x] Kit: `README.md`, plan, this checklist, `decisions.md` (D-01–D-03)

## Phase 1 — Queries

- [x] `MetricReadRepoSequelize.ts` — logs by `loggedAt DESC, id DESC`
- [x] `TrendRepoSequelize.ts` — window, order and `date` by `loggedAt`, then `id`
- [x] `MembershipRepositorySequelize.ts` — three queries `joinedAt ASC, id ASC`
- [x] `VisualizationReadRepoSequelize.ts` — `ms.id DESC` tie-breaker
- [x] `findLatestByUserId` removed — port, implementation, two unit mocks, integration block

## Phase 2 — Tests

- [x] `MetricReadRepoSequelize.integration.test.ts` — backfill-order case replaces the
      timing-dependent one
- [x] `TrendRepoSequelize.integration.test.ts` (new) — backfill included, pre-window excluded
- [x] `MembershipRepositorySequelize.integration.test.ts` (new) — forced tie, three methods
- [x] `VisualizationReadRepoSequelize.integration.test.ts` — forced tie at `LIMIT`
- [x] New tests shown failing on the pre-fix source — 7/7 new cases failed (metric detail 1,
      trends 2, dashboard 1, memberships 3); metric-detail test passed 20/20 runs after the fix

## Discovered

- [x] Found: tied memberships were read through the `(user_id, organization_id)` unique index, so
      the first draft of the membership test passed on the old code by key order, not by luck of
      insertion → in scope, ids rearranged so heap order and index order both disagree with id
      order; all three cases then failed on the old code
- [x] Found in review: `OrganizationInviteRepositorySequelize.findPendingByEmailAndOrg` is a
      `findOne` with no order → not an ordering defect (its only caller treats any match as "exists");
      the real gap, a check-then-insert with no unique index, is out of scope, filed as
      `docs/internal/todos/2026-09-30-todo-pending-invite-uniqueness.md`

## Acceptance

- [x] AC-1 — `MetricReadRepoSequelize.integration.test.ts` › returns the latest logs by loggedAt
- [x] AC-2 — `TrendRepoSequelize.integration.test.ts` › both cases
- [x] AC-3 — `MembershipRepositorySequelize.integration.test.ts` › three cases
- [x] AC-4 — `VisualizationReadRepoSequelize.integration.test.ts` › breaks a priority and
      created_at tie
- [x] AC-5 — no reference in `src/` or `__tests__/`; gates green
- [x] AC-6 — `.claude/rules/database.md` § Query ordering; ADR-0052

## Gates

Final tree, Node 24.21.0, 2026-09-30.

- [x] typecheck — pass
- [x] lint — pass, 0 warnings
- [x] format — pass
- [x] tests — unit 649 pass; integration 217 pass, 5 skipped
- [x] build — pass
- [x] OpenAPI — spec regenerated (one added `description` line) and valid; regeneration is
      byte-identical on a second run, so `docs:openapi:check` passes once the spec is committed.
      Run uncommitted it exits 1 by design (`git diff --exit-code`).
- [x] security delta — skipped, no dependency change
- [x] extra: `contract:local:gate` — pass; seed 42, 42/47 selected, 1443 generated, the 2 known
      warnings

## Docs

- [x] `.claude/rules/database.md` — Query ordering section
- [x] `.claude/rules/testing.md` — ordering tests force ties
- [x] ADR-0052, registry row, next free moved to ADR-0053
- [x] `TrendDataPoint.date` description; spec regenerated
- [x] `2026-09-25-todo-integration-parse-error-flake.md` — fourth failure section
- [x] `error-envelope-residuals/README.md` — Phase 1 merged in #124
- [x] `docs/internal/todos/2026-09-30-todo-pending-invite-uniqueness.md` — filed from review

## Review

`code-reviewer` pass: 0 critical, 1 warning, 2 suggestions, verdict approve once the warning is
done.

- ADR-0052 cited in code before it existed, and the `database.md` rule not yet written — done in
  the docs step.
- `email-verification-checklist.md:12` still lists `findLatestByUserId` — left: a completed kit's
  record of what was built then.
- `findPendingByEmailAndOrg` has no order — see Discovered; filed as a todo.
- Confirmed by the reviewer: Sequelize sets `separate` for a `limit` on the hasMany logs include,
  so its `order` applies; `loggedAt` is `NOT NULL`, so the window filter drops nothing.
