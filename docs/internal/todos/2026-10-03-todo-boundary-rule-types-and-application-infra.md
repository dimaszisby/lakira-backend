# Todo — the boundary rule misses `src/types/` and application-to-infrastructure imports

- **Status:** Fixed in kit
  [`boundary-rule-residuals`](../initiatives/boundary-rule-residuals/README.md) (branch
  `fix/boundary-rule-residuals`, ADR-0058). C4 stays open in the audit until a dated run confirms it
  (ADR-002)
- **Created:** 2026-10-03
- **Owner:** unassigned
- **Origin:** `docs/internal/audits/saas-readiness/audit-2026-10-03.md` § 6, S5, S6; kit `saas-reaudit-2026-10-03` D-04

---

## What

C4 stays open on two routes the 2026-09-29 fix (#123) does not cover.

- **S5.** `src/types/domain/metric.domain.ts:9` and `src/types/dtos/metric.dto.ts:8-13` import other
  features' domain entities and HTTP DTOs, and feature code imports those types
  (`GetMetricDetail.ts:7`, `UpdateMetric.ts:1`). The boundary rule covers `src/features/**` only.
- **S6.** Application code imports infrastructure: `UpdateDisplayOptions.ts:5` and
  `UpdateMetricSettings.ts:5` (HTTP DTOs), `GenerateDummyMetricLogs.ts:9` (queue topology),
  `GenerateDummyMetricLogsHandler.ts:1,7` (`amqplib`, the consumer). The application-layer rule
  (`eslint.config.mjs:115-119`) bans the models barrel alone.

Earlier history of the rule: `2026-09-22-todo-feature-boundary-rule-scope.md`. Blocks the GOLD
restatement.

## Suggested fix

Extend the boundary patterns to `src/types/`, or move those types into the features that own
them. Add an application-layer rule banning `**/infrastructure/**`, and move the DTO and queue types
it flags behind application-owned types or ports. Persist a negative case for each, as #123 did.
