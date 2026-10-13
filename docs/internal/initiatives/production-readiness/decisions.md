# Production Readiness — Decisions Log

---

## ADR-001 — Account lockout: Redis sliding window vs express-brute

Promoted to the architecture decision registry as **[ADR-0032](../../../explanation/decisions/adr-0032-account-lockout-redis-sliding-window.md)**. That file is authoritative; this entry is a pointer.

## ADR-002 — e2e Jest project: add vs remove the broken script (Accepted 2026-05-18)

**Context:** `package.json` declares `npm run test:e2e` but `jest.config.mjs` has no `e2e` project and no `__tests__/e2e/` directory exists. The script fails today.

**Decision (proposed):**

1. **Add the project** rather than removing the script. The e2e layer is valuable for full-stack smoke tests (register → login → protected endpoint → logout).
2. Third Jest project config: `displayName: "e2e"`, `testMatch: ["__tests__/e2e/**/*.test.ts"]`, `testTimeout: 30_000`.
3. Start with a single placeholder `auth-flow.e2e.test.ts` that boots the full Express app via `supertest`.
4. e2e tests run in CI but do NOT block the `test` script (`npm test` stays unit + integration only). `npm run test:e2e` is opt-in.

**Status:** Accepted (2026-05-18).

**Implementation:** Third Jest project added in `jest.config.mjs` with `setupFilesAfterEnv: ["<rootDir>/jest.setup.e2e.ts"]` (no per-test truncation — e2e owns its data). First spec lives at `__tests__/e2e/auth-flow.e2e.test.ts` covering register → login → protected endpoint → logout.

**Options considered:**

- _Remove the script._ Rejected: the audit explicitly recommends adding the project, and e2e coverage is a genuine gap.
- _Use a separate framework (Playwright, Cypress)._ Rejected: this is a REST API, not a browser app. `supertest` + Jest is the right tool.

**Consequences:**

- CI needs PostgreSQL + Redis for e2e (already available from integration tests).
- Future e2e tests follow the same file structure (`__tests__/e2e/<flow>.e2e.test.ts`).

**Links:**

- `docs/internal/audits/saas-readiness/audit-2026-05-01.md` § 7.1
- `production-readiness-plan.md` § Phase D

## D-03 — The readiness probe runs its checks at most once per window

- **Status:** Accepted (merged in #156, `e9dedad`)
- **Date:** 2026-10-11

Numbered after ADR-001 and ADR-002 above; this log predates the `D-NN` form, which new entries use.

**Context.** `GET /api/v1/ready` is unauthenticated and mounted before the rate limiter, because a
platform probe must never be throttled. Every call ran `sequelize.authenticate()` and a Redis ping.
With the default pool of 5, anyone who can reach the port could send probes that compete with real
requests for connections, hardest when the database is already slow. Finding S9 of
`audit-2026-10-03.md`, at P2, open in every run since.
**Decision.** The checks sit behind `createReadinessProbe`
(`src/shared/utils/readiness-probe.ts`). A result is served for 2 seconds. Callers that arrive
while a check runs await that one check. A failed result is held for the same 2 seconds as a good
one. A check whose last run has not settled is reported `fail` and not started again. The route
stays where it is and answers with the same body.
**Options considered.** The probe behind the limiter: rejected, a throttled probe takes an instance
out of rotation. A limiter of its own: rejected, the same problem, and a platform's probes come
from few addresses. An env var for the window: rejected, a 70th variable for a value nobody has
asked to tune. Holding only good results: rejected, the cache would disappear exactly when the
database is down, which is when a flood costs most.
**Consequences.** Readiness can lag reality by up to 2 seconds in either direction. A platform that
probes every 5 or 10 seconds always gets a fresh check. A check that hangs past its
2 second budget keeps being reported `fail` until it settles, which for a database connection can
be Sequelize's 60 second acquire timeout; that is the price of never holding two pool connections
for the probe.
**From the review.** Graded closed. The reviewer listed one route outside S9: the probes run after
the body parsers and `xss-clean`, so a flood of requests with large bodies still costs CPU ahead of
the limiter. That is true of every route, since the limiter is mounted after the parsers. Filed as
`docs/internal/todos/2026-10-11-todo-probes-run-after-body-parsers.md`.

## D-04 — A request is counted before its body is parsed, and the probes parse none

- **Status:** Accepted
- **Date:** 2026-10-13

Promoted to the architecture decision registry as **[ADR-0061](../../../explanation/decisions/adr-0061-a-request-is-counted-before-its-body-is-parsed.md)**.
That file is authoritative; this entry is a pointer. Register row B-06; commits carry
`refs: limiter-before-body-parsers`.

**From the review.** A reviewer given the claim "no request body is parsed before the app-wide
limiter has counted the request, and the two probes parse no body" graded it closed, on every
path it could enumerate. Outside the claim it graded one P2: the test that guarded the order read
`server.ts` alone and by pattern, so an aliased import or a parser in a feature router would pass
it. That test now scans all of `src/`. Its P3 items are register row B-63.
