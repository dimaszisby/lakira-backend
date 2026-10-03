# ADR-0056 — Every entry point takes a feature from one shared wiring

- **Status:** Accepted
- **Date:** 2026-10-03
- **Related:** audit finding R5 (`docs/internal/audits/saas-readiness/audit-2026-09-29.md` § 6);
  extends [ADR-0045](./adr-0045-feature-modules-construct-nothing-on-import.md) (which surfaces a
  feature exposes, and to whom) and applies
  [ADR-0023](./adr-0023-cross-feature-metric-access-provider.md) (a port belongs to
  its consumer); the worker's deployment is
  [ADR-0040](./adr-0040-worker-process-deployment-topology.md); the transaction the handler relies
  on is [ADR-0007](./adr-0007-processed-messages-table-for-idempotency.md)
- **Origin:** `D-01`, `D-02`, `D-05` and `D-06` in the worker-composition-root kit —
  [`worker-composition-root`](../../internal/initiatives/worker-composition-root/decisions.md)

---

## Context

The application runs as two processes: the HTTP server (`src/server.ts`) and the queue worker
(`src/worker.ts`). Both need the metric-log feature. The server built it through
`buildMetricLogFeature`, passing the analytics feature's cache invalidator. The worker did not use
the factory: it constructed the dummy-log handler itself, from five imports into the feature's
internals, and passed `NoopVisualizationInvalidation` where the server passed the real adapter.

So the same job behaved differently depending on which process ran it. Handled inline by the
server, generating logs cleared the analytics caches (`viz:…` and `vizdash:…`). Handled by the
worker, it cleared the metric-log caches and left the analytics ones, and charts stayed stale
until their TTL expired. A live run on 2026-10-03 showed both keys surviving a queued job.

Nothing flagged it. The no-op is the factory's default for tests, the worker's imports were legal
because the boundary lint rules cover `src/features/**` only, and the integration test that
claimed to build the consumer "exactly as src/worker.ts builds it" had copied the wiring, no-op
included. The server, for its part, installed its production feature through a function named
`overrideMetricLogFeatureForTest`.

## Decision

1. **A feature's factory builds its queue handlers.** `buildMetricLogFeature` returns
   `dummyLogsHandler` alongside the use cases, constructed from the same cache, repository and
   access port.
2. **One function wires a feature for production, and every entry point calls it.**
   `buildWiredMetricLogFeature` in `src/composition/metric-log.ts` supplies the adapters that come
   from other features. Its overrides are for what legitimately differs per process: the server
   passes its message queue; the worker passes nothing.
3. **Entry points do not reach into features.** `src/worker.ts` imports no feature's `domain/`,
   `application/` or `infrastructure/`, and neither entry point calls `buildMetricLogFeature`
   directly or constructs its cache. `src/server.ts` installs the feature through
   `installMetricLogFeature`, not a test hook.
4. **`src/composition/` imports a feature through its `feature.ts` or `public.ts`, never its
   `index.ts`.** `index.ts` exports the router, and importing it loads express, the auth middleware
   and every rate limiter into whatever process imports the composition file. Analytics gains a
   `public.ts` exporting only the invalidation adapter. This widens ADR-0045, which reserved
   `feature.ts` for `src/server.ts`: `src/composition/` is now its second legitimate importer.
5. **A duplicate delivery invalidates the caches too.** The handler invalidates after the rows
   commit. If that fails, the retry finds the dedup record and resolves "duplicate"; it used to
   return there, so the retry could never repair the stale caches.
6. **`__tests__/unit/architecture.test.ts` enforces 2 to 4**, and forbids
   `NoopVisualizationInvalidation` anywhere in `src/` except its own file and the factory's
   default.

## Options considered

- **Change the one line in the worker.** Rejected: two wirings of one feature remain, and they
  drift again the next time a dependency is added.
- **A separate worker factory.** Rejected: a second factory is the same problem in a smaller place.
- **Make the invalidator a required argument.** Rejected: the architecture test requires every
  factory to take an optional overrides bag, and every unit test that builds the feature would
  change. The default stays, fenced by a test.
- **Wire it in `src/server.ts` and import that from the worker.** Rejected: importing `server.ts`
  starts the HTTP server.
- **Pass the built feature into the router factory and delete the module-level slot.** The cleaner
  end state, deferred: it rewrites every controller and about 40 test call sites
  (`docs/internal/todos/2026-09-24-todo-inject-features-into-router-factories.md`).
- **Treat post-commit invalidation as best-effort.** Rejected: it gives up the retry that decision
  5 makes useful.

## Consequences

- **A queued job now clears the analytics caches**, as the inline path does. The worker runs two
  more Redis `SCAN` loops per job, bounded by the user's own keys.
- **The worker constructs use cases it never calls.** They are plain objects with no connections.
- **A new top-level directory, `src/composition/`.** A feature that needs an adapter from another
  feature is wired there; a feature that needs none keeps being built by its controller.
- **Only metric-log is wired this way today**, because only metric-log is used by two processes.
  The next feature the worker consumes follows the same shape.
- **The safety is a test, not the type system.** The architecture test matches import specifiers
  and names; a determined bypass (an aliased import, an inline stub) would pass it.
- **A redelivered, already-finished job invalidates once more.** Harmless.
- **The module-level feature slot and the `override…ForTest` hooks remain** until the router-factory
  todo is done. `overrideMetricLogFeatureForTest` is now an alias of `installMetricLogFeature`.

## Links

- Kit: `docs/internal/initiatives/worker-composition-root/`
- Wiring: `src/composition/metric-log.ts`
- Factory: `buildMetricLogFeature` in `src/features/public/metric-log/feature.ts`
- Handler: `src/features/public/metric-log/application/use-cases/GenerateDummyMetricLogsHandler.ts`
- Guard: `__tests__/unit/architecture.test.ts` › entry points share one wiring
