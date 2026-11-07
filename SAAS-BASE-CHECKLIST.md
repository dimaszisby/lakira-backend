# SaaS Base Checklist

**Audit date:** 2026-10-20 (four independent graders, fork dry-run, live reproductions and full re-grade, on Node 24)
**Full audit:** [`docs/internal/audits/saas-readiness/audit-2026-10-20.md`](docs/internal/audits/saas-readiness/audit-2026-10-20.md)
**Closeout summary:** [`docs/internal/audits/saas-readiness/FINAL-AUDIT-SUMMARY.md`](docs/internal/audits/saas-readiness/FINAL-AUDIT-SUMMARY.md)
**Kit overview:** [`docs/internal/audits/saas-readiness/README.md`](docs/internal/audits/saas-readiness/README.md)
**Verdict authority:** ADR-008 in [`decisions.md`](docs/internal/audits/saas-readiness/decisions.md)

## Verdict

> **GOLD WITH CAVEATS — reconfirmed; every caveat is closed on its named routes, and clean GOLD is
> blocked by two new P1 findings in the queue worker.** The strict ADR-001 fork-ready gate passes
> on Node 24: zero P0, all six empirical commands green on the first run after a clean install, the
> six gated categories at 83% or more, and `LICENSE` + `.env.example` present. For the first time,
> C1 to C6, S1 and S2 are all closed-confirmed, each graded closed by an independent grader and
> reproduced. **C5** closed: with tracing on, the built server sent Sentry no address, token,
> cookie, email address or query string. Two findings stand in the way, both P1 and both
> reproduced: concurrent email jobs stall for 60 s on the database connection pool (**X62**), and
> the worker's shutdown does not stop taking messages (**X60**). No exploitable security hole or
> cross-tenant exposure was found. Six P2 findings are open beside them.

## Fork-ready exit criteria

A repo is fork-ready only when **all four** hold (see ADR-001 in [`decisions.md`](docs/internal/audits/saas-readiness/decisions.md)):

| #   | Criterion                                                                                                                       | Status (2026-10-20)                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1   | Zero P0 gaps remaining                                                                                                          | Yes                                       |
| 2   | All six empirical commands green (`typecheck`, `lint`, `format:check`, `test`, `security:delta:check`, `docs:openapi:generate`) | Yes, on Node 24, first run after `npm ci` |
| 3   | Categories 1 (Auth), 4 (Security), 6 (DX), 7 (Testing), 8 (CI/CD), 11 (Forkability) at ≥80% (pass)                              | Yes: 83%, 88%, 100%, 100%, 100%, 92%      |
| 4   | `LICENSE` and `.env.example` present at repo root                                                                               | Yes                                       |

**All four pass.** What keeps the verdict short of a clean GOLD is two P1 findings the run's
verdict rule holds to block it (kit D-03): no caveat is open.

## Scorecard (re-graded 2026-10-20)

Partial counts half toward a category's score.

| Category                                | Pass   | Partial | Fail  | N/A   |
| --------------------------------------- | ------ | ------- | ----- | ----- |
| 1. Authentication & Authorization       | 5      | 0       | 1     | 0     |
| 2. API Design & Contracts               | 6      | 0       | 0     | 0     |
| 3. Database Layer                       | 3      | 2       | 0     | 0     |
| 4. Security                             | 6      | 2       | 0     | 0     |
| 5. Error Handling & Observability       | 5      | 0       | 1     | 0     |
| 6. Developer Experience & Onboarding    | 6      | 0       | 0     | 0     |
| 7. Testing                              | 6      | 0       | 0     | 0     |
| 8. CI/CD & Deployment                   | 6      | 0       | 0     | 0     |
| 9. Multi-Tenancy & SaaS-Specific        | 2      | 1       | 2     | 0     |
| 10. Code Architecture & Maintainability | 3      | 2       | 0     | 0     |
| 11. Forkability                         | 5      | 1       | 0     | 0     |
| **Total (65 items)**                    | **53** | **8**   | **4** | **0** |

**Severity counts (open):** P0 = **0**. P1 = **2**: X62, X60. P2: six new (X1, X20, X40, X41, X61,
X63), plus R4 carried from 2026-09-29. The four Fails are by-design deferrals: OAuth, APM,
subscription/plan model, outbound webhooks.

## Empirical commands (2026-10-20, Node 24.22.0)

| Command                         | Result                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `npm run typecheck`             | exit 0                                                                              |
| `npm run lint`                  | exit 0                                                                              |
| `npm run format:check`          | exit 0                                                                              |
| `npm test`                      | exit 0 on the first run after `npm ci`: unit 1437 tests; integration 283, 5 skipped |
| `npm run security:delta:check`  | exit 0 (3 medium dependency findings; 0 high/critical)                              |
| `npm run docs:openapi:generate` | exit 0 (regenerated spec identical to committed)                                    |

Also green, and run by CI: `build`, `docs:openapi:check`, `security:delta:gate`, `test:coverage`
(thresholds enforced), `contract:local:gate` (1446 cases), `docker:smoke`. Run `npm test` as the
project defines it (`test:unit` then `test:integration`).

## Top gaps — path to clean GOLD

1. **X62 · Queue (P1)** — the email handlers hold a transaction's connection and ask the pool for a
   second; with the default pool of five, twelve queued emails stalled 61 s and seven failed into
   retry. Reproduced. [Todo](docs/internal/todos/2026-10-20-todo-email-handlers-wait-on-the-pool.md).
2. **X60 · Queue (P1)** — `RabbitMQConsumer.cancel()` cancels nothing, so a stopping worker keeps
   taking messages until its channel closes. Reproduced on the broker's consumer list.
   [Todo](docs/internal/todos/2026-10-20-todo-worker-consumer-cancel-is-a-no-op.md).
3. **X1 · Security (P2)** — a production database connection may run with TLS verification off, and
   `.env.example` ships it off. Reproduced.
   [Todo](docs/internal/todos/2026-10-20-todo-production-database-tls-verification-off.md).
4. **X61 · Security (P2)** — a database failure inside `authMiddleware` answers 401 "Invalid token"
   and is not logged. Reproduced.
   [Todo](docs/internal/todos/2026-10-20-todo-auth-middleware-hides-infrastructure-errors.md).
5. **X63 · Reliability (P2)** — a broker declaration mismatch takes the API process down. Reproduced.
   [Todo](docs/internal/todos/2026-10-20-todo-broker-setup-failure-stops-the-api.md).
6. **X20 · API (P2)** — `GET /metric-logs/stats` answers 500 past about 150,000 logs. Reproduced.
   [Todo](docs/internal/todos/2026-10-20-todo-metric-log-stats-loads-every-row.md).
7. **X40, X41 · Architecture (P2)** — inner layers can import infrastructure by relative path, or
   through another feature's `public.ts`. Reproduced by lint.
   [Todo](docs/internal/todos/2026-10-20-todo-inner-layers-reach-infrastructure.md).

Closed and confirmed in the run of 2026-10-20: C5 (V3, W1), and again C1 to C4, C6, S1 and S2;
the last run's W1 to W5 and T3. Full evidence (file:line) is in the
[dated audit](docs/internal/audits/saas-readiness/audit-2026-10-20.md).

## What's already strong (Pass-graded highlights)

- **Multi-tenancy:** `Organization` + `Membership`, `organizationId` on every domain table, repository-layer row isolation, tenant-scoped cache keys (ADR-0035), cross-org checks on every organization, invite and membership route.
- **Auth:** refresh-token family with single-use rotation + reuse-revocation; email verification; password reset; org-scoped RBAC via membership roles; Redis-backed login lockout; `TokenProvider.verify()` port.
- **Production safety:** startup refuses production-unsafe switches (ADR-0036, 0048, 0049), and the image defaults `NODE_ENV=production` (ADR-0050).
- **Observability:** request-ID propagation via AsyncLocalStorage + Winston correlation; logs to stdout with key-based redaction; Sentry with `scrubSentryEvent` for headers and bodies; `/api/v1/ready` DB+Redis readiness probe.
- **Contracts:** one documented error envelope for every error path, rate limits included (ADR-0057), OpenAPI generated from Zod and gated on both drift and validity, Schemathesis fuzzing of 42 operations.
- **Forkability scaffolding:** `LICENSE`, root `README.md`, `CONTRIBUTING.md`, `.env.example`, `bootstrap-fork.sh` (validated `--name`, rotates `JWT_SECRET`, generates the database password, sets `APP_NAME`), `FORKED-FROM.md`.

## Re-running this audit

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run security:delta:check && npm run docs:openapi:generate
```

Then write the result to a new file `docs/internal/audits/saas-readiness/audit-YYYY-MM-DD.md` (do not overwrite a prior audit) and update this checklist to point at it. See the kit [`README.md`](docs/internal/audits/saas-readiness/README.md) for the full re-audit recipe. Include a fork dry-run on a machine, or a database, that has never run the upstream stack: that is what C1 needs. C1–C6 are closed; when X60 and X62 are fixed, a fresh dated run can restate the verdict as **GOLD** per ADR-008.
