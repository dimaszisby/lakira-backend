# DTO and display-options polish — Checklist

Lean kit: the acceptance criteria are stated here. Checked against `origin/dev` at `00fb2d2` (#206).

## Acceptance criteria

- **AC-1** — No exported type in a feature's `infrastructure/http/*dto*.ts` goes unreferenced
  outside its own file, and `architecture.test.ts` fails on one that does. _Why:_ T6 came back
  unchanged in two audit runs; a guard stops it regrowing.
- **AC-2** — Passing `isActive` to `UpdateMetricSettings.execute` is a type error. _Why:_ T6; the
  input says what `execute` honours.
- **AC-3** — metric-settings declares the display-options shape once, apart from the contracts
  D-02 keeps. _Why:_ T6.
- **AC-4** — `RabbitMQConsumer.ts` re-exports nothing, and metric's `http/` has one DTO file.
  _Why:_ T6.
- **AC-5** — The OpenAPI spec is unchanged, and every gate passes. _Why:_ a refactor.

## Phase 0 — kit and branch

- [x] `refactor/dto-and-display-options-polish` cut with `--no-track` from `origin/dev` at
      `00fb2d2`; HEAD and upstream verified
- [x] This kit: README, this file, `decisions.md` with D-01 to D-03
- [x] #206's loose ends: `proxy-trust-and-xss-clean` D-01 to D-03 Accepted, README Done; the
      register names `#206 (00fb2d2)` in B-81 and B-63; B-81's state `owner`, since each item
      left waits on the owner

## Phase 1 — tests first, each seen to fail

- [x] `architecture.test.ts` › every exported DTO type is used. Against `origin/dev`'s files, in a
      throwaway worktree, it named 15 types (AC-1)
- [x] `UpdateMetricSettings.test.ts` › takes no isActive: a `@ts-expect-error` call that
      typecheck reported as unused while the input admitted `isActive` (AC-2)

## Phase 2 — the change

- [x] The 16 types deleted, with the `zod` and schema imports they alone used, from five files
- [x] `metric.dto.ts` folded into `dto.ts` and deleted (D-01)
- [x] `CreateMetricSettingsDTO` takes `DisplayOptionsProps`; the model takes the db layer's
      `MetricDisplayOptions` (D-02, amended)
- [x] `UpdateMetricSettingsInput` omits `isActive` (D-03)
- [x] `RabbitMQConsumer.ts`: the re-export and the `MessageContext` import it alone used, removed

## Phase 3 — gates, review, docs

- [x] Review of the diff: no defect. `eslint.config.mjs` names the settings model among the files
      that may import another feature's models; the model's new import is from `@/types/db`, not
      a feature
- [x] Register: B-33 to Closed, naming the branch; "As of" `00fb2d2`
- [x] Notion Part 2: none. No route, schema or response changes

## Discovered

- [x] Found: `MetricDisplayOptions` in `src/types/db/metric-settings.types.ts`, a fourth copy of
      the shape that the model's attribute base already imports → in scope; D-02 amended so the
      model uses it
- [x] Found: once `metric.dto.ts` folded into `dto.ts`, its three response types were used only
      by the mappers beside them, and the first guard named them. They name the response, so the
      guard counts a use inside the file, and ignores comments, since a JSDoc `@typedef Name`
      would otherwise count as one. Under that rule `MetricLogListResponseDTO` was in use (the
      list mapper returned it); it went anyway, the mapper now returning `MetricLogResponseDTO[]`

## Acceptance

- [x] AC-1 — `architecture.test.ts` › every exported DTO type is used › names no type in an http
      DTO file that nothing references
- [x] AC-2 — `UpdateMetricSettings.test.ts` › takes no isActive; `typecheck`
- [x] AC-3 — `MetricSettingsRepository.ts` and `metric-settings.sequelize.ts` declare no shape of
      their own
- [x] AC-4 — `RabbitMQConsumer.ts` has no `export type {`, and metric's `infrastructure/http/`
      holds one DTO file, `dto.ts`
- [x] AC-5 — `docs:openapi:check` clean; the gates below

## Gates

- [x] typecheck — clean
- [x] lint — clean
- [x] format — `prettier --check` on every touched file: clean
- [x] tests — `test:unit:coverage` 149 suites, 1529 tests passed, thresholds met;
      `test:integration:coverage` 43 suites passed (2 skipped), 299 tests passed (6 skipped),
      thresholds met
- [x] build — clean
- [x] OpenAPI — `docs:openapi:check` clean
- [ ] security delta — skipped: no dependency change
- [ ] image smoke — skipped: no `Dockerfile`, `.dockerignore` or dependency change
