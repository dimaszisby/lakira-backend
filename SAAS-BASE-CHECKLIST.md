# SaaS Base Checklist

**Audit date:** 2026-09-29 (delta, fresh pass, fork dry-run and full re-grade, on Node 24)
**Full audit:** [`docs/internal/audits/saas-readiness/audit-2026-09-29.md`](docs/internal/audits/saas-readiness/audit-2026-09-29.md)
**Closeout summary:** [`docs/internal/audits/saas-readiness/FINAL-AUDIT-SUMMARY.md`](docs/internal/audits/saas-readiness/FINAL-AUDIT-SUMMARY.md)
**Kit overview:** [`docs/internal/audits/saas-readiness/README.md`](docs/internal/audits/saas-readiness/README.md)
**Verdict authority:** ADR-008 in [`decisions.md`](docs/internal/audits/saas-readiness/decisions.md)

## Verdict

> **GOLD WITH CAVEATS — reconfirmed; clean GOLD blocked by C1.** The strict ADR-001 fork-ready gate
> passes on Node 24: zero P0, all six empirical commands green, the six gated categories at 83% or
> more, and `LICENSE` + `.env.example` present. Multi-tenant row and cache isolation, refresh-token
> rotation, the production-unsafe env refusals and the Sentry and log redaction all hold up under
> re-test. The C1–C6 caveats were marked closed on 2026-09-24, but this run found three of those
> closures narrower than claimed. The one that blocks GOLD is **C1**: on a fresh fork,
> `bootstrap-fork.sh` leaves `.env.test` on the upstream database credentials, so the printed
> `npm test` fails at integration. The script is otherwise correct. C3 and C4 are open again at
> P2. No exploitable security hole was found.

## Fork-ready exit criteria

A repo is fork-ready only when **all four** hold (see ADR-001 in [`decisions.md`](docs/internal/audits/saas-readiness/decisions.md)):

| #   | Criterion                                                                                                                       | Status (2026-09-29)                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | Zero P0 gaps remaining                                                                                                          | Yes                                                                                |
| 2   | All six empirical commands green (`typecheck`, `lint`, `format:check`, `test`, `security:delta:check`, `docs:openapi:generate`) | Yes, on Node 24 (one known-flaky integration failure on a first run; reruns green) |
| 3   | Categories 1 (Auth), 4 (Security), 6 (DX), 7 (Testing), 8 (CI/CD), 11 (Forkability) at ≥80% (pass)                              | Yes: 83%, 94%, 92%, 92%, 92%, 83%                                                  |
| 4   | `LICENSE` and `.env.example` present at repo root                                                                               | Yes                                                                                |

**All four pass.** What keeps the verdict short of a clean GOLD is ADR-008's own condition, that
C1–C6 be closed.

## Scorecard (re-graded 2026-09-29)

Partial counts half toward a category's score.

| Category                                | Pass   | Partial | Fail  | N/A   |
| --------------------------------------- | ------ | ------- | ----- | ----- |
| 1. Authentication & Authorization       | 5      | 0       | 1     | 0     |
| 2. API Design & Contracts               | 4      | 2       | 0     | 0     |
| 3. Database Layer                       | 3      | 2       | 0     | 0     |
| 4. Security                             | 7      | 1       | 0     | 0     |
| 5. Error Handling & Observability       | 5      | 0       | 1     | 0     |
| 6. Developer Experience & Onboarding    | 5      | 1       | 0     | 0     |
| 7. Testing                              | 5      | 1       | 0     | 0     |
| 8. CI/CD & Deployment                   | 5      | 1       | 0     | 0     |
| 9. Multi-Tenancy & SaaS-Specific        | 2      | 1       | 2     | 0     |
| 10. Code Architecture & Maintainability | 2      | 3       | 0     | 0     |
| 11. Forkability                         | 4      | 2       | 0     | 0     |
| **Total (65 items)**                    | **47** | **14**  | **4** | **0** |

**Severity counts (open):** P0 = **0**. P1 = **1** (C1). P2: C3 and C4 residuals plus six new
findings (R1–R6 in the audit's § 6). The four Fails are by-design deferrals: OAuth, APM,
subscription/plan model, outbound webhooks.

## Empirical commands (2026-09-29, Node 24.21.0)

| Command                         | Result                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`             | exit 0                                                                                                                                  |
| `npm run lint`                  | exit 0                                                                                                                                  |
| `npm run format:check`          | exit 0                                                                                                                                  |
| `npm test`                      | unit exit 0 (96 suites / 621 tests); integration exit 0 (202 pass, 5 skipped) on reruns; the first run after `npm ci` hit a known flake |
| `npm run security:delta:check`  | exit 0 (2 medium dependency findings; 0 high/critical)                                                                                  |
| `npm run docs:openapi:generate` | exit 0 (regenerated spec byte-identical to committed)                                                                                   |

Also green, and run by CI: `build`, `docs:openapi:check`, `security:delta:gate`,
`contract:local:gate`. Run `npm test` as the project defines it (`test:unit` then
`test:integration`).

## Top gaps — path to clean GOLD

1. **C1 · Forkability (P1)** — a fresh fork's `npm test` fails at integration: `bootstrap-fork.sh`
   renames the database user in `.env` but not in `.env.test`, and the printed steps omit
   `db:migrate:test` and RabbitMQ. Hidden on any machine already running the upstream stack.
   [Todo](docs/internal/todos/2026-09-29-todo-fork-test-credentials.md).
2. **C3 · API Contracts (P2)** — unknown routes return an HTML 404; oversized or badly-encoded
   bodies return a masked 500; limiters answer outside the envelope.
   [Todo](docs/internal/todos/2026-09-29-todo-error-envelope-residuals.md).
3. **C4 · Architecture (P2)** — audience-prefixed deep imports (`@/features/shared/...`) pass the
   feature-boundary rule; nine live instances; no persisted negative tests.
   [Todo](docs/internal/todos/2026-09-22-todo-feature-boundary-rule-scope.md).
4. **R2 · Caching (P2)** — list cache keys ignore the name filter, so different filtered lists can
   share a cached page. [Todo](docs/internal/todos/2026-09-29-todo-list-cache-key-nested-filters.md).
   Fixed in kit `list-cache-key-filters`, pending a dated audit run to confirm it (ADR-002).
5. **R1 · Security (P2)** — `POST /auth/register` has no per-route rate limiter.
   [Todo](docs/internal/todos/2026-09-29-todo-register-rate-limiter.md).

Closed and confirmed on 2026-09-29: C2 (by decision), C5, C6, and the 2026-06-05 P0s N1 and N2
plus F1. Full evidence (file:line) is in the [dated audit](docs/internal/audits/saas-readiness/audit-2026-09-29.md).

## What's already strong (Pass-graded highlights)

- **Multi-tenancy:** `Organization` + `Membership`, `organizationId` on every domain table, repository-layer row isolation, tenant-scoped cache keys (ADR-0035), cross-org checks on every organization, invite and membership route.
- **Auth:** refresh-token family with single-use rotation + reuse-revocation; email verification; password reset; org-scoped RBAC via membership roles; Redis-backed login lockout; `TokenProvider.verify()` port.
- **Production safety:** startup refuses production-unsafe switches (ADR-0036, 0048, 0049), and the image defaults `NODE_ENV=production` (ADR-0050).
- **Observability:** request-ID propagation via AsyncLocalStorage + Winston correlation; logs to stdout with key-based redaction; Sentry with `scrubSentryEvent`; `/api/v1/ready` DB+Redis readiness probe.
- **Contracts:** one documented error envelope for handled errors, OpenAPI generated from Zod and gated on both drift and validity, Schemathesis fuzzing of 42 operations.
- **Forkability scaffolding:** `LICENSE`, root `README.md`, `CONTRIBUTING.md`, `.env.example`, `bootstrap-fork.sh` (validated `--name`, rotates `JWT_SECRET`, sets `APP_NAME`), `FORKED-FROM.md`.

## Re-running this audit

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run security:delta:check && npm run docs:openapi:generate
```

Then write the result to a new file `docs/internal/audits/saas-readiness/audit-YYYY-MM-DD.md` (do not overwrite a prior audit) and update this checklist to point at it. See the kit [`README.md`](docs/internal/audits/saas-readiness/README.md) for the full re-audit recipe. Include a fork dry-run on a machine, or a database, that has never run the upstream stack: that is what C1 needs. When C1–C6 are closed, a fresh dated run can restate the verdict as **GOLD** per ADR-008.
