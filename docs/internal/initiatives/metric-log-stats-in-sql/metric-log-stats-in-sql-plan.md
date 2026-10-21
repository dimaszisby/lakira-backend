# Metric-log stats in SQL — Plan

- **Status:** Done
- **Appetite:** 1 day
- **Date:** 2026-10-21

## Context and goals

`GET /metric-logs/stats` answers the average, minimum and maximum of a user's logs, for one metric
or all of them. The dated run of 2026-10-20 (X20) found two defects, also N10 and F4 of 2026-06-05:

- `MetricLogStatsRepoSequelize.computeStats` loads every log in scope and spreads the values into
  `Math.min` and `Math.max`. At 200,000 logs the endpoint answers 500 from
  `RangeError: Maximum call stack size exceeded`.
- `startDate` and `endDate` are validated and then dropped by the controller. They are not in the
  spec or the cache key, so a caller asking for a range gets the all-time answer.

The stats cache key is also one of the three built from raw `req.query` (X11/X21, B-82).

When this lands, the stats are one SQL aggregate, the range is honoured by `loggedAt`, and the
cache key is built from the validated query and names the range.

## Acceptance criteria

- **AC-1** — With 200,000 logs, the endpoint answers 200 with the exact average, minimum and
  maximum, for one metric and for all. _Why:_ X20's reproduction.
- **AC-2** — `startDate` and `endDate` select logs with `startDate <= loggedAt < endDate`; either
  may be given alone; an empty range answers zeros, as an empty metric does. _Why:_ X20, F4; the
  owner chose to honour them.
- **AC-3** — A range whose end is not after its start, or a datetime without an offset, answers 400. _Why:_ an inverted range has no answer, and a datetime with no offset has no instant.
- **AC-4** — Only the caller's own logs are counted, as before: another organization's and a
  colleague's metric are excluded from "all", and naming either still answers 404 or 403.
  _Why:_ the change must not move the tenant boundary.
- **AC-5** — Each range is cached apart, and a new, changed or deleted log clears every cached
  range of its metric and of "all". _Why:_ X20 (the range is not in the key), X11.
- **AC-6** — The spec documents both parameters and the half-open rule; the response shape is
  unchanged. _Why:_ `docs:openapi:check`; the frontend's generated types.

## Open questions

None. The owner chose to honour the dates on 2026-10-21 (D-02).

## Out of scope

- The other two raw-query cache keys of X11/X21 (B-82).
- A `count` in the response, or any other change to its shape.
- The deprecated offset list endpoint's own `startDate`/`endDate` (`listMetricLogsQuery`), which no
  route uses.

## Decisions expected

- How the aggregate is written: Sequelize `fn`/`col` on the existing scoping, or raw SQL (D-01).
- The range's bounds, format and any cap (D-02).
- The cache key's form and how a write invalidates it (D-03).

## Phases

### Phase 0 — kit and branch

Branch off `origin/dev` at `66eaf20`; this kit.

### Phase 1 — tests first

`__tests__/integration/api/metric-log-stats.test.ts` for AC-1 to AC-5, each seen to fail where it
should; unit tests for the repository, the cache key and the invalidation.

### Phase 2 — the fix

Repository, port, query, controller, schema, cache key and invalidation, spec.

### Phase 3 — gates, review, docs

Gates by name; review; ADR-0079; register rows, D-09 and the CI-time row; #201's loose ends.

## Risks and trade-offs

- Old cache entries in the old key form are never read again and expire on their 300 s TTL.
- Pattern invalidation scans keys with `SCAN`, as the cursor lists already do.

## Rollback

Code only: no migration, no data written the previous version cannot read. A revert restores the
old endpoint, including its defects.

## Security and data

Tenant scoping is kept as it is and tested (AC-4). The cache key holds ids and epoch
milliseconds, nothing a user typed.

## References

- `docs/internal/audits/saas-readiness/audit-2026-10-20.md` § 6 X20, X11, X21
- `docs/internal/audits/saas-readiness/audit-2026-06-05.md` N10, F4
- ADR-0052 (logs are filtered by `loggedAt`), ADR-0075 (cache keys)
