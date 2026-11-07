# SaaS GOLD re-audit — Decisions Log

`D-NN` entries scoped to this kit. ADR numbers without four digits (ADR-001, ADR-002, ADR-008)
refer to `docs/internal/audits/saas-readiness/decisions.md`, not the global registry.

---

## D-01 — Method: two-pass delegation, a fork dry-run, and a full re-grade

- **Status:** Accepted
- **Date:** 2026-09-29

**Context.** ADR-008 allows the verdict to be restated as GOLD only by a new dated run, once C1–C6
are closed. The last run (2026-06-05, at `a0301b6`) found zero code drift since the one before it.
This time 72 commits and 113 `src/` files have changed since `a0301b6`, so re-confirming status is
not enough.

**Decision.** Reuse the 2026-06-05 two-pass design (`audit-2026-06-05.md` §3): `architecture-auditor`
and `security-reviewer` in parallel, first a delta pass over C1–C6, the open N/F rows and the ADRs
since 06-05, then a fresh pass steered at the areas changed since `a0301b6`. Add a fork dry-run on a
`git archive` copy (as 2026-05-24 did), because C1 and C2 are fork-flow claims, and a full 65-item
re-grade, which the root checklist defers to this run. The main thread re-reads the cited lines of
every P0/P1 before it enters the record.

**Options considered.** A delta-only pass: rejected, because it cannot surface what 113 changed
files introduced. A single-agent or main-thread audit: rejected, because independence from the
sessions that closed the caveats is the point of the run.

**Consequences.** The run takes longer and costs more than a delta pass. Findings from agents are
claims until re-verified.

## D-02 — ADR-001's six commands decide criterion 2; newer CI gates are reported alongside

- **Status:** Accepted
- **Date:** 2026-09-29

**Context.** ADR-001 criterion 2 names six commands. CI now also runs `build`,
`docs:openapi:check` (which validates as well as diffs), `security:delta:gate` and
`contract:local:gate`.

**Decision.** Criterion 2 is evaluated on the six. The four newer gates are run and reported in the
same table, and a failure there is recorded as a finding, but it does not change the ADR-001
result.

**Options considered.** Folding the newer gates into criterion 2: rejected here, because that
amends ADR-001, which its own consequences say needs a follow-on decision in
`saas-readiness/decisions.md`. Raised as a recommendation if the run supports it.

**Consequences.** The gate reads the same as in every earlier run, so the runs stay comparable.

## D-03 — C1 is graded open-progressed, not closed: the fork's `npm test` still fails

- **Status:** Accepted
- **Date:** 2026-09-29

**Context.** C1 was marked Fixed (`8adf7b8`) with the claim that `bootstrap-fork.sh` creates
`.env.test` "so `npm test` runs out of the box" (`docs/tutorials/fork-and-rebrand.md:39`). The fork
dry-run (a fresh `--no-local` clone of `b12ec62`, `bootstrap-fork.sh --name acme-api`) shows the
script renames the database credentials in `.env` (`DB_USER=acme_user`,
`DB_PASSWORD=acme_password`) but not in `.env.test`, which keeps `lakira_user`/`lakira_password`
from `.env.test.example:10-15`. Compose creates only `DB_USER` from `.env`, and
`docker/db/init/01-create-dbs.sql` creates `lakira_test_db` owned by that user. A throwaway
`postgres:18` with the fork's settings refused `.env.test`'s credentials:
`password authentication failed for user "lakira_user"`. Integration tests read those credentials
(`src/config/db.ts`, `TEST_DATABASE_URL`), so the fork's printed step 4 fails at integration. Unit
tests, build and typecheck pass.

**Decision.** C1 is graded **open-progressed** at P1, its original severity. The secret rotation and
`APP_NAME` halves are confirmed; the "`npm test` works out of the box" half is not. Under ADR-008 the
verdict therefore cannot be restated as GOLD in this run.

**Options considered.** Grading it closed with a new, separate finding: rejected, because the failure
is the exact claim C1 was closed on. Downgrading to P2 because only integration fails: rejected, as
it is the forker's first command after setup, which is why C1 was P1 in the first place.

**Consequences.** The verdict of record stays GOLD WITH CAVEATS, with C1 as the single open caveat.
The residual is small (rename the credentials in `.env.test` too, or derive them from `.env`), so a
fix plus a later dated run can restate GOLD. The failure is invisible on any machine already running
the Lakira stack, because `lakira_user` exists in that database on the same port. That is why it
survived.

## D-04 — S1 (`/auth/register` has no per-route rate limiter) is P2

- **Status:** Accepted
- **Date:** 2026-09-29

**Context.** `router.ts:40-45` mounts `POST /auth/register` with no per-route limiter, unlike
`/login` (`userRateLimiter`). It dates from `dfb96d3` (2026-05-01), so it is a miss by every prior
run, not a regression. Registration sends a verification email to the submitted address, so the
route can be used to send mail to arbitrary recipients.

**Decision.** P2. The global limiter (100 requests per 15 minutes per IP) still bounds it, so it is
hardening, not an exploitable hole, and it does not touch tenant data.

**Options considered.** P1, on the email-abuse angle: rejected, because the global limit caps it and
nothing leaks. The security auditor's "MEDIUM" maps to P2.

**Consequences.** Category 4's rate-limiting item is graded Partial. The fix is a one-line limiter,
about an hour's work.

## D-05 — C3 and C4 are graded open-progressed at P2; C2 stays closed with a P3 residual

- **Status:** Accepted
- **Date:** 2026-09-29

**Context.** The architecture pass reported gaps in two closures, and the main thread reproduced
them. For **C3**, probing the app (`supertest` against `src/server.ts`) gave these results. An
unknown route returns Express's HTML 404 (`text/html`, no handler before `errorHandler`,
`server.ts:235`). An oversized body and an unsupported charset return a masked
`500 {"status":"error","message":"Internal Server Error"}` and go to Sentry
(`error.ts:81-88`). Every limiter answers `{status: 429, message}` outside the envelope
(`rate-limiter.ts:45-56`). For **C4**, a throwaway file linted with `npx eslint` showed the boundary
rule rejecting `@/features/metric/application/...` but accepting the audience-prefixed
`@/features/shared/auth/domain/...`. There are 9 such prefixed deep imports in `src/` today. For
**C2**, a fork with `APP_NAME=acme-api` regenerates its OpenAPI spec titled "Lakira API".

**Decision.** C3 and C4 are **open-progressed at P2**. The core of each closure holds (one envelope
in `error.ts`; ORM writes and `AppError` gone from domain and handlers), but each claim was broader
than the fix. C2 stays **closed**, as `saas-audit-closeout` D-01 accepted the runtime residual. The
build-time title leak is a new P3 residual, not a reopening.

**Options considered.** Reopening C3 and C4 at P1, their original severity: rejected, because the
original defects (three envelope shapes in `error.ts`; real ORM writes and HTTP status in the
domain) are fixed, and what remains does not mislead a forker the way C1 does. Grading them closed:
rejected, because each residual contradicts the exact claim the closure made.

**Consequences.** Three caveats are open at HEAD: C1 (P1), C3 (P2) and C4 (P2). C1 alone already
blocks GOLD under ADR-008 (D-03).

## D-06 — Testing: E2E stays Pass, and test-DB isolation is Partial

- **Status:** Accepted
- **Date:** 2026-09-29

**Context.** The architecture pass graded two Category 7 items down: E2E, because no workflow runs
`test:e2e`, and DB isolation, because of the `TRUNCATE` race. ADR-001 criterion 3 counts Category 7.

**Decision.** E2E stays **Pass**. The item is "E2E test setup (Jest `e2e` project)", and the project
exists (`jest.config.mjs:109-110`, `__tests__/e2e/auth-flow.e2e.test.ts`). CI coverage of it is
recorded as a finding instead. DB isolation is **Partial**. Work a test starts outside its own
lifetime reaches the next test's truncation. A deadlock from it was confirmed in the Postgres log on
2026-09-28 (#120), and a `TRUNCATE` failure with the same signature was seen on 2026-09-25.

**Options considered.** Grading E2E down on CI coverage: rejected, because it grades a different
item from the one written. Grading isolation Pass because each run uses a dedicated database:
rejected, because the observed deadlocks are an isolation failure.

**Consequences.** Category 7 is 5 Pass, 1 Partial. The scoring convention the earlier runs used
(Partial counts half; 05-24's "Cat 4 = 87.5%" is (6 + 0.5·2)/8) is applied throughout.
