# Decisions — architecture-boundaries

## D-01 — metric declares the trend port it consumes

- **Status:** Proposed
- **Date:** 2026-10-23

**Context.** metric's controller typed `GET /metrics/:metricId/trends` by analytics'
`GetMetricTrend`, imported from analytics' `public.ts`, while analytics' `feature.ts` imports
`MetricAccessSequelize` from metric's `public.ts`: each feature depended on the other, and metric
declared no port for the query it is handed (X48, A1020 § 6).
**Decision.** metric declares `MetricTrendPort` and `MetricTrendPoint` in
`application/ports/MetricTrendPort.ts`; its controller and router take the port. `src/app.ts` still
hands it analytics' `getMetricTrend`, which fits the port structurally. Analytics' `public.ts`
no longer exports the `GetMetricTrend` type. `architecture.test.ts` collects every
feature-to-feature import, other than imports of another feature's models (frozen separately,
ADR-0044), and fails on a pair that depends both ways.
**Options considered.** _Move `GetMetricTrend` into metric:_ it reads analytics' trend repository,
so analytics would then depend on metric's application layer. _A `contract.ts` in analytics:_ a
contract carries domain types, not ports (ADR-0078), and the dependency would remain.
**Consequences.** A port belongs to its consumer (ADR-0023), and metric no longer names analytics.
Found while exploring: metric also depends both ways on metric-log and metric-settings (metric's
`http/dto.ts` imports their response mappers; their `feature.ts` imports `MetricAccessSequelize`).
The test freezes those two pairs as the only exceptions; register row B-88 records them.

---

## D-02 — metric-category's list cache moves into infrastructure

- **Status:** Proposed
- **Date:** 2026-10-23

**Context.** `ListCategories`, an application query, built its cursor key with
`buildCursorCacheKey` and read and wrote the cache through its `CachePort`. The other three lists
cache at the route (X49).
**Decision.** Owner's choice, 2026-10-23. A `CachedMetricCategoryRepository` in
`infrastructure/cache/` wraps the repository: every method delegates, and `list` reads through the
cache with the key, the snapshot and the 300 s TTL `ListCategories` used. Key version 4 and the
entry format are unchanged. `ListCategories` calls `repo.list`; `feature.ts` hands it the wrapped
repository. The write use cases keep the `CachePort`, and use it only to invalidate.
`infrastructure/cache/cache.ts` (`invalidateAllMetricCategoryCache`) has no caller and is deleted.
**Options considered.** _Route middleware, as the siblings do:_ it caches the response rather than
entities, `cacheMiddleware` is off under `NODE_ENV=test`, and the category-list-cache-dates
integration test would need rewriting. _Leave it, and record it as accepted:_ the application
layer would keep building cache keys.
**Consequences.** The application layer names no cache key. A third way of caching exists (route,
invalidation port, repository decorator), each in infrastructure.

---

## D-03 — A cursor key requires an organization

- **Status:** Proposed
- **Date:** 2026-10-23

**Context.** `buildCursorCacheKey` typed `organizationId` as `string | null | undefined` and wrote a
missing one as `org:_`, so a caller without an organization would share one entry across tenants
(X49; ADR-0035).
**Decision.** It takes `organizationId: string`. The three cursor-key functions under
`infrastructure/http/cache-keys.ts` call `assertAuthenticated(req)` and pass
`req.user.organizationId`. Every such route runs after `authMiddleware`; if one did not, the throw
lands in `cacheMiddleware`'s catch, the cache is skipped, and the handler answers 401.
**Options considered.** _`?? ""` at each caller:_ it typechecks, and still writes a key with no
organization.
**Consequences.** The compiler refuses a cursor key with no tenant.

---

## D-04 — The tenant-scope test reads every file that names a cache key

- **Status:** Proposed
- **Date:** 2026-10-23

**Context.** "cache keys are tenant-scoped" picked files by a `/cache/` path segment,
`cacheMiddleware` or `buildCursorCacheKey`. `MetricSettingsCacheInvalidator.ts`, under
`providers/`, builds its patterns with `cursorCacheNamespace` and `invalidateCache`, and was never
read (X49).
**Decision.** A file that names `invalidateCache` (which covers `invalidateCacheByPattern`) or
`cursorCacheNamespace` is read too.
**Options considered.** _Read every file under `src`:_ the template check would then judge log
lines and messages that hold a user id.
**Consequences.** An invalidator anywhere in `src` is held to the same rule as the keys it deletes.

---

## D-05 — The frozen model counter reads feature names as the lint does

- **Status:** Proposed
- **Date:** 2026-10-23

**Context.** The counter in "cross-feature model associations are frozen" matched feature names of
`[a-z-]+` in double quotes. The lint's `FEATURE` takes any segment, `[^/]+`, so a feature with a
digit in its name, or an import in single quotes, would pass the lint's exemption and go uncounted
(X52).
**Decision.** Both regexes take `[^/"']+` and either quote. The sample test adds a single-quoted
import and a name with a digit. D-01's test reads imports with the same pattern.
**Options considered.** _Import the pattern from `eslint.config.mjs`:_ it is a string built for
`no-restricted-imports`, anchored differently, and not exported.
**Consequences.** The count stays 11.

---

## D-06 — Under `src`, `process` and `module` are read only as `x.y`

- **Status:** Proposed
- **Date:** 2026-10-23

**Context.** ADR-0078 refuses `process.getBuiltinModule` and `module.require`, and left open an
alias of either (`const p = process; p.getBuiltinModule(...)`): lint does not follow a value through
a variable. It rejected refusing every bare `process` because "`src` passes `process` to seams
today". It no longer does: `src` names `process` and `module` only as the object of a member
expression (X43's rest).
**Decision.** `NO_UNCHECKED_IMPORT_FORMS` refuses `process` or `module` anywhere else: assigned,
destructured, passed, returned. `no-restricted-properties` refuses `globalThis.process`,
`globalThis.module`, `global.process` and `global.module`. ADR-0078 gains a status note.
**Options considered.** _Leave it open:_ the alias is the one form of X43 that remained. _A
type-aware rule that follows values:_ a rule of the repository's own for one residual.
**Consequences.** A seam that needs `process` takes the members it uses. Still open: an alias of
`globalThis` itself (`const g = globalThis; g.process`).

---

## D-07 — A queue test waits for the job's commit, not only for its email

- **Status:** Proposed
- **Date:** 2026-10-23

**Context.** On #212, "Fork bootstrap and npm test" failed once and passed once on the same commit:
`PasswordResetEmailQueue.integration.test.ts` › retries a failed send counted 0 reset tokens where
1 was expected. Each email job sends inside `runOnce`'s transaction, before the token row (or the
invite's new hash) commits, and the tests polled only until the email was sent, then read the row
on another connection. The verification and invite queue tests do the same. Nothing in this
branch caused it.
**Decision.** After the email arrives, each of the three tests polls until the row it reads next
has committed: the token count for password reset and verification, the emailed token's hash for
invites. Both the happy path and the retry test of each file.
**Options considered.** _Send after the commit:_ a send that fails would then leave a token behind,
which the durable-email kits' D-02 and D-03 rule out. _Retry the job in CI:_ hides the race.
**Consequences.** The tests assert what a user sees: the link works once the job is done.
