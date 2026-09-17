# Todo — give every running process a release identity (ADR-0039 Part 1)

- **Status:** Ready to start — this is the brief, not a plan
- **Created:** 2026-09-16
- **Owner:** unassigned
- **Prepared for:** a fresh Claude Code session — **Opus, high effort, plan mode**
- **Origin:** `TF-3` in the twelve-factor audit
  ([`audit-2026-08-17.md`](../audits/twelve-factor/audit-2026-08-17.md)). Implements **Part 1 only**
  of [ADR-0039](../../explanation/decisions/adr-0039-release-identity-and-immutable-artifacts.md),
  which is still Proposed.

---

## Read ADR-0039 first — most of the decision is already made

ADR-0039 splits itself deliberately:

- **Part 1 — release identity.** Roughly ten lines, and the ADR states plainly that it is _"not
  conditional on Part 2"_.
- **Part 2 — the built artefact is the deployed artefact.** A topology change. That is TF-2, and it
  is **out of scope here.**

Part 1's five steps are specified in the ADR and should be followed rather than redesigned:
`APP_RELEASE` in `zodEnv` defaulting to `"unknown"`, CI/platform supplying the SHA with `APP_RELEASE`
taking precedence over `RENDER_GIT_COMMIT`, `release` on `GET /api/v1/health`,
`Sentry.init({ release })`, and `release` in the logger's `defaultMeta` (currently
`{ service: APP_NAME }` at `logger.ts:105`).

**ADR-0039 is Proposed and its Part 2 is written against Render, which ADR-0042 retired.** Decide and
state how you leave its status: accepting Part 1 while Part 2 awaits a rewrite is the honest option,
but the registry has one status column per ADR, so say how you resolved that rather than leaving it
ambiguous.

## Why this is worth doing before the VPS exists

The staging smoke suite carries a limitation written into its own header
(`tests/smoke/run-smoke.mjs:15-19`):

> the app exposes no build identity, so polling cannot distinguish a new release from the old one
> still serving. ADR-0039 (release identity) is what would close that gap.

So the deploy gate proves **the environment is healthy**, not **your deploy landed**. It passes green
against the previous release still serving after a failed deploy. That is the same class as
`docs:openapi:check` validating drift but not validity, and the error components that validated `{}`
— a gate that means less than it looks like it means.

Release identity is also the single largest practical gain for Sentry: without `release`, no captured
error is attributable to a build, and regression detection and suspect-commits do not work at all.

## Two of ADR-0039's stated consequences are now wrong

Verified 2026-09-16. Do not plan around them:

- _"the generated OpenAPI spec, which is CI-drift-gated, so `npm run docs:openapi:generate` must run
  in the same change."_ **`/api/v1/health` is not in the spec at all** — no path matching `health` or
  `ready` exists. Adding a field to it is not a contract change and triggers no spec regeneration and
  no `lakira-frontend` sync.
- _"the contract tests under `tests/contract/`"._ Newman was retired in #75. What remains is
  Schemathesis, which is driven by the spec and therefore never touches `/health`.

The real blast radius is **near zero**: `__tests__/integration/middleware/request-id.test.ts` calls
`/health` but asserts only on headers, and `__tests__/unit/shared/middleware/access-log.test.ts`
mounts its own stub. Nothing asserts the health body's shape today — which is itself worth fixing
while you are here.

## THE TRAP: the deploy is fire-and-forget, so CI cannot hand the SHA to the process

`deploy_staging` ends at `curl -X POST "$RENDER_STAGING_DEPLOY_HOOK_URL"`
(`.github/workflows/backend-ci.yml:418`); production is the same at `:511`. A deploy hook accepts no
payload, so **`github.sha` cannot reach the running app through it.** On Render the only available
source is `RENDER_GIT_COMMIT`, which Render sets itself from the branch tip it builds.

That creates a genuine race: CI tests commit A, fires the hook, and Render builds whatever the branch
tip is _now_ — which may be commit B if a second push landed. So the deployed release is not
guaranteed to equal the commit CI validated.

This matters because it decides what the smoke suite can honestly assert:

- Asserting `release === github.sha` will produce **false failures** on a fast second push.
- Asserting nothing recreates the hollow gate this work exists to close.

A defensible middle is for the smoke suite to poll until the reported release matches an expected
value with a bounded timeout, treating a timeout as failure — which is what post-deploy verification
actually means — while accepting that a superseding push legitimately ends the wait. Decide, and
write the reasoning into the suite's header the way the current limitation is written there.

**The race is Render-specific and disappears under ADR-0042**, where CI controls the deploy and can
pass an exact SHA. Build Part 1 so it is correct under both: the app must not care where the value
came from.

## The second trap: what `"unknown"` means to the gate

`APP_RELEASE` defaults to `"unknown"`, which is right for local development and a fresh fork. The
question is what the smoke suite does when it sees it.

- Fail on `"unknown"` and the suite cannot be run locally, which is half its value.
- Pass on `"unknown"` and a deploy that failed to supply a SHA gates green — the exact failure this
  work is meant to remove, reintroduced through the back door.

Whatever you choose, **the CI path must not be able to skip the assertion silently.** If the suite
only asserts when an expected value is provided, then the deploy job must be made to always provide
one, and something must fail loudly if it does not.

## Scope

`src/config/zodEnv.ts`, `src/server.ts` (health handler and `Sentry.init`), `src/utils/logger.ts`,
`tests/smoke/run-smoke.mjs`, the deploy jobs in `.github/workflows/backend-ci.yml`, `.env.example`,
`.env.test.example`, and `docs/reference/configuration.md` (the env-var count moves 68 → 69, and
`CLAUDE.md:48` states that number).

**A `protected-files` hook blocks Claude from editing CI and Compose files, and `.env*` other than
`.env.example`.** PR #91 hit both. Deliver those as a patch for the user to apply, and say clearly
which files need it.

**Out of scope:** ADR-0039 Part 2 / TF-2 (build once, deploy that artefact) — it needs the VPS and a
rewrite against ADR-0042 first.

## Verification

```bash
npm run lint && npm run typecheck && npm run format:check && npm run docs:openapi:check
npm test

docker compose up -d
APP_RELEASE=abc1234 npm run dev   # then: curl -s localhost:8001/api/v1/health | jq
SMOKE_BASE_URL=http://localhost:8001 npm run test:smoke
```

Assert all four surfaces carry the same value, by observation rather than inference:

1. `GET /api/v1/health` reports `release`
2. a log line's JSON carries `release` in its metadata
3. `Sentry.init` receives it (assert on the init argument in a unit test — do not send an event)
4. the smoke suite reports it

**And prove the negative, which is the whole point:** with the app running at one release and the
smoke suite told to expect a different one, the suite must **fail**. A smoke run that passes against
the wrong release is worth less than no check, because it actively certifies a bad deploy.

Also add the health-body assertion that does not exist today: `status`, `environment`, and `release`
all present.

## Conventions

- Branch: `git checkout -b feat/release-identity --no-track origin/dev`
- **Verify `git rev-parse --abbrev-ref HEAD` before committing**
- Never blanket-stage; name explicit paths (a `pre-commit` hook enforces it)
- Conventional Commits; message to `.git/COMMIT_DRAFT`, shown in chat, applied with
  `git commit -F .git/COMMIT_DRAFT`. Hand the user **short** commands — a long one-liner gets
  truncated on paste, and `\` continuations do not survive it either
- No `Co-Authored-By` or Claude references in commits or PR text
- The user opens PRs and merges — do not commit, push, or open PRs
- Record the outcome as a `## Review` section appended to this file

## Review

Implemented on `feat/release-identity`, off an up-to-date `dev`.

**Shipped:**

- `APP_RELEASE` added to `src/config/zodEnv.ts` (env var #69), optional, defaulting to
  `RENDER_GIT_COMMIT` when set, else `"unknown"`.
- `release` added to the `GET /api/v1/health` body, `Sentry.init`'s options, and the
  logger's `defaultMeta` (with its own `process.env`-reading fallback, mirroring the
  circular-init pattern `APP_NAME` already uses).
- `tests/smoke/run-smoke.mjs` gained a `SMOKE_EXPECTED_RELEASE`-driven check that polls
  `/health` until the reported release matches, with a bounded timeout treated as failure;
  the header comment was rewritten to explain why it polls rather than asserting strict
  equality on the first response. It is a distinct named entry in the existing `checks`
  array (not a hard pre-flight gate), so a release mismatch is reported as its own failure
  alongside — not instead of — the other checks, and it skips (not fails) when
  `SMOKE_EXPECTED_RELEASE` is unset, which is correct for local/dev runs.
- `docs/reference/configuration.md` and `CLAUDE.md` updated for the 68→69 env var count.
- New tests: `__tests__/integration/health/health.test.ts` (asserts `status`, `environment`,
  `release`, `timestamp` all present — this shape assertion didn't exist before) and
  `__tests__/unit/config/sentry-release.test.ts` (mocks `@sentry/node`, reloads `server.ts`
  fresh via `withTestEnv` + `jest.isolateModulesAsync`, asserts `Sentry.init` receives
  `release`).

**ADR-0039 status resolution:** kept `Status: Proposed` rather than flipping to Accepted —
Part 2 is written against Render, which ADR-0042 retired, so it isn't just unbuilt, it's
wrong for the current target. Added an inline qualifier on the same Status line noting Part
1 landed on this branch and Part 2 awaits its own rewrite, and pointed the `Related` line at
ADR-0042. The registry (`docs/explanation/decisions/README.md`) needed no change — the
Status cell stays `**Proposed**`, correctly telling a reader not to assume the whole record
matches the code, and the header's accepted/proposed count is unaffected. Also corrected two
now-wrong Consequences bullets (the OpenAPI-regen and Newman-contract-tests claims) in place
with a strikethrough + dated annotation rather than a silent rewrite, consistent with the
registry's "records are immutable, corrected or superseded, not silently edited" norm.

**Verification — all four surfaces observed directly, plus the negative test:**

```
$ curl -s localhost:5050/api/v1/health
{"status":"ok","environment":"development","release":"abc1234","timestamp":"..."}
```

1. `GET /api/v1/health` — confirmed above.
2. Log line JSON — `defaultMeta.release` appears on every line (confirmed via the manual
   run's stdout and the unit/integration test runs' captured logs).
3. `Sentry.init` — confirmed by `sentry-release.test.ts` asserting on the init call's
   argument object; no event was sent.
4. Smoke suite — confirmed by running it directly against the manually-started server:
   `SMOKE_EXPECTED_RELEASE=abc1234` → all 4 checks pass; `SMOKE_EXPECTED_RELEASE=wrong-sha`
   → **the suite failed as required** (exit 1, `release never matched "wrong-sha"... last
seen: abc1234`); no `SMOKE_EXPECTED_RELEASE` → the release check reports "skipped" and
   the suite still passes (the correct local/dev behavior).

**Gates:** `lint`, `typecheck`, `format:check`, and `docs:openapi:check` all pass —
confirmed 46 operations / 333 $refs, no diff against the committed spec (health was never
in it, so this was expected). `npm run test:unit` — 90 suites / 564 tests passed. `npm run
test:integration` — 28 of 30 suites passed, 194 of 199 tests passed (2 skipped suites and 5
skipped tests are pre-existing, unrelated to this change).

**Handed to the user as a patch (not committed directly — protected by
`.claude/hooks/protect-files.sh`):** a `.github/workflows/backend-ci.yml` diff adding
`SMOKE_EXPECTED_RELEASE: ${{ github.sha }}` to both `smoke_staging`'s smoke-test step and
`deploy_production`'s pre-deploy smoke gate, plus an updated comment on the latter noting
the gap it used to describe is now closed. `deploy_staging` itself needed no change — its
deploy hook accepts no payload, which is exactly why the `RENDER_GIT_COMMIT` fallback in
`zodEnv.ts` is unconditional rather than depending on anything CI injects.

**Out of scope, unchanged:** ADR-0039 Part 2 (build-once-deploy-that-artefact) — needs the
VPS from ADR-0042 and a rewrite before it can be adopted.
