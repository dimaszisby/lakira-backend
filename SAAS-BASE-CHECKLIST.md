# SaaS Base Checklist

**Audit date:** 2026-10-03 (delta, fresh pass, fork dry-run through `npm test`, and full re-grade, on Node 24)
**Full audit:** [`docs/internal/audits/saas-readiness/audit-2026-10-03.md`](docs/internal/audits/saas-readiness/audit-2026-10-03.md)
**Closeout summary:** [`docs/internal/audits/saas-readiness/FINAL-AUDIT-SUMMARY.md`](docs/internal/audits/saas-readiness/FINAL-AUDIT-SUMMARY.md)
**Kit overview:** [`docs/internal/audits/saas-readiness/README.md`](docs/internal/audits/saas-readiness/README.md)
**Verdict authority:** ADR-008 in [`decisions.md`](docs/internal/audits/saas-readiness/decisions.md)

## Verdict

> **GOLD WITH CAVEATS — reconfirmed; clean GOLD blocked by C4 and two new P1 findings.** The strict
> ADR-001 fork-ready gate passes on Node 24: zero P0, all six empirical commands green on the first
> run after a clean install, the six gated categories at 83% or more, and `LICENSE` +
> `.env.example` present. Of the three caveats reopened on 2026-09-29, **C1 and C3 are now closed**:
> a fresh fork's printed steps were executed end to end, `npm test` included, and every error path
> answers through one envelope. **C4 is still open at P2**: the boundary rule misses `src/types/`
> and application-to-infrastructure imports. Two findings are new and block a clean GOLD: **S1**,
> the response cache stores error bodies and replays them with status 200, and **S2**, a fork's
> `npm run docs:openapi:check` cannot pass. No exploitable security hole or cross-tenant exposure
> was found.

## Fork-ready exit criteria

A repo is fork-ready only when **all four** hold (see ADR-001 in [`decisions.md`](docs/internal/audits/saas-readiness/decisions.md)):

| #   | Criterion                                                                                                                       | Status (2026-10-03)                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1   | Zero P0 gaps remaining                                                                                                          | Yes                                       |
| 2   | All six empirical commands green (`typecheck`, `lint`, `format:check`, `test`, `security:delta:check`, `docs:openapi:generate`) | Yes, on Node 24, first run after `npm ci` |
| 3   | Categories 1 (Auth), 4 (Security), 6 (DX), 7 (Testing), 8 (CI/CD), 11 (Forkability) at ≥80% (pass)                              | Yes: 83%, 88%, 100%, 100%, 100%, 83%      |
| 4   | `LICENSE` and `.env.example` present at repo root                                                                               | Yes                                       |

**All four pass.** What keeps the verdict short of a clean GOLD is ADR-008's own condition, that
C1–C6 be closed, and two P1 findings the 2026-10-03 run recorded as blocking it.

## Scorecard (re-graded 2026-10-03)

Partial counts half toward a category's score.

| Category                                | Pass   | Partial | Fail  | N/A   |
| --------------------------------------- | ------ | ------- | ----- | ----- |
| 1. Authentication & Authorization       | 5      | 0       | 1     | 0     |
| 2. API Design & Contracts               | 4      | 2       | 0     | 0     |
| 3. Database Layer                       | 3      | 2       | 0     | 0     |
| 4. Security                             | 6      | 2       | 0     | 0     |
| 5. Error Handling & Observability       | 5      | 0       | 1     | 0     |
| 6. Developer Experience & Onboarding    | 6      | 0       | 0     | 0     |
| 7. Testing                              | 6      | 0       | 0     | 0     |
| 8. CI/CD & Deployment                   | 6      | 0       | 0     | 0     |
| 9. Multi-Tenancy & SaaS-Specific        | 2      | 1       | 2     | 0     |
| 10. Code Architecture & Maintainability | 2      | 3       | 0     | 0     |
| 11. Forkability                         | 4      | 2       | 0     | 0     |
| **Total (65 items)**                    | **49** | **12**  | **4** | **0** |

**Severity counts (open):** P0 = **0**. P1 = **2** (S1, S2). P2: the C4 residual (S5, S6) and S3,
S4, S7 to S10, plus R4 carried. The four Fails are by-design deferrals: OAuth, APM,
subscription/plan model, outbound webhooks.

## Empirical commands (2026-10-03, Node 24.21.0)

| Command                         | Result                                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `npm run typecheck`             | exit 0                                                                             |
| `npm run lint`                  | exit 0                                                                             |
| `npm run format:check`          | exit 0                                                                             |
| `npm test`                      | exit 0 on the first run after `npm ci`: unit 705 tests; integration 219, 5 skipped |
| `npm run security:delta:check`  | exit 0 (3 medium dependency findings; 0 high/critical)                             |
| `npm run docs:openapi:generate` | exit 0 (regenerated spec byte-identical to committed)                              |

Also green, and run by CI: `build`, `docs:openapi:check`, `security:delta:gate`,
`contract:local:gate`, `docker:smoke`. Run `npm test` as the project defines it (`test:unit` then
`test:integration`).

## Top gaps — path to clean GOLD

1. **S1 · Caching (P1)** — the response cache stores error bodies and replays them with status 200
   (reproduced: a 404 came back as 200 for the next minute).
   [Todo](docs/internal/todos/2026-10-03-todo-cache-replays-error-responses.md).
2. **S2 · Forkability (P1)** — a fork's `npm run docs:openapi:check` exits 128, because bootstrap
   renames the spec path in `package.json` but not the file, so the fork's CI fails on first push.
   With it: bootstrap ordering (S3, S4) and unrotated service passwords (S10).
   [Todo](docs/internal/todos/2026-10-03-todo-fork-openapi-gate-and-bootstrap-order.md).
3. **C4 · Architecture (P2)** — the boundary rule misses cross-feature imports through `src/types/`
   and application code importing infrastructure.
   [Todo](docs/internal/todos/2026-10-03-todo-boundary-rule-types-and-application-infra.md).
4. **S7 · Data (P2)** — the dashboard's latest value has no tiebreaker (against ADR-0052).
   [Todo](docs/internal/todos/2026-10-03-todo-dashboard-latest-value-tiebreaker.md).
5. **S8 · Security (P2)** — two rate-limiter log lines carry an email address.
   [Todo](docs/internal/todos/2026-10-03-todo-limiter-logs-email-address.md).
6. **S9 · Security (P2)** — the readiness probe is unthrottled and checks the database on every
   call. [Todo](docs/internal/todos/2026-10-03-todo-readiness-probe-unthrottled.md).

Closed and confirmed on 2026-10-03: C1, C3, and the 2026-09-29 findings R1, R2, R3, R5 and R6.
Confirmed closed since 2026-09-29: C2 (by decision), C5, C6. Full evidence (file:line) is in the
[dated audit](docs/internal/audits/saas-readiness/audit-2026-10-03.md).

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
