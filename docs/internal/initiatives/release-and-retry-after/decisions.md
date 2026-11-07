# Decisions — release-and-retry-after

## D-01 — `/health` keeps naming the release

- **Status:** Accepted (merged in #190, `15555ca`)
- **Date:** 2026-10-19

**Context.** The 2026-10-12 audit (§ 6 W7) listed "`/health` returns the release unauthenticated".
ADR-0039 Part 1 put it there on purpose. The deploy smoke check (`tests/smoke/run-smoke.mjs`)
reads it without credentials to prove staging runs the commit just deployed, and lakira-frontend's
stack preflight wants it for the same reason locally (their F-61).
**Decision.** Keep it. The repository is public, and the frontend reads its commits without a
token, so the commit names nothing the source does not. A dated note on ADR-0039 records this.
**Options considered.** Behind authentication: the smoke check would need a credential just to read
a commit. Removed: undoes ADR-0039 Part 1, and Sentry and every log line carry the same value.
**Consequences.** Anyone can tell which commit a deployment runs. If the repository is ever made
private, this decision is the one to revisit.

## D-02 — Every 429 in the spec declares `Retry-After`

- **Status:** Accepted (merged in #190, `15555ca`)
- **Date:** 2026-10-19

**Context.** Every path that answers 429 already sends `Retry-After`: express-rate-limit 7.5.1 sets
it whenever `standardHeaders` is on, which every limiter sets, and the login lockout sets it in the
auth controller. The spec declared no header on any 429, so a client generated from it could not
read one.
**Decision.** A `RetryAfter` header component, `required`, an integer number of seconds of at
least 0. `TooManyRequestsError`, which every operation's 429 references, and the five 429s that
routes declare themselves point at it. Documented, not changed: nothing a route sends is different.
**Options considered.** Optional rather than required: every 429 sends it, and the contract gate's
header check holds a `required` header to that. An ADR: the precedent for documenting a header
already sent is a kit decision (`error-envelope-residuals` D-09, #168).
**Consequences.** The published contract changes, so lakira-frontend re-syncs the spec once.
`rate-limiter.envelope.test.ts` now asserts the header on every limiter's 429.

## D-03 — The Compose dev image carries the commit it was built from

- **Status:** Accepted (merged in #190, `15555ca`)
- **Date:** 2026-10-19

**Context.** Locally `/health` says `release: "unknown"`: nothing gives the dev image its commit.
lakira-frontend's stack preflight can then only compare the image's date with backend `dev`, so an
image built from another branch after `dev`'s newest commit passes (their F-61). Separately,
`.env.example` shipped `APP_RELEASE=` with no value; the schema kept the empty string, so `/health`
said `""` while the logger, which reads it with `||`, said `"unknown"`.
**Decision.** `Dockerfile.dev` takes `APP_RELEASE` as a build argument and sets it in the image,
after `npm install`. The Compose `app` and `worker` builds pass `${APP_RELEASE:-unknown}` from the
shell, so `APP_RELEASE=$(git rev-parse HEAD) docker compose up -d --build app` gives an image that
reports its commit. An empty value counts as unset in the schema, and `.env.example` comments the
line out.
**Options considered.** Set it under the service's `environment:`: an `up` without `--build` would
then label an old image with a new commit, the very failure the frontend's check exists to catch.
Read `.git` inside the container: `.dockerignore` excludes it, rightly.
**Consequences.** Without the variable an image says `unknown`, as before. It names the checkout's
`HEAD`, so uncommitted changes are not reflected. An existing `.env` that still holds `APP_RELEASE=`
overrides the image's value with an empty one, which now reads as `unknown`.
