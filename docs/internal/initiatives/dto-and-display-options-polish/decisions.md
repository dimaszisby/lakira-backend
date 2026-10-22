# Decisions — dto-and-display-options-polish

## D-01 — One DTO file per feature's `http/`

- **Status:** Accepted (#207, `41d09f7`)
- **Date:** 2026-10-22

**Context.** metric's `infrastructure/http/` had two DTO files: `dto.ts` with three response
mappers and `metric.dto.ts` with the types they return (T6). metric-log keeps both kinds in one
`dto.ts`, and every other feature has only a `dto.ts`.
**Decision.** `metric.dto.ts` folds into `dto.ts`, types first and mappers after, and is deleted.
**Options considered.** _Rename `dto.ts` to `metric.mappers.ts`:_ a third naming in a folder that
otherwise has one. _Move the mappers to `infrastructure/mappers/`:_ that folder holds persistence
mappers in metric, and the response mappers belong to the HTTP layer.
**Consequences.** One import path for metric's response types and mappers.

---

## D-02 — The entity's `DisplayOptionsProps` is metric-settings' one display-options shape

- **Status:** Accepted (#207, `41d09f7`)
- **Date:** 2026-10-22

**Context.** The shape `{ showOnDashboard, priority, chartType, color }` was the entity's
`DisplayOptionsProps`, written out again in the repository's `CreateMetricSettingsDTO` and again in
the Sequelize model's `displayOptions` attribute (T6). A field added to one would not reach the
others.
**Decision.** One declaration per layer, and nothing written out by hand. The repository's
create type refers to the entity's `DisplayOptionsProps` (same domain layer). The model's
attribute refers to `MetricDisplayOptions` in `src/types/db/metric-settings.types.ts`, which
declares the row and which the model already imports.
**Amended during implementation (2026-10-22).** As planned, the model took `DisplayOptionsProps`.
Then `MetricDisplayOptions` turned up, a fourth copy of the shape that the model's own attribute
base already uses. Pointing the model at the domain entity would have made persistence depend on
the entity for a row type it already has.
**Options considered.** _Make `MetricSettingsDisplayOptionsDomain` in `src/types/domain/` the
source:_ that folder is the cross-feature read view, readonly, and may not import a feature, so it
cannot be the owner's type. It stays as it is. _One type for every layer:_ `src/types/` may not
import a feature, and the entity owns the shape, so no single file can serve both.
**Consequences.** Three declarations stay, one per layer: the entity's (domain), the db types
(persistence), and the cross-feature read view. Three contracts keep their own on purpose: the
HTTP `DisplayOptionsDTO` (nullable `showOnDashboard`), the patch type `DisplayOptionsPatch`, and
the OpenAPI schemas.

---

## D-03 — The update use case does not take `isActive`; the entity still can

- **Status:** Accepted (#207, `41d09f7`)
- **Date:** 2026-10-22

**Context.** `UpdateMetricSettingsInput` was the entity's update props minus the two dates, so it
admitted `isActive`, which `execute` never copies (T6). The request body schema is `.strict()`
without `isActive`, so no request can send it. The entity's `updateDetails` applies `isActive`,
and `MetricSettingsRepositorySequelize.integration.test.ts` deactivates settings that way.
**Decision.** `UpdateMetricSettingsInput` omits `isActive` as well. The entity keeps it.
**Options considered.** _Copy `isActive` in `execute`:_ no request can carry it, and opening that
is a product decision, not polish. _Remove it from the entity:_ it drops a capability that is
tested, with no decision about deactivation.
**Consequences.** The input states what an update request can change. Deactivating through the
API would need its own schema field and a decision.
