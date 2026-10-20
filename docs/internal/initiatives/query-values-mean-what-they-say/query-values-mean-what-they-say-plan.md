# Query values mean what they say — Plan

- **Status:** Done
- **Appetite:** 2 days
- **Date:** 2026-10-20

## Context and goals

Four register rows, the last bugs a client can see. Checked on `dev` at `fa7c497`:

- **B-43** — a dashboard bucket averaging exactly 0 came back `null`, like an empty one; the
  single-metric endpoint kept the zero. A log of 0 is valid.
- **B-44** — `GET /metric-settings` read `includeTotal` with `z.coerce.boolean()`, so `"false"`
  meant true.
- **B-45** — the single-log cache key omitted the metric, so a 200 was replayed for a metric the
  handler would answer 404 for (audit T5).
- **B-46** — cache-key string segments were only trimmed, so free text could stand for another
  segment and `_` for no value; the metric-log list key was hand-built from raw `req.query` with
  `.js` sentinels (audits S12, R13).

When this lands, each value a client sends or reads back means one thing.

## Acceptance criteria

- **AC-1** (B-43) — with `fill=none`, a bucket of zero logs is `0` and an empty bucket `null` on
  both endpoints; with `fill=zero`, both `0`.
  _Why:_ the chart drew a gap where the user logged zero.
- **AC-2** (B-44) — `includeTotal=false` gives no total, `=true` one, `=yes` a 400.
  _Why:_ the client paid for a count it asked not to get.
- **AC-3** (B-45) — a 200 cached for a log under one metric is not replayed for another.
  _Why:_ T5.
- **AC-4** (B-46) — a separator, the sentinel and a glob in free text give distinct keys; ids are
  unchanged; the metric-log key is built from the validated query; every cursor version is 4.
  _Why:_ S12 and R13.
- **AC-5** — existing tests pass, changed only where a version, the sentinel or a pinned hash
  appears.
  _Why:_ no case may be lost.
- **AC-6** — no OpenAPI drift; the contract quick profile passes.
  _Why:_ the documented contract does not change.

## Open questions

None.

## Out of scope

B-33; the `logStats` key; Redis in the integration suite; the bucket-label zone (B-65).

## Decisions expected

D-01 bucket values; D-02 strict `includeTotal`; D-03 encoded segments; D-04 the metric-log list
key; D-05 the single-log key.

## Phases

### Phase 0 — kit and branch

### Phase 1 — tests first, each seen to fail

### Phase 2 — B-43, B-44, B-46, B-45

### Phase 3 — gates, review, docs, Notion

## Risks and trade-offs

The cursor and dashboard caches start cold once after deploy.

## Rollback

Code: revert the PR. No migration; old code reads version 3 keys and ignores version 4.

## References

- ADR-0075; ADR-0035
