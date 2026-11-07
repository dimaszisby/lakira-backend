# API, scripts and CI residuals — Plan

- **Status:** Approved
- **Appetite:** 2 days — past that, cut a finding into its own row rather than extend
- **Date:** 2026-10-23

## Context and goals

Register row B-82 bundles what `audit-2026-10-20.md` § 6 graded P3 in the fork and API lane:
X11/X21, X22 to X28, and the validator items of W7 (§ 4.2). The owner chose to fix all of them in
one kit and one PR (2026-10-23), and chose X27's design: cursor pages, default 100.

Read on `dev` at `28b731f`:

- **X23 reproduces.** `tz` passes whatever `Intl` accepts. `Intl` reads `+07:00` as seven hours
  east and Postgres as seven hours west, so a request's range and its buckets use opposite zones.
- **X22.** A failed validation, a `ZodError` and malformed JSON are logged at error; every other
  4xx at warn.
- **X11/X21.** Three single-resource cache keys read raw `req.params` or `req.query`. Reading them
  found **B-90**: `UpdateCategory` and `DeleteCategory` invalidate `category:<user>:<id>`, while
  the route caches `category:<org>:<user>:<id>`, so with Redis on an updated or deleted category
  is served from cache for up to ten minutes.
- **X24.** The PRD drift guard watches a path that does not exist.
- **X25.** `staging`, `prod` and `worker:staging` run `ts-node` against `src/`; ADR-0040 decision
  5 deleted `worker:staging` on paper. The audit's "flag removed from Node" does not hold on Node
  24.22.1: the flag is accepted, and redundant.
- **X28.** `docs:openapi:check` passes for an untracked spec.
- **W7's rest.** No operation has an `operationId`, so the duplicate check cannot fire, and an
  empty `paths` passes. The validator cannot be imported, so no check has a test.
- **X26.** Login, refresh and logout share one per-IP bucket under `userRateLimiter`.
- **X27.** Both organization lists load every membership.

## Acceptance criteria

- **AC-1** — A `tz` that is not an IANA name or `UTC` is refused, at the request and at startup.
  _Why:_ X23.
- **AC-2** — A rejected request is logged at warn. _Why:_ X22.
- **AC-3** — Each single-resource cache key is built from validated values, and every write's
  invalidation deletes the key the route writes. _Why:_ X11, X21, B-90.
- **AC-4** — The drift guard names a file that exists. _Why:_ X24.
- **AC-5** — No script runs `ts-node`, and `ts-node` is not a
  dependency. _Why:_ X25.
- **AC-6** — `docs:openapi:check` fails on an untracked spec. _Why:_ X28.
- **AC-7** — Each validator check is shown to fire, and a spec with no operations fails. _Why:_ W7.
- **AC-8** — Refresh and logout do not spend login's budget, and no user-keyed limiter runs
  without auth. _Why:_ X26.
- **AC-9** — Both organization lists page by cursor, default 100. _Why:_ X27.
- **AC-10** — Every gate passes.

## Open questions

- [x] **Q-1** — X27: page, how big, or cap by design? Answered by the owner: cursor, default 100.

## Out of scope

- The bootstrap parts of W7: register row B-50.
- `/health` returning the release: kept by B-27's D-01.
- Generating `operationId`s (D-07).

## Decisions expected

D-01 to D-09 in [decisions.md](decisions.md), one per finding, written before the code.

## Phases

### Phase 0 — kit and branch

Branch, this kit, #217's loose ends.

### Phase 1 — tests first

Each test fails on `dev` for the reason its decision names.

### Phase 2 — the changes

D-01 and D-02; D-03 with B-90; D-07, D-06, D-05 and D-04; D-08; D-09.

### Phase 3 — gates, review, docs

Gates (security delta included), review, fixes, docs, the Notion record, the drafts.

## Risks and trade-offs

- D-01 refuses offsets a client may send today. The frontend sends the browser's IANA name.
- D-08 adds two env vars; their defaults keep today's numbers, in separate buckets.
- D-09's pages can be shorter than `limit` where rows are dropped after the query; the cursor
  follows the last membership read, so none is skipped.

## Rollback

Code only, revert-safe: no migration, and no data written that the previous version cannot read.
The two new env vars are optional.

## Security and data

D-08 changes rate limits on the login, refresh and logout routes; D-03 changes what a cache key is
built from and fixes an invalidation. Both keep `clientIpKey` and the tenant-scoped keys.

## References

- `docs/internal/audits/saas-readiness/audit-2026-10-20.md` § 4.2 (W7), § 6 (X11, X21 to X28)
- Register rows B-82, B-90; `backend-debt-register` D-09 (the stats key, fixed by #202)
