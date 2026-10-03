# Worker Composition Root — Plan

- **Status:** Done
- **Appetite:** 1 day — past that, cut scope rather than extend (first cut: the `server.ts` hook)
- **Date:** 2026-10-03

## Context and goals

Audit finding R5 (P2). `src/worker.ts` builds the dummy-log queue handler by hand, with
`new MetricLogCacheRedis(new NoopVisualizationInvalidation())`; `src/server.ts` builds the same
feature with the real `AnalyticsVisualizationInvalidationAdapter`.

- The worker does reach Redis (`src/utils/redis-client.ts` connects on import), so after a queued
  job it clears the metric-log list and stats caches.
- It does not clear the analytics caches (`viz:<org>:<user>:<metric>:*` and
  `vizdash:<org>:<user>:*`), because its invalidator is the no-op. Charts stay stale until the TTL
  expires. The same request handled inline by the HTTP process clears them.

Two things made this possible. The worker is a second composition root: it re-creates wiring that
`buildMetricLogFeature` already owns, through deep imports into feature internals. And `server.ts`
installs the real feature through `overrideMetricLogFeatureForTest`, a test hook.

When this lands, one function wires the metric-log feature for production, both entry points use
it, the worker takes its handler from the feature, and a test fails if either drifts again.

## Acceptance criteria

- **AC-1** — The handler the worker runs clears `viz:<org>:<user>:<metric>:*` and
  `vizdash:<org>:<user>:*` after a job commits. A unit test drives the handler from
  `buildWiredMetricLogFeature` against a mocked Redis and asserts those keys are deleted; with the
  worker's old wiring the same test fails.
  _Why:_ R5: queued jobs leave analytics stale until TTL.
- **AC-2** — `src/worker.ts` and `src/server.ts` both obtain the metric-log feature from
  `buildWiredMetricLogFeature`, and `src/worker.ts` imports nothing from a feature's `domain/`,
  `application/` or `infrastructure/`.
  _Why:_ R5: "a second, hand-wired composition root".
- **AC-3** — `src/server.ts` no longer calls a `…ForTest` function.
  _Why:_ R5's evidence: "production wiring through `overrideMetricLogFeatureForTest`".
- **AC-4** — An architecture test fails if `NoopVisualizationInvalidation` is referenced anywhere
  in `src/` other than its own file and `metric-log/feature.ts`, or if `src/worker.ts` deep-imports
  a feature.
  _Why:_ the defect was a silent default; it must not be reachable from an entry point again.
- **AC-5** — A live run shows it: with server and worker running against local Redis and RabbitMQ,
  an analytics response is cached, a queued dummy-log job runs, and the `viz:` key is gone. On the
  old worker the key is still there.
  _Why:_ Redis is off under `NODE_ENV=test`, so only a live run exercises the real adapter.
- **AC-6** — The existing queue integration tests pass with unchanged behaviour.
  _Why:_ the handler's construction moves; what it does must not.

## Open questions

None. No API, schema or contract change, so no Notion record.

## Out of scope

- Injecting built features into router factories and removing the module-level slots and the
  `override…ForTest` hooks (`2026-09-24-todo-inject-features-into-router-factories.md` stays open).
- The other features' wiring: only metric-log has a second composition root.
- The worker's shutdown and deployment (ADR-0040 is Proposed).
- R7 (the handler maps HTTP status codes) and R8 (queue design).
- Restating R5 in the audit: only a dated run does that (ADR-002).

## Decisions expected

- Where a feature's queue handlers are built, and how entry points obtain a feature (D-01)
- Where the shared wiring lives (D-02)
- Whether the no-op default stays in `buildMetricLogFeature` (D-03)
- How `server.ts` installs the feature without the test hook (D-04)

## Phases

### Phase 0 — Kit and branch

### Phase 1 — Proof first

`buildMetricLogFeature` returns `dummyLogsHandler`, built from the same `access`, `cache` and
`repo` as the use cases, with a new `idempotency` override. `src/composition/metric-log.ts` gets
`buildWiredMetricLogFeature`, first with the worker's old wiring moved in verbatim, so the new unit
test is seen to fail before the wiring is corrected.

### Phase 2 — Entry points

The analytics adapter is exported from the analytics `index.ts`. `src/worker.ts` takes its handler
from the shared wiring. The metric-log controller exports `installMetricLogFeature`, which
`src/server.ts` calls; the test hook delegates to it. The queue integration test takes its handler
from the shared wiring. Two architecture rules guard it.

### Phase 3 — Live verification

Server and worker against local Redis and RabbitMQ, before and after.

### Phase 4 — Review, then fix

### Phase 5 — Docs

ADR-0056, the architecture rule, the related todo, the audit checklist, and the loose ends of #129.

## Risks and trade-offs

- The worker now runs two Redis `SCAN` loops per job, as the HTTP path already does.
- The worker also constructs the HTTP use cases it never calls: plain objects, no connections.
- A new top-level `src/composition/` directory.

## Rollback

Code: revert-safe. No migration, env var, dependency or data-shape change.

## Observability

After a queued job the worker logs the same cache-invalidation line as the HTTP path.

## References

- `docs/internal/audits/saas-readiness/audit-2026-09-29.md` § 6 (R5)
- ADR-0045 (feature modules construct nothing on import), ADR-0023 (a port belongs to its consumer)
