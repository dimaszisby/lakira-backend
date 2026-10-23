# Metric access wiring — Checklist

Lean kit: the acceptance criteria are stated here. Checked against `origin/dev` at `f8b9ff8` (#213).

## Acceptance criteria

- **AC-1** — No `feature.ts` under `src/features` imports another feature; `architecture.test.ts`
  fails on one, and failed on `dev` naming the three. _Why:_ B-88 (D-01, D-02).
- **AC-2** — `KNOWN_BOTH_WAYS` is empty, and the test passes. _Why:_ B-88 (D-02).
- **AC-3** — Server and worker behave as before: the metric-log, metric-settings and analytics
  integration suites pass unchanged, and `GenerateDummyMetricLogsQueue` passes with RabbitMQ on.
  _Why:_ wiring only.
- **AC-4** — Every gate passes, and the OpenAPI spec is unchanged. _Why:_ no behaviour change.

## Phase 0 — kit and branch

- [x] `refactor/metric-access-wiring` cut with `--no-track` from `origin/dev` at `f8b9ff8`; HEAD
      and upstream verified
- [x] This kit: README, this file, `decisions.md` with D-01 and D-02; D-03 added when the
      overrides guard failed
- [x] #213's loose ends: `adr-registry-hygiene` D-01 and D-02 Accepted, README Done; B-83's Closed
      row names #213; "As of" `f8b9ff8`

## Phase 1 — guard first

- [x] `architecture.test.ts` › finds no feature.ts that imports another feature: failed on `dev`,
      naming `analytics`, `metric-log` and `metric-settings` `-> metric`

## Phase 2 — the changes

- [x] `metric-log/feature.ts`, `metric-settings/feature.ts`, `analytics/feature.ts`: `deps` with
      `metricAccess` first, `overrides = {}` second (D-03), no import of metric
- [x] `src/composition/features.ts`, `src/composition/metric-log.ts`
- [x] The three `application/ports/MetricAccessPort.ts` comments
- [x] `GenerateDummyMetricLogsQueue.integration.test.ts`: passes the adapter, keeping its no-op
      invalidator
- [x] `KNOWN_BOTH_WAYS` removed; the test expects no pair

## Phase 3 — gates, review, docs

- [x] Gates, below
- [x] Review of the diff: the first shape, `metricAccess` required inside the overrides bag, failed
      "all buildXFeature() accept overrides parameter"; D-03 split it out
- [x] ADR-0023 status note (decision 3); ADR-0056 status note
- [x] `.claude/rules/architecture.md`: § One wiring and § Export Convention
- [x] Register: B-88 to Closed
- [x] Notion Part 2: none

## Discovered

- "all buildXFeature() accept overrides parameter" requires every factory's parameter to default
  to `{}`: in scope, D-03.

## Acceptance

- [x] AC-1 — the new test; `grep -rn '@/features/' src/features/*/*/feature.ts` finds nothing
- [x] AC-2 — "finds no pair"
- [x] AC-3 — the integration run below, RabbitMQ on; `GenerateDummyMetricLogsQueue`, metric-log,
      metric-settings and analytics suites passed
- [x] AC-4 — the gates below; `docs:openapi:check` left the spec unchanged

## Gates

- [x] typecheck — clean
- [x] lint — clean
- [x] format — `prettier --check` on every touched file: clean
- [x] tests — `test:unit:coverage` 149 suites, 1532 tests passed, thresholds met;
      `test:integration:coverage` 43 suites passed (2 skipped), 303 tests passed (6 skipped),
      thresholds met, against throwaway Postgres 18, Redis 7 and RabbitMQ 3.13
- [x] build — clean
- [x] OpenAPI — `docs:openapi:check` clean, spec unchanged
- [ ] security delta — skipped: no dependency change
- [ ] image smoke — skipped: no `Dockerfile`, `.dockerignore` or dependency change
