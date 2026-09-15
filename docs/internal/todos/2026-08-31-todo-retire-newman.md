# Todo — retire newman

- **Status:** Complete (2026-08-31) — delivered by `a4635f3` (#75)
- **Created:** 2026-08-31
- **Owner:** unassigned
- **Prepared for:** a fresh Claude Code session with a full context window
- **Supersedes the "Recommended direction (not yet agreed)" section of**
  `2026-08-23-todo-newman-vulnerability-chain.md`, which predates the decisions below

Retirement **is agreed**. Read this before that older doc — the older one's inventory and migration
analysis are still accurate and are the best starting point, but its framing of the decision is
stale.

---

## Why this is happening

Two independent reasons, both established by measurement rather than preference.

**The dependency debt compounds and has no upgrade path.** `newman@6.2.2` is already the latest
published release and ships known criticals upstream has not fixed. Any _new_ advisory in the
postman chain therefore has no version to upgrade to — the only responses are another `overrides`
entry or a security exception. We have been through that cycle once already.

**The assertions are ~68% duplicated.** An inventory found 17 of 25 semantic assertions already
covered in `__tests__/integration/api/`, usually more strictly (Jest asserts values where newman
asserts shape). Maintaining both means every API change needs updating in two places, and there is
already evidence of silent rot: the `.js`-suffix bug that meant the metric-log cursor cache was never
invalidated, dead invalidation patterns with no writer, and `metric-categories` listed as a coverage
target with no collection at all.

Deciding this was also a **precondition for the staging work** — see "What was deliberately left
undone" below.

## Correction to carry forward

An earlier claim that retiring newman "drops 7 of the 11 overrides" was **wrong**. Measured against
the actual dependency tree:

- **Exclusively newman's** — `node-forge`, `flatted`, `ip-address`, `jose` (4)
- **Shared with other consumers** — `handlebars`, `lodash`, `underscore`, `qs` (4). These may become
  unnecessary once newman goes, but only if the remaining consumers resolve safe versions. Check;
  do not assume.
- **Unrelated** — `js-yaml`, `brace-expansion`, `esbuild` (3). These stay regardless.

So: **4 definite, up to 8 at best.** Re-measure before claiming a number in the PR.

## What was deliberately left undone, for this work to finish

The staging smoke-suite change (`2026-08-29-todo-staging-smoke-suite.md`) replaced the staging
contract job but **intentionally did not delete newman's staging path**, because splitting a deletion
across two PRs leaves a half-removed feature. These are orphaned _on purpose_ and are yours to
remove:

- `tests/contract/postman-newman/scripts/run-contract-staging.js` — no longer invoked by anything
- the `test:contract:staging` npm script
- `tests/contract/postman-newman/environments/lakira-staging.postman_environment.json`

If you find these and think "why is this dead code here" — this is why.

## THE TRAP: `contract_local` must survive, and it seeds via newman

**`contract_local` runs Schemathesis as well as newman. Do not delete the job.** It is also a
required-looking gate in the pipeline (`needs: tests`, and `deploy_staging` needs it).

Worse, and easy to miss: **CI has no seed step.** The chain is

```
run-contract-local.js:74-75   ->  npm run seed:contract-tests
                                   writes tmp/contract-seed.json
backend-ci.yml (~:323)        ->  reads tmp/contract-seed.json for primaryUser.token
                                   passes it to Schemathesis as SCHEMATHESIS_LOCAL_TOKEN
```

So the newman runner is what seeds the database and produces the token Schemathesis authenticates
with. **Deleting `run-contract-local.js` without moving the seed step breaks Schemathesis**, and it
will fail in a way that looks unrelated to newman.

Before removing anything, add an explicit seed step to `contract_local` (`npm run seed:contract-tests`)
between the migration step and the server start, and confirm `tmp/contract-seed.json` still exists
when the Schemathesis token step runs.

`scripts/run-contract-local-full.mjs` already does this correctly (seeds at `:100`, then invokes the
runner with `SKIP_CONTRACT_SEED=true`) — copy that ordering.

## Scope

**Migrate** — roughly 9–12 new `it()` blocks plus ~6 one-line assertion additions, concentrated
almost entirely in analytics HTTP caching: `ETag`/`Cache-Control` presence, `If-None-Match` → 304,
invalid-bucket 400, unknown-metric 404, and the dashboard item shape (`metricId`, `category_name`,
`series[]`). Plus a few missing 404s and GET-verb 401s. The per-assertion mapping is in
`2026-08-23-todo-newman-vulnerability-chain.md`; re-verify it rather than trusting it, since the
collections may have changed.

**Then delete** — the five collections, both runner scripts, both environment files,
`tests/contract/postman-newman/` entirely, the `newman` devDependency, the `test:contract:local` and
`test:contract:staging` scripts, and the newman artifact upload in `contract_local`. Re-check the
`overrides` block afterwards and remove what is genuinely unused.

**Do not touch** — Schemathesis, `seed-contract-tests.ts` (Schemathesis consumes its output), the
`contract_local` job itself, or `tests/smoke/`.

### The one real capability being traded away

newman exercises a **deployed server over the network** (`start:test` + `wait-on`), while Jest
supertest runs the app in-process. Schemathesis still provides that signal against the same running
server in `contract_local`, and `tests/smoke/run-smoke.mjs` provides it for deployed environments —
so it is covered. But it is a deliberate trade, not a free win, and the PR should say so.

## Current state, verified 2026-08-31

- `dev` @ `b71bacd`, clean, no open feature branches
- `newman@^6.2.2` and `newman-reporter-htmlextra` **removed** — the reporter went in the overrides
  PR; only `newman` itself remains
- Schemathesis selects **37 of 46** operations; the three dummy routes are tagged `Dummy Data`,
  deliberately outside `DEFAULT_TAGS`, so they are documented but not fuzzed. Removing newman must
  not change that count for any reason other than newman's own absence
- `npm audit`: 9 moderate, 0 high/critical — all rooted in `uuid < 11.1.1` via `sequelize`

## Conventions this repo now expects

- **Plan mode** for anything 3+ steps (`.claude/rules/workflow.md`)
- **Conventional Commits**, enforced by a `commit-msg` hook _and_ in CI since PR #74
- **Never blanket-stage.** A `pre-commit` hook rejects staged `.env*`; name explicit paths
- Commit messages go to `$(git rev-parse --git-dir)/COMMIT_DRAFT`, are shown in chat for review, and
  are applied with `git commit -F`. No `Co-Authored-By` or Claude references in messages or PRs
- Branch off `dev`; the user opens PRs and merges — Claude does not commit, push, or open PRs
- Record the outcome in a todo doc under `docs/internal/todos/`

## Verification the PR must show

```bash
npm run lint && npm run typecheck && npm run format:check && npm run docs:openapi:check
npm test
npm run security:delta:gate
npm audit                      # expect the override block to shrink; state the real number

# The one that proves the trap was handled — Schemathesis must still authenticate:
docker compose up -d
npm run build && npm run db:migrate:test
npm run seed:contract-tests    # now explicit, no longer a side effect of the newman runner
npm run test:contract:schemathesis:local   # expect 37/46 selected, all passing
```

The Schemathesis run is the load-bearing check. If it passes without `tmp/contract-seed.json` having
been produced by newman, the seeding was successfully decoupled.

---

## Review — completed 2026-08-31

Branch `chore/retire-newman` off `dev` @ `5b31068`.

### Corrections to this brief, measured rather than assumed

**`flatted` is not newman-exclusive.** `eslint → file-entry-cache → flat-cache → flatted` also
consumes it. Newman-only overrides were `node-forge`, `ip-address`, `jose` — **3, not 4**.

**The "up to 8 at best" ceiling was in fact reached.** All five shared overrides came out too:
every other consumer resolves the same patched version once newman is not holding the tree down
(`ts-jest` → handlebars 4.7.9, `pg-hstore` → underscore 1.13.8, `flat-cache` → flatted 3.4.4,
`sequelize`/`hpp`/`wait-on` → lodash 4.18.1, `express`/`body-parser` → qs 6.15.3). Proven by
removing all eight, reinstalling, and re-auditing — no finding returned. **`overrides`: 11 → 3.**

**Audit: 9 → 3 moderate**, 0 critical/high/low. Six of the nine were reachable only through
newman. `npm audit --production` unchanged at 2 moderate — no production movement either way.

### The trap was worse than described, and is handled

Beyond the token step, `tests/contract/hooks/seeded_ids.py:44` loads `tmp/contract-seed.json` at
module import and `_load_seed()` swallows every error, returning `{}`. A missing seed would not
raise — it would silently no-op every ID injection and degrade Schemathesis into mass 404s.
`contract_local` now runs `npm run seed:contract-tests` as an explicit step between migrations
and server start, matching `run-contract-local-full.mjs`.

Verified by deleting `tmp/contract-seed.json`, seeding explicitly with newman entirely absent, and
running the CI-equivalent Schemathesis invocation: **37 of 46 operations selected, 31 generated,
31 passed, exit 0.** The count held.

### Migrated — 13 `it()` blocks, not 9–12 plus 6

`__tests__/integration/api/analytics-caching.test.ts` (new, 7): ETag + Cache-Control on the
dashboard; `If-None-Match` → 304 on both endpoints; ETag on single-metric; invalid-bucket 400;
unknown-metric 404; dashboard item shape (`metricId`, `category_name`, `series[]`).

Six one-liners added to existing suites — the GET-verb 401s and by-id 404s were genuinely
missing, because every existing 401 in those files was on a **POST**: `metric.test.ts` (GET 401,
create-without-name 400, unknown-id 404), `metric-log.test.ts` (GET 401, unknown-id 404),
`metric-settings.test.ts` (GET 401). The **auth** collection needed nothing — `auth.test.ts`
already covered all five of its requests, more strictly.

Two things the collections got away with and Jest does not: the dashboard-shape assertion
self-skipped via `pm.skip()` when `items` was empty, so it never ran on an unseeded DB — the Jest
version builds a category + display-enabled metric and asserts `category_name` equals the created
category. And the migrated tests use an **absolute** range; `last=30d` is anchored to the current
bucket, so a conditional request could straddle a boundary and never match its own ETag.

### A defect found while migrating

`controller.ts:47-48` returns 304 **before** setting the ETag, so `GET /analytics/metrics/:id`
sends a 304 with no validator (RFC 9110 requires one) and no `Cache-Control` at all. The dashboard
handler gets this right. Not fixed here — landing a behaviour change alongside a dependency
removal would give a red pipeline two candidate causes. The test asserts current behaviour and
points at `2026-08-31-todo-analytics-304-etag.md`.

### Verification

```
lint / typecheck / format:check / docs:openapi:check   all 0
npm test                unit 540 passed (86 suites); integration 180 passed, 5 skipped
                        (+13 — exactly the migrated cases)
security:delta:gate     passed=true blocking=0 backlogWarnings=0, 2 medium
npm audit               3 moderate, 0 critical/high/low   (was 9)
npm audit --production  2 moderate                        (unchanged)
seed + schemathesis     37/46 selected, 31/31 passed, exit 0, newman absent
```

**One pre-existing failure surfaced, out of scope.** The `gate` profile (not the one CI runs)
fails on `POST /auth/refresh` returning an undocumented **400** — the spec documents 200/401/500.
This branch changes no `src/` file and no spec, `docs:openapi:check` reports no drift, and `dev`
documents the same three responses, so the gap predates this work. CI's default profile is
`quick`, which does not reach it — which is why `dev` is green.

### A trap of my own worth recording

The first attempt removed `package-lock.json` and reinstalled from scratch. That re-resolved the
**entire** tree, bumping prettier 3.8.1 → 3.9.6 and breaking `format:check` on 11 files unrelated
to this work. Restoring the lockfile from `dev` and letting `npm install` make a minimal update
gave the same audit result with a pure-removal diff (10 insertions, 1235 deletions). When the
goal is removing a dependency, never regenerate the lockfile — let npm prune.

### Left undone deliberately

The metric-log cursor-cache `.js`-suffix bug and dead invalidation patterns cited above as rot
evidence are untouched; they were evidence for the decision, not scope. `docs/internal/` dated
todos and audit runs were not rewritten — they are records tied to specific commits. The
`postman-newman` doc kit is marked **superseded** with a banner rather than deleted, and the two
live reference docs that linked into it now point at current guidance.
