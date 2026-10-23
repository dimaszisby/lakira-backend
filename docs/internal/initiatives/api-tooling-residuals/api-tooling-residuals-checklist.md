# API, scripts and CI residuals — Checklist

Checked against `origin/dev` at `28b731f` (#217). Acceptance criteria: [the plan](api-tooling-residuals-plan.md).

## Phase 0 — kit and branch

- [x] `fix/api-tooling-residuals` cut with `--no-track` from `origin/dev` at `28b731f`; HEAD and
      upstream verified
- [x] This kit: README, plan, this file, `decisions.md` with D-01 to D-09
- [x] #217's loose ends: `analytics-leftovers` D-01 to D-03 Accepted, README Done; B-65's Closed
      row names #217; "As of" `28b731f`

## Phase 1 — tests first

Each failed on `dev` for the reason its decision names, unless stated.

- [x] D-01: `__tests__/unit/utils/time-zone.test.ts` (module absent on `dev`);
      `analytics.test.ts` › `tz=+07:00` and `-04:00` answered 200 on `dev`;
      `zodEnv.default-tz.test.ts` › an offset and `GMT` were accepted on `dev`
- [x] D-02: `validation.test.ts` and `error-log-lines.test.ts` › the level is warn (`dev`: error)
- [x] D-03: `cache-keys.test.ts` for metric, metric-settings and metric-category; with the
      builders in and the old invalidation, "a category write clears the key its GET writes"
      failed on update and on delete (B-90)
- [x] D-07: `__tests__/unit/scripts/openapi-checks.test.ts`, one broken document per check (the
      module is new; the empty-`paths` check is new behaviour)
- [x] D-08: auth `router.test.ts` › a limiter of its own on `/login`, `/refresh`, `/logout`;
      `architecture.test.ts` › no user-keyed limiter without auth (it named the auth router);
      `rate-limiter.envelope.test.ts` › login's budget is not spent by refresh or logout
- [x] D-09: `organization-membership.test.ts` › pages: no `nextCursor` and 200s for bad input on
      `dev`

## Phase 2 — the changes

- [x] D-01 `src/utils/time-zone.ts`; the analytics schema, the spec and `DEFAULT_TZ` use it
- [x] D-02 three log lines at warn
- [x] D-03 one key function per resource in `application/cache.constants.ts`; key builders in
      `infrastructure/http/cache-keys.ts`; `detail-includes.ts` shared by key and controller
- [x] D-04 the drift workflow, staged at `.git/staged-workflows/` (a hook blocks edits there)
- [x] D-05 three scripts, the flag, `ts-node` and its `tsconfig.json` block removed; twelve
      packages left the lockfile, and `npm ls --omit=dev` is unchanged
- [x] D-06 `docs:openapi:check`; the bootstrap header
- [x] D-07 `scripts/openapi-checks.ts`
- [x] D-08 `loginRateLimiter`, `authSessionRateLimiter`, two env vars
- [x] D-09 paged repository methods, use cases, cursor codec, schema, controller, spec

## Phase 3 — gates, review, docs

- [x] Gates, below
- [x] Review of the diff: found the cursor precision fault below, fixed with a test
- [x] Docs: `configuration.md`, `.env.example`, `commands.md`, `security.md`,
      `environment.md`, `api-design.md`, `CLAUDE.md` (72 env vars), ADR-0040 status note
- [x] Register: B-82 to Closed, B-90 filed and closed; #217's loose ends
- [x] Notion Part 2: "The organization lists page by cursor, 100 rows per page", Open

## Discovered

- [x] Found: B-90, the category invalidation never matched its key → in scope (D-03), register
      row B-90
- [x] Found: X25's "flag removed from Node" does not hold on 24.22.1 → recorded in D-05; the flag
      is removed as redundant
- [x] Found: `cacheMiddleware` is off under `NODE_ENV=test`, so no integration test can reach a
      route cache → B-90 is proven by the unit test of the use cases against the route's key
- [x] Found: a membership written by the backfill's `NOW()` has microseconds; a cursor holds
      milliseconds, so the row sorted after its own cursor and a client following `nextCursor`
      got it forever → in scope, pages compare `joinedAt` to the millisecond (D-09), with a test
- [x] Found: three router and controller tests built keys from raw, non-UUID requests, or
      expected the old include order → in scope, updated (D-03)
- [x] Found: `migrate:production` names `.env.production`, an operator's own file → out of
      scope; AC-5 reads "no script runs `ts-node`"
- [x] Found: `npm audit` lists a new High in `follow-redirects`, dev-only under `wait-on`; the
      security delta gate, which reads production, passes → out of scope, reported to the owner

## Acceptance

- [x] AC-1 — `time-zone.test.ts`, `analytics.test.ts` › tz, `zodEnv.default-tz.test.ts`
- [x] AC-2 — `validation.test.ts`, `error-log-lines.test.ts`
- [x] AC-3 — the three `cache-keys.test.ts`
- [x] AC-4 — the staged workflow names `docs/explanation/product-requirements.md`, which exists
- [x] AC-5 — `git grep ts-node` finds no script or config; `npm ls ts-node` is empty
- [x] AC-6 — a scratch clone: the old check exits 0 on an untracked spec, the new one 1, and 0
      once it is tracked
- [x] AC-7 — `openapi-checks.test.ts`
- [x] AC-8 — auth `router.test.ts`, `architecture.test.ts`, `rate-limiter.envelope.test.ts`
- [x] AC-9 — `organization-membership.test.ts` › pages
- [x] AC-10 — below

## Gates

Node 24.22.1; integration against throwaway Postgres 18 and Redis 7, migrated with `migrate:test`.

- [x] typecheck — clean
- [x] lint — clean
- [x] format — `format:check` clean; the staged workflow checked through prettier
- [x] tests — `test:unit:coverage` 155 suites, 1601 tests passed, thresholds met;
      `test:integration:coverage` 43 suites passed (2 skipped), 316 tests passed (6 skipped),
      thresholds met, after the cursor fix
- [x] build — clean
- [x] OpenAPI — regenerating reproduces the spec byte for byte; `docs:openapi:validate` passes
- [x] security delta — `security:delta:gate` passed: 3 medium, no high or critical
- [ ] image smoke — skipped: the dependency removed is dev-only; `npm ls --omit=dev` unchanged
- [ ] contract gate — not run locally: it seeds the database in `.env.test`, the owner's
      `postgres_db`; left to CI's `contract_local`
