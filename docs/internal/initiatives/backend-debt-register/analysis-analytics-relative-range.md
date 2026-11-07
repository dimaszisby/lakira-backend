# B-02 — Relative ranges, lifecycle timestamps and the fallback range

Register row [B-02](register.md), with B-49. Read at `bf72b58`. Raised by the frontend on the
Notion page (Part 1, 2026-10-07); the backend's answer was written there on 2026-10-13.

## 1. What is wrong

Three behaviours of `GET /analytics/dashboard` and `GET /analytics/metrics/:metricId`.

1. **A relative range leaves out the current bucket.** `last=7d&bucket=1d` at 16:40 UTC returned a
   range ending at 00:00 UTC that day. A value logged today does not appear until tomorrow.
   Observed by the frontend on 2026-10-07.
2. **`firstLogAt` and `lastLogAt` are shifted.** A log stored at `16:37:00Z` came back as
   `23:37:00.000Z` with `tz=Asia/Jakarta`. Observed the same day.
3. **The fallback range leaves out its newest log.** With `tz=UTC`, a metric whose only log was
   that day returned an empty series and `count: 0` with `fallbackRangeUsed: true`. Observed
   2026-10-08.

## 2. Root cause

1. `anchorNow` (`src/features/public/analytics/infrastructure/http/schema.zod.ts:44-48`) rounds
   the present **down** to the bucket, and `computeStartEndFromLast` (`:58-59`) uses that as the
   end. Both queries take `logged_at < :end` (`infrastructure/sql/visualization.dashboard.sql.ts:30`,
   `visualization.sql.ts:29`). The rounding exists so repeated requests inside one bucket share a
   cache key and an ETag (see the comment at
   `__tests__/integration/api/analytics-caching.test.ts:10-12`). It was added on 2026-01-22
   (`cff3abd`, "failing relative range query"). The rounding is in UTC whatever `tz` is sent: with
   `tz=Asia/Jakarta` the daily range ends at 07:00 local time.
2. The lifecycle query takes `MIN(ts_tz)` and `MAX(ts_tz)`
   (`visualization.dashboard.sql.ts:82-83`), where `ts_tz` is `timezone(:tz, ml.logged_at)`
   (`:63`): a timestamp without zone holding local wall-clock time. It is serialised as if it were
   UTC.
3. `computeFallbackRange` sets `fallbackEnd = last` (`domain/fallback-range.ts:46`), and the query
   is half-open, so the log at `lastLogAt` is outside its own fallback range. Defect 2 hides it
   whenever the shift is positive, because the shifted `lastLogAt` lands after the real one.

## 3. Options

**Is defect 1 a defect at all?** Two readings.

- _"Complete buckets only" is a design._ For it: the rounding is deliberate, and a partial day
  can mislead on an average. Against it: nothing says so (the spec's description of `last` at
  `docs/reference/api/lakira-backend-openapi.json`, the docs and the tests are silent); the cut is
  at a UTC boundary, so in Jakarta it is neither midnight nor now; and the fallback path returns
  today's logs when they are the only ones, so the two paths disagree.
- _It is a side effect of stabilising the cache key._ That is what the commit and the test comment
  describe.

This analysis takes the second reading. **The owner confirms or overrules it (plan Q-1, register
O-01).** If the first reading is chosen, defect 1 becomes a documentation change and a fix to the
boundary's time zone; defects 2 and 3 stand either way.

For the end of a relative range:

- **A. End at the present instant.** Correct, and the cache key then changes on every request, so
  the response cache and the ETag stop working for relative ranges.
- **B. End at the start of the next bucket, in UTC.** One line: `anchorNow(bucket) + unit`. Today
  is included and the key is stable for the bucket. For a daily bucket in Jakarta the window still
  turns over at 07:00 local.
- **C. End at the start of the next bucket in the requested zone.** Correct for every zone. Needs
  the boundary computed in `tz`, in JavaScript with `Intl` or in SQL.

For the timestamps: take `MIN(ml.logged_at)` and `MAX(ml.logged_at)`, the stored instants. This
also closes B-49 (T4), which is the same column inside a repeated daylight-saving hour.

For the fallback: end the range one millisecond after `lastLogAt`, keeping the half-open query.

## 4. Recommendation

**C for daily and coarser buckets, B for hourly**, where every zone but the half-hour ones agrees
with UTC; the instants for the timestamps; `lastLogAt + 1 ms` for the fallback. One PR: the three
interact, and a test of any one needs the others right.

## 5. Acceptance criteria for the fix

- **AC-1** — `last=7d&bucket=1d` includes a log made in the current local day, for `tz=UTC` and
  for `tz=Asia/Jakarta`, with the clock set either side of 00:00 UTC. _Why:_ the frontend's report.
- **AC-2** — Two requests inside one bucket compute the same range and the second answers 304.
  _Why:_ what the rounding was for.
- **AC-3** — `firstLogAt` and `lastLogAt` equal the stored `logged_at` of the first and last log,
  whatever `tz` is sent. _Why:_ a `Z` suffix has to mean UTC.
- **AC-4** — A metric whose only log is the newest one returns that log through the fallback
  range, with `tz=UTC`. _Why:_ the case of 2026-10-08.
- **AC-5** — The spec's description of `last` says the range runs through the end of the current
  bucket in the requested zone. _Why:_ the next reader should not have to ask.
- **AC-6** — The dashboard's stats and series agree with the single-metric route for the same
  range. _Why:_ #145 fixed a disagreement here; a range change must not reopen it.

## 6. Size and shape

≤1 day. Lean kit, and an ADR: what a documented parameter returns changes. Gates: typecheck, lint,
format, tests, build, OpenAPI (a description changes). The clock has to be injectable in
`schema.zod.ts` to test AC-1, as the readiness probe's is.

## 7. Depends on, unblocks

Depends on Q-1. Unblocks the frontend's dashboard wording and its count assertions
(lakira-frontend `docs/internal/todos/2026-10-08-todo-dashboard-count-assertions.md`). When it
ships the Notion record moves to Completed with the PR, and the frontend re-runs its dashboard
specs; no type changes are expected.

## 8. Not verified

- The three observations are the frontend's, made against a local Compose backend on 2026-10-07
  and 2026-10-08. I read the code that explains each and did not rerun them.
- Whether `meta.range.end` lying in the future troubles any frontend code. The frontend does not
  display it today.
- How the window's start should move: `start = end - N` keeps N full buckets plus the partial one
  only under option C if the start is computed in the same zone.
