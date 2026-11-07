# Boundary rule residuals — Plan

- **Status:** Done — approved 2026-10-04, complete on `fix/boundary-rule-residuals`
- **Appetite:** 1 day — past that, cut scope rather than extend
- **Date:** 2026-10-04

## Context and goals

The 2026-10-03 audit kept caveat C4 open at P2. What the previous fix (#123) covered holds, but two
routes around the feature-boundary rule still pass green:

- **S5.** `src/types/` imports other features' internals, and feature code imports those types.
  The boundary rule covers `src/features/**` only.
- **S6.** Application code imports infrastructure. The application-layer rule bans the ORM models
  barrel and nothing else.

C4 is the last item blocking the GOLD restatement (`FINAL-AUDIT-SUMMARY.md` § 4).

**Outcome:** both routes are closed in code and rejected by lint, with persisted negative cases, and
no behaviour changes.

### What was counted

The scope is smaller than the audit's "up to a day each" suggested.

**S5 — 2 files in `src/types/`, 5 import lines:**

| File                                | Imports                                                                                            | Who uses the file                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `src/types/dtos/metric.dto.ts`      | metric's own Zod schema; the response DTO types of metric-category, metric-settings and metric-log | 2 files, both in the metric feature |
| `src/types/domain/metric.domain.ts` | metric-category's domain entity                                                                    | 6 files, all in the metric feature  |

Both files are the metric feature's own types living in a shared folder. The other eleven files in
`src/types/` import no feature and are not touched.

**S6 — 4 files, 5 import lines:**

| File                                             | Imports                                                   |
| ------------------------------------------------ | --------------------------------------------------------- |
| `metric-settings/…/UpdateDisplayOptions.ts`      | an HTTP DTO type                                          |
| `metric-settings/…/UpdateMetricSettings.ts`      | an HTTP DTO type                                          |
| `metric-log/…/GenerateDummyMetricLogs.ts`        | exchange and routing-key names from the queue topology    |
| `metric-log/…/GenerateDummyMetricLogsHandler.ts` | `amqplib`'s message type, and the consumer's context type |

A sixth appears once S5's file moves: `metric/…/UpdateMetric.ts` takes its input type from the HTTP
DTO file.

## Acceptance criteria

- **AC-1** — Lint rejects, from an `application/` file, a relative import into `infrastructure/`, an
  aliased one into `@/shared/infrastructure/`, one into `@/infrastructure/`, and `amqplib`; and
  still allows ports and domain imports. Each case is persisted in
  `__tests__/unit/feature-boundaries.lint.test.ts`. _Why:_ S6; ADR-0044 decision 6 says a rule is
  trusted only once it is seen to reject.
- **AC-2** — Lint rejects, from a file in `src/types/`, `src/shared/`, `src/utils/` and
  `src/config/`, a feature import in both spellings, `public.ts` included; persisted the same way.
  _Why:_ S5.
- **AC-3** — `npm run lint` passes with no `eslint-disable` added, no file under `src/types/`
  importing a feature, and no `application/` file importing infrastructure. _Why:_ the rules must
  hold on the real tree, not only on samples.
- **AC-4** — No behaviour change: unit and integration tests pass without assertion changes other
  than import paths, `docs:openapi:check` shows no drift, and the contract gate passes. _Why:_ this
  is a move and a rule, not a feature.
- **AC-5** — The exceptions are three, each named in `eslint.config.mjs` and in ADR-0058. _Why:_ an
  unnamed exception is how the last gap went unseen.

## Open questions

None.

## Out of scope

- **R7** (37 application files import `AppError`, which carries an HTTP status) and **R11** (domain
  repositories import a transaction type from the application layer). Both are open P3 findings
  with their own history. So "DDD compliance" on the scorecard may stay Partial after this, even
  with C4 closed.
- The other eleven files in `src/types/`. They import no feature.
- A feature-owned "enqueue job" port (see D-06).
- The dated audit run that restates C4. It is the next task.

## Decisions expected

All six were settled at planning and are in `decisions.md` as D-01 to D-06: where metric's types
live, what shared code may import, what the application layer may import, who owns a use case's
input type, what a message handler receives, and where the exchange and routing-key names live.

## Phases

### Phase 1 — rules first, shown failing

The lint rules and their persisted cases go in before any code moves, so `npm run lint` on the
unchanged source lists exactly what has to change.

### Phase 2 — S5: metric's types go home

`metric.dto.ts` and `metric.domain.ts` move into the metric feature; sibling features' `public.ts`
gain type-only exports.

### Phase 3 — S6: the application layer lets go of infrastructure

Use cases declare their own input types; the message a handler receives becomes an application
type; the exchange and routing-key names move beside the queue port.

## Risks and trade-offs

- **The rules are text patterns on import paths.** A re-export through an allowed file gets past
  them, as with every rule in this config. ADR-0058 says so.
- **`IncomingMessage` is narrower than `amqplib`'s type.** A handler that later needs another
  message field has to add it to the port. That is the intended friction.
- **File moves touch import paths in tests.** If any test asserts on a moved path as a string, it
  is updated and listed under Discovered.

## Rollback

Revert-safe: no migration, no data, no dependency, no API change.

## References

- `docs/internal/audits/saas-readiness/audit-2026-10-03.md` § 4.1 (C4) and § 6 (S5, S6)
- `docs/internal/todos/2026-10-03-todo-boundary-rule-types-and-application-infra.md`
- `docs/internal/initiatives/saas-reaudit-2026-10-03/decisions.md` D-04
- ADR-0044, ADR-0023
