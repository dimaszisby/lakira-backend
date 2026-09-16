# Todo — analytics 304 responses omit validators

- **Status:** Complete (2026-09-16) — fixed on `fix/analytics-304-validators`
- **Created:** 2026-08-31
- **Owner:** unassigned
- **Found by:** the newman retirement (`2026-08-31-todo-retire-newman.md`), while migrating the
  collections' only conditional-request assertion into Jest

## The defect

`src/features/public/analytics/infrastructure/http/controller.ts:46-48`, in
`handleGetVisualization` (`GET /analytics/metrics/:metricId`):

```ts
const etag = makeEtag(data);
if (req.headers["if-none-match"] === etag) return res.status(304).end();
res.setHeader("ETag", etag);
```

The 304 short-circuits **before** the header is set, so the response carries no `ETag`.
RFC 9110 §15.4.5 requires a 304 to send the validator that would have accompanied a 200 —
without it a client cannot refresh its cache entry, and some intermediaries treat the
revalidation as failed.

The same handler sets **no `Cache-Control` at all**, so the route is only conditionally
cacheable by accident. `handleGetDashboardVisualization` (`:76-84`) gets both right: it sets
`ETag` and `Cache-Control` before the conditional, so its 304 is well-formed.

## Why it was not fixed on discovery

The retirement PR removes a devDependency, deletes five collections, and rewires CI seeding.
Landing a behaviour change alongside that would mean a red pipeline has two candidate causes.
The migrated test therefore asserts today's behaviour and points here:

`__tests__/integration/api/analytics-caching.test.ts` → `"returns 304 for a conditional single
metric request"` asserts `etag` and `cache-control` are **undefined** on the 304.

## The fix

Move the two header writes above the conditional and give the route a `Cache-Control`
consistent with the dashboard's (`private, max-age=${VIZ_CACHE_MAX_AGE_SEC},
stale-while-revalidate=${VIZ_CACHE_STALE_SEC}`). Then invert the two `toBeUndefined()`
expectations in that test to `toBe(first.headers.etag)` / `toContain("private")`.

Worth checking in the same pass whether `makeEtag` should be a strong validator at all: it is a
27-character base64 slice of `JSON.stringify(data)`, so it is a truncated hash presented as a
strong ETag. `deriveEtagSeed` (`VisualizationReadRepoSequelize.ts:457`) does the same with sha1.
Collisions are unlikely but the truncation is arbitrary.

---

## Review — completed 2026-09-16

Branch `fix/analytics-304-validators` off `dev` @ `c17c923`.

### Both problems this brief named were real, and the second one is the serious one

**The 304 carried no validator.** `handleGetVisualization` returned before setting the header. Fixed
by mirroring `handleGetDashboardVisualization`: `ETag` and `Cache-Control` are written **before** the
conditional, so a 304 now carries the same validators a 200 would (RFC 9110 §15.4.5).

**`makeEtag` was not a hash — it was a prefix of the body.** The brief flagged this as "worth
checking in the same pass" and it turned out to be a correctness bug rather than a style point:

```ts
Buffer.from(JSON.stringify(body)).toString("base64").slice(0, 27);
```

27 base64 characters encode **20 bytes**, so the validator only ever reflected the first 20 bytes of
the payload. Demonstrated directly:

```
payload A : {"series":[{"t":"2026-01-01T00:00:00Z","v":1}]}
payload B : {"series":[{"t":"2026-01-01T00:00:00Z","v":2}]}
etag both : "eyJzZXJpZXMiOlt7InQiOiIyMDI"      ← identical
```

Every response from these endpoints shares a long opening prefix, so in practice the ETag barely
moved at all. A client revalidating would be answered **304 with stale data**.

The two defects compound: fixing only the header would have produced a well-formed 304 that
confidently served the wrong body — strictly worse than the malformed one, because a malformed 304
is at least distrusted by some intermediaries. That is why both were fixed together rather than
split.

`makeEtag` now hashes before truncating, matching `deriveEtagSeed`
(`VisualizationReadRepoSequelize.ts:465`), which was already correct — truncating a **digest** is
sound; truncating the **content** is not.

### Also

`Cache-Control` was computed per request in an array-join inside the dashboard handler, from two
module-level constants. Hoisted to `VIZ_CACHE_CONTROL` and used by both routes, which is what makes
the single-metric route's new header identical to the dashboard's by construction rather than by
copy.

### Tests

The existing 304 test's `toBeUndefined()` assertions — which deliberately pinned the broken
behaviour — now assert the 304's validators equal the 200's. One test added:
`"changes the single metric ETag when the underlying data changes"`, which inserts a second log
inside the same window and asserts the ETag moves and revalidation returns 200. That is the property
the prefix bug violated.

### Verification

```
lint / typecheck / format:check / docs:openapi:check    all exit 0
test:unit                563 passed, 89 suites          (unchanged)
test:integration         193 passed, 5 skipped          (+1, the new test)
contract:local:gate      exit 0, 37/46 selected, 0 failures, seed 42
```

**Negative proofs, run separately so each fix is independently attributed:**

1. `makeEtag` reverted to the prefix version, header ordering kept → the new ETag-movement test
   fails, the other seven pass.
2. Header ordering reverted, hash kept → the 304 test fails, the other seven pass.

Each fix is therefore load-bearing for exactly one test, and neither is carried by the other.

### Left undone deliberately

**Neither route documents a 304 in the OpenAPI spec** (`GET /analytics/metrics/{metricId}` declares
200/400/401/404/500; the dashboard 200/400/401/500). That is the same class as the undocumented 400s
fixed in #77, and it is now more visible because both routes are properly conditional-request
capable. Not bundled here: it changes the published contract, `lakira-frontend` regenerates its types
from that spec, and a behaviour fix and a contract change deserve separate review. Worth its own
small PR.

The `makeEtag`/`deriveEtagSeed` duplication also remains — two 27-character sha1-base64url
truncations in different files. Consolidating them is tidying, not a fix.
