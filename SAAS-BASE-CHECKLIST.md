# SaaS Base Checklist

**Audit date:** 2026-11-14 (four independent graders from a session that wrote none of the window, fork dry-run, live reproductions and full re-grade, on Node 24)
**Full audit:** [`docs/internal/audits/saas-readiness/audit-2026-11-14.md`](docs/internal/audits/saas-readiness/audit-2026-11-14.md)
**Closeout summary:** [`docs/internal/audits/saas-readiness/FINAL-AUDIT-SUMMARY.md`](docs/internal/audits/saas-readiness/FINAL-AUDIT-SUMMARY.md)
**Kit overview:** [`docs/internal/audits/saas-readiness/README.md`](docs/internal/audits/saas-readiness/README.md)
**Verdict authority:** ADR-001 and ADR-008 in [`decisions.md`](docs/internal/audits/saas-readiness/decisions.md)

## Verdict

> **NOT FORK-READY — the strict ADR-001 gate fails on criterion 3: category 1 (Authentication and
> Authorization) is at 67%, below 80%. Clean GOLD is not restated either: X62 is open at P3.** The
> run confirms the work since 2026-10-20: the worker's consumer cancel now stops intake (**X60**),
> the six P2 findings of that run are closed and reproduced, and every caveat C1 to C6 holds closed
> on its named routes. A fresh pass over authentication found two account-security gaps, both
> reproduced: a password reset or change revokes no session (**Y6**), and the email changes on a
> bearer token alone and stays verified (**Y7**). They move password reset and email verification
> to Partial. **X62** is narrowed from P1 to P3: no job waits on a second connection any more, but
> an email is still sent inside the job's transaction, so a slow provider can push jobs past the
> pool's 60 s acquire timeout. No P0, no P1, no cross-tenant exposure. Eight new P2 findings are
> open.

## Fork-ready exit criteria

A repo is fork-ready only when **all four** hold (see ADR-001 in [`decisions.md`](docs/internal/audits/saas-readiness/decisions.md)):

| #   | Criterion                                                                                                                       | Status (2026-11-14)                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Zero P0 gaps remaining                                                                                                          | Yes                                                                                                                                    |
| 2   | All six empirical commands green (`typecheck`, `lint`, `format:check`, `test`, `security:delta:check`, `docs:openapi:generate`) | Yes, on Node 24 in a CI-like container and in CI; the macOS host's `npm test` failures had an environmental cause, since fixed by #303 |
| 3   | Categories 1 (Auth), 4 (Security), 6 (DX), 7 (Testing), 8 (CI/CD), 11 (Forkability) at ≥80% (pass)                              | **No**: 67%, 88%, 100%, 100%, 92%, 92%                                                                                                 |
| 4   | `LICENSE` and `.env.example` present at repo root                                                                               | Yes                                                                                                                                    |

**Criterion 3 fails, on category 1.** Fixing Y6 and Y7 returns it to 83%.

## Scorecard (re-graded 2026-11-14)

Partial counts half toward a category's score.

| Category                                | Pass   | Partial | Fail  | N/A   |
| --------------------------------------- | ------ | ------- | ----- | ----- |
| 1. Authentication & Authorization       | 3      | 2       | 1     | 0     |
| 2. API Design & Contracts               | 6      | 0       | 0     | 0     |
| 3. Database Layer                       | 3      | 2       | 0     | 0     |
| 4. Security                             | 6      | 2       | 0     | 0     |
| 5. Error Handling & Observability       | 4      | 1       | 1     | 0     |
| 6. Developer Experience & Onboarding    | 6      | 0       | 0     | 0     |
| 7. Testing                              | 6      | 0       | 0     | 0     |
| 8. CI/CD & Deployment                   | 5      | 1       | 0     | 0     |
| 9. Multi-Tenancy & SaaS-Specific        | 2      | 1       | 2     | 0     |
| 10. Code Architecture & Maintainability | 3      | 2       | 0     | 0     |
| 11. Forkability                         | 5      | 1       | 0     | 0     |
| **Total (65 items)**                    | **49** | **12**  | **4** | **0** |

**Severity counts (open):** P0 = **0**. P1 = **0**. P2: eight new (Y6, Y7, Y11, Y20, Y22, Y61, Y62,
Y64), plus X7 and #238 kept on purpose and N7. X62 is open at P3 and gates GOLD. The four Fails are
by-design deferrals: OAuth, APM, subscription/plan model, outbound webhooks.

## Empirical commands (2026-11-14, Node 24)

| Command                         | Result                                                                                                                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`             | exit 0                                                                                                                                                                                              |
| `npm run lint`                  | exit 0                                                                                                                                                                                              |
| `npm run format:check`          | exit 0                                                                                                                                                                                              |
| `npm test`                      | exit 0 three runs of three in a Linux container like CI's job: unit 1786; integration 328, 7 skipped. On the macOS host, exit 1 three times, each a request answered by another process (audit § 2) |
| `npm run security:delta:check`  | exit 0 (7 medium dependency findings; 0 high/critical)                                                                                                                                              |
| `npm run docs:openapi:generate` | exit 0 (regenerated spec identical to committed)                                                                                                                                                    |

Also green: `build`, `docs:openapi:check`, `security:delta:gate`, `test:coverage` (thresholds
enforced), `docker:smoke`, and CI on `6a0eb2a`. `contract:local:gate` exits 1 on three operations
whose spec admits values the API refuses (Y22); CI runs the `quick` profile.

## Top gaps — path back to fork-ready, then GOLD

1. **Y6 · Auth (P2)** — a password reset or change revokes no session: a stolen refresh cookie keeps
   working for 30 days. Reproduced. #308.
2. **Y7 · Auth (P2)** — the email and the password change on a bearer token alone, and a changed
   address stays verified; `requireVerifiedEmail` guards no route. Reproduced. #309.
3. **X62 · Queue (P3, gates GOLD)** — an email is sent inside its job's transaction, so a slow
   provider can push waiting jobs past the 60 s acquire timeout. Reproduced. #310.
4. **Y61 · Queue (P2)** — a channel the broker closes is never reopened while the connection stays
   up: the worker stays alive and consumes nothing. Reproduced. #312.
5. **Y62 · Observability (P2)** — the worker reports to no error monitor. #313.

Closed and confirmed in the run of 2026-11-14: X60, X1, X20, X40, X41, X61, X63, and again C1 to
C6, S1 and S2. Full evidence (file:line) is in the
[dated audit](docs/internal/audits/saas-readiness/audit-2026-11-14.md).

## What's already strong (Pass-graded highlights)

- **Multi-tenancy:** `Organization` + `Membership`, `organizationId` on every domain table, repository-layer row isolation, tenant-scoped cache keys (ADR-0035), cross-org checks on every organization, invite and membership route. No cross-tenant read or write found on 2026-11-14.
- **Auth:** refresh-token family with single-use rotation + reuse-revocation, the cookie scoped to the auth routes; org-scoped RBAC via membership roles; Redis-backed login lockout; `TokenProvider.verify()` port. Password reset and email verification work, and are Partial on Y6 and Y7.
- **Production safety:** startup refuses production-unsafe switches in production and staging (ADR-0036, 0048, 0049, 0088, 0089), the database certificate is verified, and the image defaults `NODE_ENV=production` (ADR-0050).
- **Observability:** request-ID propagation via AsyncLocalStorage, across the queue too; logs to stdout with key-based redaction; Sentry in the API with every hook guarded and span attributes by allowlist (ADR-0091); `/api/v1/ready` DB+Redis readiness probe.
- **Contracts:** one documented error envelope for every error path, rate limits included (ADR-0057), OpenAPI generated from Zod and gated on both drift and validity, Schemathesis fuzzing of 42 operations.
- **Queue:** a consumer cancelled on SIGTERM stops intake and drains; a job holds one connection; a broken channel fails over to the process (ADR-0077, ADR-0080).
- **Forkability scaffolding:** `LICENSE`, root `README.md`, `CONTRIBUTING.md`, `.env.example`, `bootstrap-fork.sh` (validated `--name`, rotates `JWT_SECRET`, generates the database password and the broker login, prefixes the Compose names, sets `APP_NAME`), `FORKED-FROM.md`.

## Re-running this audit

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run security:delta:check && npm run docs:openapi:generate
```

Then write the result to a new file `docs/internal/audits/saas-readiness/audit-YYYY-MM-DD.md` (do not overwrite a prior audit) and update this checklist to point at it. See the kit [`README.md`](docs/internal/audits/saas-readiness/README.md) for the full re-audit recipe. Include a fork dry-run on a machine, or a database, that has never run the upstream stack: that is what C1 needs. Publish any throwaway services below port 49152, and keep a multi-day run's evidence under `.git/`, not `/tmp`. When Y6, Y7 and X62 are fixed, a fresh dated run can restate the verdict as **GOLD** per ADR-008.
