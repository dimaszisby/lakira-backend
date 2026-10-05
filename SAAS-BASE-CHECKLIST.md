# SaaS Base Checklist

**Audit date:** 2026-10-05, second run (grades for every caveat, fork dry-run, live reproductions and full re-grade, on Node 24; finished 2026-10-06)
**Full audit:** [`docs/internal/audits/saas-readiness/audit-2026-10-05-b.md`](docs/internal/audits/saas-readiness/audit-2026-10-05-b.md)
**Closeout summary:** [`docs/internal/audits/saas-readiness/FINAL-AUDIT-SUMMARY.md`](docs/internal/audits/saas-readiness/FINAL-AUDIT-SUMMARY.md)
**Kit overview:** [`docs/internal/audits/saas-readiness/README.md`](docs/internal/audits/saas-readiness/README.md)
**Verdict authority:** ADR-008 in [`decisions.md`](docs/internal/audits/saas-readiness/decisions.md)

## Verdict

> **GOLD WITH CAVEATS — reconfirmed; clean GOLD blocked by C6 and C2, both open-progressed.** The
> strict ADR-001 fork-ready gate passes on Node 24: zero P0, all six empirical commands green on
> the first run after a clean install, the six gated categories at 83% or more, and `LICENSE` +
> `.env.example` present. Both fixes since the last run do what they were written to do and were
> reproduced: a duplicate registration no longer writes an email address or a password hash to the
> log, and a fork's OpenAPI spec describes the fork. The independent graders kept two caveats open
> all the same. **C6** (P3): an error nested inside log metadata is still written with its SQL and
> bound values through two routes that no call in the code reaches today. **C2** (P2): a fork
> deployed without `APP_NAME` as a platform variable brands itself as Lakira; the owner accepted
> that case by decision in September, and whether it still holds is the owner's call. No
> exploitable security hole or cross-tenant exposure was found, and no new P0 or P1.

## Fork-ready exit criteria

A repo is fork-ready only when **all four** hold (see ADR-001 in [`decisions.md`](docs/internal/audits/saas-readiness/decisions.md)):

| #   | Criterion                                                                                                                       | Status (2026-10-05)                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1   | Zero P0 gaps remaining                                                                                                          | Yes                                       |
| 2   | All six empirical commands green (`typecheck`, `lint`, `format:check`, `test`, `security:delta:check`, `docs:openapi:generate`) | Yes, on Node 24, first run after `npm ci` |
| 3   | Categories 1 (Auth), 4 (Security), 6 (DX), 7 (Testing), 8 (CI/CD), 11 (Forkability) at ≥80% (pass)                              | Yes: 83%, 88%, 100%, 100%, 100%, 83%      |
| 4   | `LICENSE` and `.env.example` present at repo root                                                                               | Yes                                       |

**All four pass.** What keeps the verdict short of a clean GOLD is ADR-008's own condition, that
C1–C6 be closed: the graders kept C6 and C2 open.

## Scorecard (re-graded 2026-10-05, second run)

Partial counts half toward a category's score.

| Category                                | Pass   | Partial | Fail  | N/A   |
| --------------------------------------- | ------ | ------- | ----- | ----- |
| 1. Authentication & Authorization       | 5      | 0       | 1     | 0     |
| 2. API Design & Contracts               | 5      | 1       | 0     | 0     |
| 3. Database Layer                       | 3      | 2       | 0     | 0     |
| 4. Security                             | 6      | 2       | 0     | 0     |
| 5. Error Handling & Observability       | 5      | 0       | 1     | 0     |
| 6. Developer Experience & Onboarding    | 6      | 0       | 0     | 0     |
| 7. Testing                              | 6      | 0       | 0     | 0     |
| 8. CI/CD & Deployment                   | 6      | 0       | 0     | 0     |
| 9. Multi-Tenancy & SaaS-Specific        | 2      | 1       | 2     | 0     |
| 10. Code Architecture & Maintainability | 2      | 3       | 0     | 0     |
| 11. Forkability                         | 4      | 2       | 0     | 0     |
| **Total (65 items)**                    | **50** | **11**  | **4** | **0** |

**Severity counts (open):** P0 = **0**. P1 = **0**. P2: C2 (U2), S9, S10, plus R4 and the other P2
rows carried from 2026-09-29. C6 is open at P3 (U1). The four Fails are by-design deferrals: OAuth, APM,
subscription/plan model, outbound webhooks.

## Empirical commands (2026-10-05, Node 24.21.0)

| Command                         | Result                                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `npm run typecheck`             | exit 0                                                                             |
| `npm run lint`                  | exit 0                                                                             |
| `npm run format:check`          | exit 0                                                                             |
| `npm test`                      | exit 0 on the first run after `npm ci`: unit 805 tests; integration 220, 5 skipped |
| `npm run security:delta:check`  | exit 0 (3 medium dependency findings; 0 high/critical)                             |
| `npm run docs:openapi:generate` | exit 0 (regenerated spec byte-identical to committed)                              |

Also green, and run by CI: `build`, `docs:openapi:check`, `security:delta:gate`,
`contract:local:gate`, `docker:smoke`. Run `npm test` as the project defines it (`test:unit` then
`test:integration`).

## Top gaps — path to clean GOLD

1. **C6 / U1 · Security (P3)** — an error nested inside log metadata is written with its SQL and
   bound values when the message has a `%j` or `%o` token, or when it sits five levels deep.
   Reproduced through the real logger; no call in `src/` reaches it today.
   [Todo](docs/internal/todos/2026-10-06-todo-nested-error-payload-in-logs.md).
2. **C2 / U2 · Forkability (P2)** — a fork deployed without `APP_NAME` as a platform variable
   brands itself as Lakira. An owner's decision of 2026-09-24 accepted this case; the grader kept
   C2 open on it. It needs the owner to reaffirm that decision or to make the missing variable
   loud. [Todo](docs/internal/todos/2026-10-06-todo-fork-deployed-without-app-name.md).
3. **S9 · Security (P2)** — the readiness probe is unthrottled and checks the database on every
   call. [Todo](docs/internal/todos/2026-10-03-todo-readiness-probe-unthrottled.md).
4. **S10 · Forkability (P2)** — bootstrap rotates `JWT_SECRET` only, and Compose publishes the
   database, Redis and RabbitMQ ports on all interfaces.
   [Todo](docs/internal/todos/2026-10-05-todo-fork-service-passwords-and-published-ports.md).

Closed and confirmed in the second run of 2026-10-05: T1 and T2. Still closed: C1, C3, C4, C5, S1
to S4, S7 and S8. Full evidence (file:line) is in the
[dated audit](docs/internal/audits/saas-readiness/audit-2026-10-05-b.md).

## What's already strong (Pass-graded highlights)

- **Multi-tenancy:** `Organization` + `Membership`, `organizationId` on every domain table, repository-layer row isolation, tenant-scoped cache keys (ADR-0035), cross-org checks on every organization, invite and membership route.
- **Auth:** refresh-token family with single-use rotation + reuse-revocation; email verification; password reset; org-scoped RBAC via membership roles; Redis-backed login lockout; `TokenProvider.verify()` port.
- **Production safety:** startup refuses production-unsafe switches (ADR-0036, 0048, 0049), and the image defaults `NODE_ENV=production` (ADR-0050).
- **Observability:** request-ID propagation via AsyncLocalStorage + Winston correlation; logs to stdout with key-based redaction; Sentry with `scrubSentryEvent`; `/api/v1/ready` DB+Redis readiness probe.
- **Contracts:** one documented error envelope for every error path, rate limits included (ADR-0057), OpenAPI generated from Zod and gated on both drift and validity, Schemathesis fuzzing of 42 operations.
- **Forkability scaffolding:** `LICENSE`, root `README.md`, `CONTRIBUTING.md`, `.env.example`, `bootstrap-fork.sh` (validated `--name`, rotates `JWT_SECRET`, sets `APP_NAME`), `FORKED-FROM.md`.

## Re-running this audit

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run security:delta:check && npm run docs:openapi:generate
```

Then write the result to a new file `docs/internal/audits/saas-readiness/audit-YYYY-MM-DD.md` (do not overwrite a prior audit) and update this checklist to point at it. See the kit [`README.md`](docs/internal/audits/saas-readiness/README.md) for the full re-audit recipe. Include a fork dry-run on a machine, or a database, that has never run the upstream stack: that is what C1 needs. When C1–C6 are closed, a fresh dated run can restate the verdict as **GOLD** per ADR-008.
