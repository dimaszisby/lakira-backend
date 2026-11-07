# Boundary rule residuals — Checklist

## Phase 0 — kit and branch

- [x] `fix/boundary-rule-residuals` cut `--no-track` from `origin/dev` at `0ce4511`; HEAD and
      upstream verified
- [x] Kit: `README.md`, `boundary-rule-residuals-plan.md`, `boundary-rule-residuals-checklist.md`,
      `decisions.md` with D-01 to D-06
- [x] Loose ends from #134: the `fork-openapi-gate` kit's workflow item and AC-5 ticked (`Fork
Smoke` passed on the PR), its README, the todo and `FINAL-AUDIT-SUMMARY.md` say merged in #134
      (`0ce4511`)

## Phase 1 — rules first, shown failing

- [x] `eslint.config.mjs` — `APPLICATION_LAYER_INFRASTRUCTURE` on `application/` and `domain/`; a
      shared-code block for `src/types/`, `src/shared/`, `src/utils/`, `src/config/`;
      `src/utils/db-helper.ts` named as the models-only exception
- [x] `__tests__/unit/feature-boundaries.lint.test.ts` — the cases of AC-1 and AC-2
- [x] `npm run lint` on the unchanged source reported exactly the 10 known import lines and nothing
      else (5 in `src/types/`, 5 in `application/`); the eleventh, `UpdateMetric.ts`, was fixed in
      the same step as the move that would have created it

## Phase 2 — S5: metric's types go home

- [x] `src/types/dtos/metric.dto.ts` → `src/features/public/metric/infrastructure/http/metric.dto.ts`
- [x] `src/types/domain/metric.domain.ts` → `src/features/public/metric/domain/metric.domain.ts`
      (moved with `mv`, not `git mv`, so nothing was staged; `src/types/dtos/` is now gone)
- [x] `public.ts` of metric-category, metric-settings and metric-log — type-only exports for the
      three response DTOs and the category entity
- [x] The 8 importing files in the metric feature — paths updated

## Phase 3 — S6: the application layer lets go of infrastructure

- [x] `UpdateDisplayOptions.ts`, `UpdateMetricSettings.ts`, `UpdateMetric.ts` — own input types
- [x] `src/shared/application/ports/MessageHandlerPort.ts`; `RabbitMQConsumer.ts` and
      `GenerateDummyMetricLogsHandler.ts` use it
- [x] `src/shared/application/messaging/` holds the exchange and routing-key names;
      `topology.ts` re-exports them; `GenerateDummyMetricLogs.ts` imports from the new place
- [x] Tests that import a moved module — paths updated, assertions untouched

## Discovered

- [x] Found in review: the driver-package ban matched exact names, so `sequelize/types`,
      `@redis/client`, `amqp-connection-manager` and `pg` passed → in scope, it is now one pattern
      covering subpaths, scoped siblings and the rest of the installed drivers
- [x] Found in review: the infrastructure rule works by path name, so infrastructure kept outside
      an `infrastructure/` directory (`@/shared/middleware/*`, `@/utils/redis-client.js`) is not
      caught → not changed; no inner-layer file imports any today, and ADR-0058 states the limit
- [x] Found in review: no case covered the auth audience, or a feature import from
      `src/shared/application` and `src/shared/domain` → in scope, cases added
- [x] Not fixed: `db-helper.ts` may import a model as a value, not only as a type. ESLint's core
      rule cannot tell the two apart → left; the file imports types only today
- [x] Out of scope, already tracked: domain repositories importing from `application/` (audit R11)
      and `AppError` in application code (audit R7)

## Acceptance

- [x] AC-1 — `feature-boundaries.lint.test.ts` › application layer
- [x] AC-2 — `feature-boundaries.lint.test.ts` › shared code
- [x] AC-3 — `npm run lint`; `git diff` shows no `eslint-disable`
- [x] AC-4 — `npm test`; `docs:openapi:check`; `contract:local:gate`
- [x] AC-5 — `eslint.config.mjs` and ADR-0058

## Gates

Final tree, Node 24.21.0, 2026-10-04.

- [x] typecheck — pass
- [x] lint — pass, no `eslint-disable` added
- [x] format — pass
- [x] tests — unit 747 passed; integration 219 passed, 5 skipped
- [x] build — pass
- [x] OpenAPI — `docs:openapi:check` pass, no drift
- [x] security delta — skipped, no dependency change
- [x] image smoke — `docker:smoke` pass, six checks
- [x] extra: `contract:local:gate` — pass, 1442 generated

## Review

`code-reviewer` pass: 0 critical, 2 warnings, 4 suggestions. It confirmed no behaviour change by
reading each changed use case, the consumer and the topology, and no remaining violation by grep.

- Driver-package ban exact-match only — confirmed, fixed (see Discovered).
- Infrastructure rule by path name — confirmed, accepted and stated in ADR-0058.
- Tests missed the auth audience and the shared kernel's feature rule — fixed.
- `db-helper.ts` exception not limited to type imports — accepted (see Discovered).
- A `features/` path segment anywhere is rejected for shared code — accepted, commented in the
  config.
- `metric/domain` depends on metric-category's `public.ts` for one type — accepted; type-only, and
  the same reference existed before from `src/types/`.

## Docs (after review)

- [x] `docs/explanation/decisions/adr-0058-…md` and its registry row; next free number ADR-0059;
      D-02 and D-03 promoted
- [x] `adr-0044-…md` — dated status note pointing at ADR-0058
- [x] `.claude/rules/architecture.md` — Dependency Rules and the feature tree
- [x] `CLAUDE.md` — ADR count 58; the live-risk line
- [x] `docs/internal/todos/2026-10-03-todo-boundary-rule-types-and-application-infra.md` — fixed
- [x] `SAAS-BASE-CHECKLIST.md` top gaps item 3; `FINAL-AUDIT-SUMMARY.md` § 4 note and § 8
