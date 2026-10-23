# Decisions — api-tooling-residuals

## D-01 — `tz` is an IANA name or `UTC`, by one rule (X23)

- **Status:** Proposed
- **Date:** 2026-10-23

**Context.** The analytics `tz` passed whatever `Intl` accepts, `+07:00` included. `Intl`, which
computes a relative range's edges, reads `+07:00` as seven hours east (12:00Z is 19:00); Postgres,
which buckets the logs, reads it POSIX-style as seven hours west (12:00Z is 05:00). The spec
documented a stricter pattern than the runtime enforced, and `DEFAULT_TZ` was any string.
**Decision.** `isIanaTimeZone` in `src/utils/time-zone.ts`: the spec's pattern, which the module
now owns, and `Intl` accepting the name. The analytics schema, the spec and `DEFAULT_TZ` at startup
all use it. An offset is a 400.
**Options considered.** _Translate an offset for Postgres:_ two spellings of one input to keep in
step. _`Intl.supportedValuesOf("timeZone")`:_ leaves out aliases browsers still report.
**Consequences.** A client sending an offset gets a 400 where it got wrong buckets.

---

## D-02 — A rejected request is logged at warn (X22)

- **Status:** Proposed
- **Date:** 2026-10-23

**Context.** A failed validation, a `ZodError` reaching the error handler and malformed JSON were
logged at error. Every other 4xx is a warn line (v6-small-items D-01).
**Decision.** All three at warn, with what they log unchanged: field and Zod code, or the
parser's `type`. "Unexpected Error during Validation", a fault of ours, stays at error.
**Options considered.** _Info:_ a refused request is worth a look when it repeats.
**Consequences.** An alert on error lines no longer fires on bad input.

---

## D-03 — Each single-resource cache key is built once, from validated values (X11, X21, B-90)

- **Status:** Proposed
- **Date:** 2026-10-23

**Context.** The `metric:`, `category:` and `metricSetting:` keys read raw `req.params` and
`req.query`, against `api-design.md`, and called no `assertAuthenticated`. Each invalidation spelled
its key again by hand, and the category one spelled it wrong: `category:<user>:<id>` against the
route's `category:<org>:<user>:<id>`, so an updated or deleted category stayed in the cache for its
600 s.
**Decision.** Each feature formats its key in one function next to its cache constants. The route's
key generator calls it with `assertAuthenticated` and `pickValidated`; every invalidation calls it
too. The metric key's `include` rule is one helper, shared with the controller. The formats do not
change, so no cached entry is orphaned.
**Options considered.** _Fix only the category pattern:_ leaves three keys spelled twice.
**Consequences.** A category update or delete is visible at once with Redis on.

---

## D-04 — The PRD drift guard watches the PRD (X24)

- **Status:** Proposed
- **Date:** 2026-10-23

**Context.** `backend-prd-drift-warning.yml` compares against
`docs/documentation/product/lakira-backend-prd.md`, which does not exist, so it warns on every
contract change and nothing can satisfy it.
**Decision.** It compares against `docs/explanation/product-requirements.md`, whose review cadence
is contract-change driven.
**Options considered.** _Delete the guard:_ the PRD's cadence is what it serves.
**Consequences.** The warning means something again.

---

## D-05 — The scripts that run `ts-node`, and `ts-node`, go (X25)

- **Status:** Proposed
- **Date:** 2026-10-23

**Context.** `staging`, `prod` and `worker:staging` run `ts-node` against `src/` with
`.env.staging` or an `.env.production` the repo does not hold. ADR-0040 decision 5 deleted
`worker:staging`; the script stayed. The `jest` script passes `--es-module-specifier-resolution`,
which the audit inferred Node had removed: Node 24.22.1 accepts it, and Jest resolves modules
itself.
**Decision.** The three scripts are deleted; `start`, `start:staging` and `worker` are the way to
run. The `jest` script loses the flag. `ts-node`, which nothing else uses, leaves
`devDependencies`, with its `tsconfig.json` block.
**Options considered.** _Point them at `dist/`:_ `start`, `start:staging` and `worker` already are
those.
**Consequences.** A dependency removal: the security delta gate runs. ADR-0040 gets a status note.

---

## D-06 — `docs:openapi:check` fails on an untracked spec (X28)

- **Status:** Proposed
- **Date:** 2026-10-23

**Context.** The check ends in `git diff --exit-code <spec>`, which passes when the spec is not
tracked. The bootstrap header names `openapi-spec-path.ts` for a `.js` file.
**Decision.** `git ls-files --error-unmatch <spec>` runs before the diff. Bootstrap renames the
path in the script as before, and moves a tracked spec with `git mv`, so a fork passes.
**Options considered.** _Diff against `HEAD`:_ an untracked file still shows no difference.
**Consequences.** A spec that was never added fails the gate, with git's own message.

---

## D-07 — The validator's checks are a module, each proven to fire (W7)

- **Status:** Proposed
- **Date:** 2026-10-23

**Context.** No operation has an `operationId`, so the duplicate check cannot fire, and a spec
with an empty `paths` passes. The checks run at import of a script, so none has a test; the 429,
413 and 415 checks were tried by hand.
**Decision.** The checks move to `scripts/openapi-checks.ts`, exported as a function of the
document; `validate-openapi.ts` reads the file and calls it. A spec with no operations fails. The
comment says an `operationId` is optional and unique when present. A unit test gives each check a
document that trips it.
**Options considered.** _Generate an `operationId` for every operation:_ a contract change the
frontend's type generator would see, made for a check.
**Consequences.** A check that stops firing fails a test.

---

## D-08 — Login, and refresh and logout, have limiters of their own (X26)

- **Status:** Proposed
- **Date:** 2026-10-23

**Context.** `/login`, `/logout` and `/refresh` run without `authMiddleware`, so `userRateLimiter`
counted all three by IP in one bucket, under the prefix the per-user routes use. Refreshes spent
the budget logins need.
**Decision.** `loginRateLimiter` (`RATE_LIMIT_LOGIN_MAX`) on `/login`, and `authSessionRateLimiter`
(`RATE_LIMIT_AUTH_SESSION_MAX`) on `/refresh` and `/logout`: per client IP through `clientIpKey`,
15-minute windows, prefixes of their own, `limitExceeded`. Both default to 50, today's number.
`architecture.test.ts` fails on a user-keyed limiter in a router call that no `authMiddleware`
covers.
**Options considered.** _Key refresh by its token:_ the token is unverified until the handler
runs. _Lower the login default:_ the per-email lockout already bounds guessing; a smaller number
would limit an office sooner than today.
**Consequences.** Two optional env vars. No client is limited sooner than today.

---

## D-09 — The organization lists are cursor pages (X27)

- **Status:** Proposed
- **Date:** 2026-10-23

**Context.** `GET /organizations` and `GET /organizations/:id/members` load every membership. Both
answer an object, so pages can be added without breaking a reader.
**Decision.** `limit` (1 to 100, default 100) and `after`; the response gains `nextCursor`, opaque,
null on the last page. Membership order is `joinedAt, id`, as today. A cursor that does not decode
is a 400. Rows dropped after the query (inactive, deleted organization, missing user) can shorten a
page; the cursor follows the last membership read, so none is skipped. Pages order and compare
`joinedAt` to the millisecond, the precision of the Date a cursor carries: found while making the
change, a backfilled membership (`NOW()`, microseconds) sorted after its own cursor, and a client
following `nextCursor` was handed the same row forever.
**Options considered.** _Default 20, as other lists:_ a larger org would see a short list until
the frontend follows the cursor. _Leave them whole as bounded by design:_ chosen against by the
owner.
**Consequences.** The frontend is told, in Notion Part 2, to follow `nextCursor` before an org
passes 100.
