# Todo — tenant-scoped cache keys (ADR-0035) + production-unsafe env refusal (ADR-0036)

- **Status:** Complete — delivered by #64 (`f5f28b9`)
- **Created:** 2026-08-23
- **Completed:** 2026-08-23
- **Owner:** dimaszisby
- **Branch:** `fix/tenant-scoped-cache-keys` (off `dev` @ `fc9ee9b`)

Closes the two P0s (N1, N2), the systemic P1 (N3), and the HIGH (F1) from
`docs/internal/audits/saas-readiness/audit-2026-06-05.md` — the findings that held the SaaS verdict
at _GOLD WITH CAVEATS — DOWNGRADED_ and had been deferred twice, most recently by `638d75b`.

Both ADRs move from **Proposed** to **Accepted**.

---

## What was actually wrong

Every Redis cache key was scoped by `userId` alone. The repository layer is correctly org-scoped
across 8 repos, but the cache sits _in front_ of it, so a cache hit bypassed that boundary entirely.

### Corrections to the audit, established by reading the code

**1. The blast radius was wider than the P0.** The audit rated N3 "structural". It was not — five
live read-path keys were org-less, all handed to `cacheMiddleware`, which caches the whole HTTP
response body. Three were named in the plan; **two more (`metricSetting:`, `category:`) were found
by the new architecture test after it was written**, which is a fair argument for the test.

**2. The audit overstated the `buildCursorCacheKey` risk.** All five call sites already passed
`["org", …]`. Cursor keys were correctly scoped; the work there was hardening the signature.

**3. Exposure on `viz:` is narrower than "silent disclosure" implies — but real.**
`assertOwnership` runs before the cache read, so a cross-org single-metric hit needs the same metric
UUID in both orgs (reachable via the deliberately org-unscoped `originalMetricExists`). The
unambiguous live bug was invalidation: `vizdash:${userId}:*` wiped a user's dashboard cache for
_every_ org on any single-org log mutation.

### Three bugs found en route, not in the audit

- **The metric-log cursor cache was never invalidated.** The writer used
  `METRIC_LOG_CURSOR_FEATURE = "metric-logs.js"` while the invalidator built
  `cursorCacheNamespace("metric-logs", "*")`. Glob `cursor:metric-logs:v*` cannot match
  `cursor:metric-logs.js:v3:…`. The stray `.js` was a bad ESM-codemod artifact (`metric-settings`
  and `metrics` had no suffix). Same artifact in `metric-categories.js`.
- **Dead invalidation patterns.** `logs:${userId}:…`, bare `logStats:${userId}`, and
  `metrics:${userId}:*` had no writer at all. Deleted rather than org-scoped.
  `invalidateAllMetricCategoryCache` has **no callers** — left in place but org-scoped.
- **Silent positional-argument hazard.** Adding `organizationId` as the second parameter meant
  existing calls like `invalidateMetrics(userId, metric.id)` silently rebound `metric.id` to
  `organizationId` — **TypeScript cannot catch this**, both are `string` and the later params are
  optional. Every call site was audited by hand rather than trusting the compiler. This is the
  single riskiest part of the change.

---

## What changed

### Cache keys — org segment after the namespace, before the user segment

```
viz:{orgId}:{userId}:{metricId}:{bucketIso}:{hash}
vizdash:{orgId}:{userId}:{bucketIso}:{hash}
log:{orgId}:{userId}:{logId}
logStats:{orgId}:{userId}:{metricId|all}
metric:{orgId}:{userId}:{metricId}:inc:…:ll:…
metricSetting:{orgId}:{userId}:{settingsId}
category:{orgId}:{userId}:{categoryId}
cursor:{feature}:v{n}:{userId}:org:{orgId}:{…}
```

`organizationId` is in both the visible prefix and the hashed raw string, per ADR-0035.

**ETags are unchanged.** `deriveEtagSeed` hashes the cacheKey _object_, which already carried
`organizationId`; only the two builder _functions_ were touched, so no dashboard ETag churned and
no client sees a spurious `200` instead of `304`.

### Signatures threaded with `organizationId`

`VisualizationInvalidationPort` · `AnalyticsVisualizationInvalidationAdapter` · metric-log
`CachePort` · `MetricLogCacheRedis` · metric `CachePort` · `MetricCacheRedis` · metric-settings
`CacheInvalidationPort` · `MetricSettingsCacheInvalidator` · `invalidateAllMetricCategoryCache`
— plus **14 use-case call sites**, each of which already had `organizationId` destructured for its
repository call one line above.

### `buildCursorCacheKey` hardened

`organizationId` is now a required property rather than an optional `segments` entry. Emitted key
shape is unchanged (the segment sits where `["org", …]` already put it), so no cache churn.

### Architecture test (ADR-0035 §Decision item 3)

`__tests__/unit/architecture.test.ts` now fails CI if any cache-key template references a user id
without a sibling organization reference. Comments are stripped first, so a commented-out generator
does not trip it. **Verified to have teeth**: reverting one key to its org-less form fails the
suite; restoring it passes.

### Cursor feature constants extracted

`metric/application/cache.constants.ts` and `metric-log/application/cache.constants.ts`, mirroring
the existing `metric-category` pattern — so writer and invalidator can no longer disagree about a
namespace, which is what caused the `.js` bug.

### ADR-0036 — production refusal

A single **object-level** `.superRefine` on `envSchema` refusing, when `NODE_ENV=production`:
`DISABLE_RATE_LIMITING=true`, `ALLOW_TEST_HTTP_SERVER=true`, `SWAGGER_REQUIRE_AUTH=false`, and
default `guest` `RABBITMQ_USER`/`RABBITMQ_PASSWORD` when `RABBITMQ_ENABLED=true`.

Object-level rather than field-level for two reasons:

- It reads the **normalized** `data.NODE_ENV`, so `NODE_ENV=Production` is caught. The audit's
  suggested `process.env.NODE_ENV === "production"` would have missed it — there is a test for this.
- **It leaves `zodEnv.ts:188-191` byte-identical.** `scripts/security/security-delta-check.mjs:255`
  greps that source text for `/DISABLE_RATE_LIMITING[\s\S]*?\.default\("false"\)/` and emits a
  high-severity `AUTO-CFG-RATE-LIMIT-001` finding if it stops matching, which would block CI.
  Verified still matching.

### Error surface fixed

`zodEnv.ts` ended with `const env: Env = buildEnv()`, evaluated at module load — so a rejection
threw while `envManager.js` was still importing the module, _before_ `loadEnvOrExit()`'s try/catch
existed. The failure surfaced as a raw `ZodError` stack, not the structured `[ENV_ERROR]` line
ADR-0036 stakes its monitoring story on.

Nothing imported that `env` binding (only `Env` and `buildEnv`), so it was **deleted** rather than
made lazy — no proxy, no abstraction. `envManager.loadEnvOrExit()` is now the single parse entry
point. Confirmed end-to-end: `NODE_ENV=production DISABLE_RATE_LIMITING=true` exits before binding
a listener and prints `[ENV_ERROR] {…}` naming the variable.

---

## Verification

```
lint / typecheck / format:check     0
docs:openapi:check                  0, no drift
test:unit                           525 passed, 85 suites
test:integration                    172 passed, 26 suites (ENABLE_REDIS_INTEGRATION=true —
                                    the Redis-gated suites are skipped by default and DID run)
test:contract:local                 5/5 collections, 60 assertions, 0 failures
test:unit:security-framework        9 passed
security:delta:gate                 passed=true, blocking=0, 2 medium (unchanged)
```

The decisive evidence is the live-Redis integration run: `VisualizationCacheRedis.integration.test.ts`
writes org-scoped keys and its invalidation case passes, proving the new SCAN patterns actually
match the new key shape. A key-shape change and an invalidation-pattern change have to land
atomically or invalidation silently stops working — that test is what proves they did.

New tests: cross-org key distinctness (single + dashboard), 8 env-refusal cases, and the arch rule.
`VisualizationCacheRedis.test.ts` previously **mirrored the key algorithm** to compute its
expectations, so it would have kept passing against org-less keys; it now asserts hard-coded
literals.

---

## Deliberately not done

- **`SKIP_DB_LIFECYCLE`** — a sixth ADR-0036 candidate, but it bypasses the schema entirely
  (`server.ts:74` reads `process.env` directly) and `jest.setup.ts` / `env-test-utils.ts` mutate it
  after the env is built. Tracked as **TF-6** in
  `docs/internal/audits/twelve-factor/audit-2026-08-17.md:177-178`. Needs its own decision.
- **Staging.** ADR-0036 scopes the refusal to `production`. Extending it would be safe today
  (`.env.staging` sets none of the five) but contradicts the ADR text.
- **`worker.ts:38`** still uses `NoopVisualizationInvalidation`, so the RabbitMQ path never
  invalidates viz cache. Pre-existing, unrelated to tenant scoping.
- **Dated audit run files** (`audit-2026-06-05.md` etc.) were not edited — they are evidence of
  record. Only the open-risk trackers (`iteration-plan.md`, `FINAL-AUDIT-SUMMARY.md`) were updated.

## Deploy note

Old-shape keys are orphaned — unreachable by the new SCAN patterns, so they cannot be served, but
they occupy Redis until TTL (`VIZ_DEFAULT_TTL_SEC` 120s; `cacheMiddleware` 300s). No migration
needed. A one-shot sweep of `viz:*`, `vizdash:*`, `log:*`, `logStats:*`, `metric:*`,
`metricSetting:*`, `category:*`, `cursor:*` on deploy is the clean move.

## Residual risk

`req.user?.organizationId` is optional-chained in the key generators. `authMiddleware` guarantees
it (`UserDomain.organizationId` is required and every route is behind `router.use(authMiddleware)`),
but if it were ever absent the key would contain the literal `undefined` and merge tenants rather
than fail closed. Considered adding a throwing helper — `cacheMiddleware` treats a throwing key
generator as a cache bypass, which is the safe failure mode — but it would obscure the templates the
architecture test reads. Worth revisiting if the auth contract ever loosens.
