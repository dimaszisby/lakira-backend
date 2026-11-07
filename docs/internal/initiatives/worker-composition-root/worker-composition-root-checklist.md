# Worker Composition Root — Checklist

## Phase 0 — Kit and branch

- [x] Local `dev` fast-forwarded to `8222829`
- [x] Branch `fix/worker-composition-root` off `dev`, `--no-track`
- [x] Kit: `README.md`, plan, this checklist, `decisions.md` (D-01–D-04)
- [x] `graphify query` — worker consumers, metric-log handler, visualization invalidation

## Phase 1 — Proof first

- [x] `src/composition/metric-log.ts` — `buildWiredMetricLogFeature`, first with the worker's old
      wiring (the no-op) moved in verbatim
- [x] `src/features/public/metric-log/feature.ts` — `dummyLogsHandler`; `idempotency` override
- [x] `__tests__/unit/composition/metric-log.test.ts` — on the old wiring, "the queue handler
      clears the analytics caches for the job's metric" failed (1 failed, 2 passed)
- [x] Wiring switched to `AnalyticsVisualizationInvalidationAdapter`; the test passes

## Phase 2 — Entry points

- [x] `src/features/public/analytics/public.ts` — exports the adapter (D-06); `index.ts` re-exports
      it
- [x] `src/worker.ts` — handler from `buildWiredMetricLogFeature()`; five deep imports and the
      no-op import removed
- [x] `src/features/public/metric-log/infrastructure/http/controller.ts` —
      `installMetricLogFeature`; the test hook is an alias of it
- [x] `src/server.ts` — `installMetricLogFeature(buildWiredMetricLogFeature({ messageQueue }))`
- [x] `GenerateDummyMetricLogsQueue.integration.test.ts` — handler from the shared wiring
- [x] `__tests__/unit/architecture.test.ts` › entry points share one wiring — eight rules, the
      three matchers each shown rejecting a violating sample

## Phase 3 — Live verification

Built server and worker, `NODE_ENV=development`, `RABBITMQ_ENABLED=true`, port 5055, local Redis
and RabbitMQ; register, create a metric, request both analytics endpoints, queue five dummy logs,
wait for the five rows. Run twice, the second time on the final code.

- [x] New worker: `viz:` keys 1 before, 0 after; `vizdash:` keys 2 before, 0 after
- [x] Old worker (built from `dev` at `8222829`): `viz:` 1 before, 1 after; `vizdash:` 1 before,
      1 after
- [x] Left behind: two users named `r5live<timestamp>` with their metrics and logs in the local
      development database; no cache keys (the new worker cleared them), no queued messages

## Phase 4 — Review, then fix

- [x] `code-reviewer` pass; each finding confirmed before acting — see Review

## Phase 5 — Docs

- [x] ADR-0056; registry row; next free moved to ADR-0057
- [x] `decisions.md` — D-01, D-02, D-05, D-06 collapsed to pointers
- [x] ADR-0045 — status note: `src/composition/` may import `feature.ts`
- [x] `CLAUDE.md` — ADR count 55 → 56
- [x] `.claude/rules/architecture.md` — § Manual Dependency Injection and § Export Convention
- [x] `docs/explanation/architecture/` — not changed: it does not describe the worker's wiring
- [x] `2026-09-24-todo-inject-features-into-router-factories.md` — worker section done; the rest
      stays open
- [x] `SAAS-BASE-CHECKLIST.md` § Top gaps item 8 — R5
- [x] Carried from #129: `build-image-in-ci` README merged, its three open checklist items ticked
      with the run ids, the R6 todo merged
- [x] Notion — no record: nothing the frontend sees changes

## Discovered

- [x] Found: importing analytics' `index.ts` loaded express and every rate limiter into the worker
      (review; one rate-limiter log line in the new worker, none in the old) → in scope, D-06
- [x] Found: a failed post-commit invalidation was never repaired, because its retry is a
      duplicate and the handler returned before invalidating (review) → in scope, D-05
- [x] Found: the ESLint boundary rules do not cover `src/composition/` (review) → in scope as an
      architecture test rather than lint configuration, D-06

## Acceptance

- [x] AC-1 — `__tests__/unit/composition/metric-log.test.ts`, with the recorded failure
- [x] AC-2 — `architecture.test.ts` › takes the metric-log feature from the shared wiring;
      › src/worker.ts imports no feature internals
- [x] AC-3 — `architecture.test.ts` › src/server.ts calls no test hook
- [x] AC-4 — `architecture.test.ts` › no file in src/ reaches for the no-op invalidator, and the
      matcher tests
- [x] AC-5 — Phase 3
- [x] AC-6 — `GenerateDummyMetricLogsQueue.integration.test.ts` passes, unmodified apart from how
      it obtains the handler

## Gates

Final tree, Node 24.21.0, 2026-10-03.

- [x] typecheck — pass
- [x] lint — pass
- [x] format — pass
- [x] tests — unit 689 pass (675 + 3 composition + 11 architecture); integration 219 pass, 5
      skipped
- [x] build — pass
- [x] OpenAPI — skipped: no route, schema or `src/lib/openapi/**` change
- [x] security delta — skipped: no dependency change
- [x] image smoke — pass

## Review

`code-reviewer` pass (read-only): 0 critical, 4 warnings, 3 suggestions.

- The worker loaded the analytics router chain at import, building every rate limiter —
  confirmed in the live run's worker log. Fixed by D-06; the rerun shows no rate-limiter line.
- ESLint's boundary rules do not reach `src/composition/` — confirmed. An architecture test now
  restricts its feature imports to `feature.ts` and `public.ts`; ADR-0056 and a status note on
  ADR-0045 record the widened surface.
- A failed invalidation after commit could not be repaired by its retry — confirmed by reading
  the handler and the consumer; older than this change, made likelier by it. Fixed by D-05.
- ADR-0056 was cited before it existed — written in Phase 5, as planned.
- The architecture rules were bypassable by importing the factory directly — tightened: neither
  entry point may import `metric-log/feature` or name `MetricLogCacheRedis`. An aliased import or
  an inline stub would still pass; recorded in ADR-0056 § Consequences.
- `overrideMetricLogFeatureForTest` is a second name for `installMetricLogFeature` — kept, it has
  test callers; it goes with the router-factory todo.
- Confirmed by the reviewer: nothing the worker now constructs opens a connection or reads env;
  the server's installed feature is equivalent to before; the aliases resolve in tsc, in `dist`
  and in jest; the unit test cannot pass on the no-op wiring.
