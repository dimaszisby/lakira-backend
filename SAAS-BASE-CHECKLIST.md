# SaaS Base Checklist

**Audit date:** 2026-10-12 (grades for every caveat, fork dry-run, live reproductions and full re-grade, on Node 24)
**Full audit:** [`docs/internal/audits/saas-readiness/audit-2026-10-12.md`](docs/internal/audits/saas-readiness/audit-2026-10-12.md)
**Closeout summary:** [`docs/internal/audits/saas-readiness/FINAL-AUDIT-SUMMARY.md`](docs/internal/audits/saas-readiness/FINAL-AUDIT-SUMMARY.md)
**Kit overview:** [`docs/internal/audits/saas-readiness/README.md`](docs/internal/audits/saas-readiness/README.md)
**Verdict authority:** ADR-008 in [`decisions.md`](docs/internal/audits/saas-readiness/decisions.md)

## Verdict

> **GOLD WITH CAVEATS — reconfirmed; clean GOLD blocked by C5 alone, open-progressed at P2. C6,
> C4 and C3 are closed.** The strict ADR-001 fork-ready gate passes on Node 24: zero P0, all six
> empirical commands green on the first run after a clean install, the six gated categories at
> 83% or more, and `LICENSE` + `.env.example` present. Three of the four caveats the last run left
> open closed on the routes ADR-012 names, each graded closed by an independent grader and
> reproduced: a rejected connection URL is no longer printed and `DB_LOGGING` is refused in
> production (C6); the lint rule rejects every spelling of the `AppError` import in both domain
> layers (C4); the spec documents a 429 on 47 of 47 operations (C3). **C5** (P2) stays open: the
> Sentry scrubber now cleans the URL, the user, breadcrumbs and exception values, but with tracing
> on a transaction still carries the request's peer address. Reproduced. No exploitable security
> hole or cross-tenant exposure was found, and no new P0 or P1. Three P2 findings are open beside
> the caveat's own: `JWT_SECRET` accepts any non-empty value, and two ways the fork bootstrap
> mishandles a name or a database user it did not expect.

## Fork-ready exit criteria

A repo is fork-ready only when **all four** hold (see ADR-001 in [`decisions.md`](docs/internal/audits/saas-readiness/decisions.md)):

| #   | Criterion                                                                                                                       | Status (2026-10-12)                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1   | Zero P0 gaps remaining                                                                                                          | Yes                                       |
| 2   | All six empirical commands green (`typecheck`, `lint`, `format:check`, `test`, `security:delta:check`, `docs:openapi:generate`) | Yes, on Node 24, first run after `npm ci` |
| 3   | Categories 1 (Auth), 4 (Security), 6 (DX), 7 (Testing), 8 (CI/CD), 11 (Forkability) at ≥80% (pass)                              | Yes: 83%, 88%, 100%, 100%, 100%, 83%      |
| 4   | `LICENSE` and `.env.example` present at repo root                                                                               | Yes                                       |

**All four pass.** What keeps the verdict short of a clean GOLD is ADR-008's own condition, that
C1–C6 be closed: the grader kept C5 open.

## Scorecard (re-graded 2026-10-12)

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

**Severity counts (open):** P0 = **0**. P1 = **0**. P2: C5 (W1), W2, W3, plus T3 and R11 as their
grader rated them, R4 and the other P2 rows carried from 2026-09-29. The four Fails are by-design
deferrals: OAuth, APM, subscription/plan model, outbound webhooks.

## Empirical commands (2026-10-12, Node 24.21.0)

| Command                         | Result                                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `npm run typecheck`             | exit 0                                                                             |
| `npm run lint`                  | exit 0                                                                             |
| `npm run format:check`          | exit 0                                                                             |
| `npm test`                      | exit 0 on the first run after `npm ci`: unit 971 tests; integration 228, 5 skipped |
| `npm run security:delta:check`  | exit 0 (3 medium dependency findings; 0 high/critical)                             |
| `npm run docs:openapi:generate` | exit 0 (regenerated spec byte-identical to committed)                              |

Also green, and run by CI: `build`, `docs:openapi:check`, `security:delta:gate`,
`contract:local:gate`, `docker:smoke`. Run `npm test` as the project defines it (`test:unit` then
`test:integration`).

## Top gaps — path to clean GOLD

1. **C5 / W1 · Security (P2)** — with tracing on, a Sentry transaction carries the request's peer
   address (`net.peer.ip`, `net.host.ip`); the scrubber's drop list does not name them. Reproduced
   on the built server. The one thing between this repo and a clean GOLD.
   [Todo](docs/internal/todos/2026-10-12-todo-sentry-transaction-carries-peer-address.md).
2. **W2 · Security (P2)** — `JWT_SECRET` is accepted at any length, in production too; tokens are
   HS256. Reproduced with a one-character secret.
   [Todo](docs/internal/todos/2026-10-12-todo-jwt-secret-has-no-minimum-length.md).
3. **W3 · Forkability (P2)** — given a hand-made `.env` whose `DB_USER` is not the template's,
   bootstrap leaves `.env.test` on a different login and says it copied the password. Reproduced.
   [Todo](docs/internal/todos/2026-10-12-todo-fork-bootstrap-review-leftovers.md).
4. **T3 · Forkability (P3 on file, P2 from the grader)** — `--name lakira-x` names the workflow
   `Lakira X X Backend CI`, and a second run renames the database user again. Reproduced.
5. **R11 · Architecture (P2 from the grader)** — five domain repository interfaces import a type
   from the application layer, and no rule forbids it.
6. **W4 · Security (P3)** — the production refusal of `guest` RabbitMQ credentials reads the
   separate fields, and the connection uses `RABBITMQ_URL`.
7. **S10 · Forkability** — the Compose half is confirmed closed and bootstrap generates the
   database password. The script half stays open on W3. Redis and RabbitMQ keep their defaults,
   reachable from the host itself only.

Closed and confirmed in the run of 2026-10-12: C6 (V1, V2), C4 (V4), C3 (V5) and S9. Still closed:
C1, C2, S1 to S4, S7 and S8. Full evidence (file:line) is in the
[dated audit](docs/internal/audits/saas-readiness/audit-2026-10-12.md).

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

Then write the result to a new file `docs/internal/audits/saas-readiness/audit-YYYY-MM-DD.md` (do not overwrite a prior audit) and update this checklist to point at it. See the kit [`README.md`](docs/internal/audits/saas-readiness/README.md) for the full re-audit recipe. Include a fork dry-run on a machine, or a database, that has never run the upstream stack: that is what C1 needs. When C1–C6 are closed, a fresh dated run can restate the verdict as **GOLD** per ADR-008.
