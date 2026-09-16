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
