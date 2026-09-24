# SaaS Base Readiness — Independent "Gone-Gold" Review — 2026-05-24

**Branch:** `feat/cors-multi-origin` @ `a4c4a86`
**Auditor:** Claude (Opus 4.7), independent outside review — explicitly skeptical of the
2026-05-20 self-audit. Graded against industry standards (OWASP ASVS L1, RFC 6750/7807,
12-factor, PaaS deploy hygiene, multi-tenant row-isolation, draft-ietf-oauth refresh
rotation, JWT hygiene) **in addition to** the project's own `.claude/rules/*` + ADR-001.
**Method:** all six gates re-run (real exit codes); ≥18 Pass claims pressure-tested by reading
code; cross-temporal drift sweep via `architecture-auditor` subagent; live forkability
dry-run in an isolated `git archive` tree. Read-only — the only file written is this report;
the working tree is pristine after the run.

> **Baseline correction:** `audit-2026-05-20.md` is **stale relative to HEAD**. Its
> "NOT fork-ready" verdict was blocked by P1-4.2 (analytics env-reads) and P2-4.5 (single-
> origin CORS); both landed afterward (`302a335`, `a4c4a86`). This review audits the current
> tip and treats the 05-20 scorecard as the claim under test, not ground truth. ADR-007's
> framing that "closing P2-4.5 flips ADR-001 FAIL→PASS" is arithmetically incomplete — Cat 4
> was 5 pass/3 partial (62.5%); closing CORS alone gives 6/8 = 75% (still <80%). The gate only clears
> because **P1-4.2 also closed** (verified below). With both closed, Cat 4 = 7 pass/1 partial = 87.5%.

---

## 1. Verdict

**GOLD WITH CAVEATS.** The repo is defensibly publishable as a forkable SaaS base today, but
not a clean GOLD. Empirically: all six gates are green (verified, not trusted); the strict
ADR-001 fork-ready gate now **passes** (zero P0, six critical categories ≥80%, LICENSE +
`.env.example` present); and the load-bearing security claims hold up under code reading —
multi-tenant row isolation is enforced at the **repository** layer (not just middleware),
refresh-token rotation is single-use with family-revocation-on-reuse, email/password tokens
are 256-bit + SHA-256-hashed + single-use, `jsonwebtoken@9.0.3` rejects `alg:none` by
default, the Dockerfile and `deploy_production` gate are production-grade, and the fork tree
**builds + typechecks + unit-tests clean** after rename. No exploitable P0 remains. What
holds it back from clean GOLD is a cluster of real, non-blocking quality gaps an outside
reviewer would flag before recommending it as a base — chiefly that **the advertised fork
flow does not work as printed** (env-bootstrap + runtime branding leak), the **error
envelope is inconsistent, violates the repo's own `api-design.md`, and is undocumented in
the OpenAPI contract**, and the **architecture test is materially weaker than ADR-003
claims**, letting genuine DDD-layering breaches pass green. Each caveat is scoped to ≤1 day.

---

## 2. Empirical verification (all six gates re-run on HEAD)

| Command                         | Result | Real exit           | Notes                                                                                                                                                                                                                  |
| ------------------------------- | ------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`             | Yes    | `0`                 | Clean                                                                                                                                                                                                                  |
| `npm run lint`                  | Yes    | `0`                 | Clean                                                                                                                                                                                                                  |
| `npm run format:check`          | Yes    | `0`                 | All files Prettier-clean                                                                                                                                                                                               |
| `npm test` (unit + integration) | Yes    | unit `0`, integ `0` | **unit: 84 suites / 497 tests pass**; **integration: 24 pass + 2 skipped (5 tests), 0 fail**; `migrate:test` `0`. Skipped = Redis-flagged suites (`auth-lockout`, `VisualizationCacheRedis`, `analytics`), CI-covered. |
| `npm run security:delta:check`  | Yes    | `0`                 | **8 medium, 0 high/critical** (body-parser, brace-expansion, express, qs, resend, sequelize, svix, uuid)                                                                                                               |
| `npm run docs:openapi:generate` | Yes    | `0`                 | Regenerated spec is **byte-identical** to committed (`git diff` empty) — spec in sync                                                                                                                                  |

**Methodology note (integrity):** a _naïve_ combined invocation
(`jest --selectProjects unit integration` under `SKIP_DB_LIFECYCLE=true`) reports 8 failures
— an artifact of running integration without its DB lifecycle, **not** a real gate failure.
The project's own `npm test` (separate `test:unit` then `test:integration`) is green. Any
re-auditor must run the gate as the project defines it, and must not let a pipeline ending
in `tail`/`echo` mask jest's exit code.

**Environment caveat:** gates ran on host **Node v22.12.0**; `.nvmrc` + `engines` mandate
**Node 20.x** (Dockerfile pins `node:20-alpine`). Green on 22 ≠ green on 20; CI runs 20.

---

## 3. Independent scorecard (re-graded on HEAD)

| Category                           | Pass | Partial | Fail | Independent note vs 2026-05-20                                                                                                                          |
| ---------------------------------- | ---- | ------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Auth & Authorization            | 5    | 0       | 1    | Refresh-rotation, email-verify, RBAC all verified solid. `token-generator.ts` 2nd jwt path is a footgun (not runtime). OAuth still Missing (by design). |
| 2. API Design & Contracts          | 3    | 3       | 0    | **Downgraded.** Error envelope violates own `api-design.md` + undocumented in OpenAPI (was graded mild Partial).                                        |
| 3. Database Layer                  | 3    | 2       | 0    | Multi-tenancy migrations verified safe. Soft-delete still mixed (agree, Partial).                                                                       |
| 4. Security                        | 6    | 2       | 0    | **P1-4.2 + P2-4.5 verified closed** → clears 80%. But Sentry `beforeSend` + log-redaction gaps drag two items to Partial.                               |
| 5. Error Handling & Observability  | 4    | 1       | 1    | Request-ID ALS + readiness verified solid. Sentry lacks PII scrubbing → Partial. APM still Missing.                                                     |
| 6. Developer Experience            | 5    | 1       | 0    | **Downgraded.** Fork bootstrap + `.env.test` onboarding gap (printed steps fail out-of-box).                                                            |
| 7. Testing                         | 6    | 0       | 0    | 664 tests pass. Solid.                                                                                                                                  |
| 8. CI/CD & Deployment              | 6    | 0       | 0    | Multi-stage Dockerfile + main-gated `deploy_production` + env-protection verified.                                                                      |
| 9. Multi-Tenancy                   | 2    | 1       | 2    | Repo-layer org-scoping verified across **all** domain repos. Subscription deferred.                                                                     |
| 10. Architecture & Maintainability | 3    | 2       | 0    | **Downgraded.** Arch test loose; real app→infra leaks; AppError in domain; cross-feature imports.                                                       |
| 11. Forkability                    | 4    | 2       | 0    | **Downgraded.** Builds+tests clean, but runtime branding leak + secret-rotation no-op on fresh clone.                                                   |

**ADR-001 fork-ready gate:** (1) zero P0 (pass) · (2) six gates green (pass) · (3) Cat 1/4/6/7/8/11 ≥80%
Yes (Cat 4 = 87.5% after the two real closures; all others ≥80%) · (4) LICENSE + `.env.example`
present Yes. **→ PASSES the strict ADR-001 reading.** The "gone-gold" caveats below are
_industry-standard_ gaps the ADR-001 gate does not measure.

---

## 4. Top caveats (each ≤1 day; publish-blocking only for a _clean_ GOLD claim)

### C1 — The advertised fork flow does not work as printed _(Forkability/DX, P2→P1 for a "fork-ready" claim)_

**Evidence:** `scripts/bootstrap-fork.sh:144,153` rotate `JWT_SECRET` and set `APP_NAME`
**only inside `.env.development`**, which is gitignored (`.gitignore:18`) and **absent on a
fresh clone** → both steps silently no-op. The script's printed step 4 is `npm test`, but
`npm test` fail-fasts in `envManager` (`zodEnv.ts:498` requires `JWT_SECRET`) without
`.env.test` — which is also gitignored (`.gitignore:21`) and never mentioned in the printed
steps. **Reproduced live:** fresh `git archive` fork → `npm ci` (pass) → `build` (pass) →
`typecheck` (pass) → `npm test` = **84 suites failed, 0 tests run** (`ZodError: JWT_SECRET
Required`). After `cp .env.test.example .env.test`, the same fork passes **84 suites / 497
tests**.
**Failure mode:** a forker following the script's own instructions hits 84 red suites in the
first five minutes. **Fix:** rotate the secret into `.env`/`.env.test` (or generate both from
the `.example` files), and add `.env.test` setup to the printed steps + README. ≤1 day.

### C2 — Lakira branding leaks into the forked runtime _(Forkability, P2)_

**Evidence:** `src/config/app-name.ts:4` — `APP_NAME = process.env.APP_NAME ?? "lakira-backend"`.
Because C1's `APP_NAME` write targets the absent `.env.development`, a fresh fork runs with
the hardcoded default → the service name in logs (`logger.ts:64`), OpenAPI title, queue/
exchange prefixes (`topology.ts`), and password-reset email greeting all say **"lakira-backend"**.
**Contradicts** 05-20 P1-11.4 ("no Lakira leaks into the runtime path… flips in one shot").
**Fix:** have bootstrap set `APP_NAME` in the env file the fork actually uses, or change the
fallback to derive from `package.json` name. ≤1 hour.

### C3 — Error envelope is inconsistent, violates `api-design.md`, and is undocumented in OpenAPI _(API Contracts, P1)_

**Evidence:** `src/utils/response-formatter.ts:61-78` (`errorResponse`) produces the
documented `{status,message,error,code,errors,data:null,success:false}`. But the global
`src/shared/middleware/error.ts` **never calls it** — it hand-rolls three other shapes:
`{status:"fail",errors:[…]}` for Zod/body-parse (`:33-49`), `{status:"error",message}` for
5xx (`:74-77`), and `{status:appError.status,message,stack?}` otherwise (`:79-84`). The value
`"fail"` is not in the documented `status` enum (`api-design.md` → `"success"|"error"`).
**And** the OpenAPI spec documents **no schema** for 400/401/403/404/409/500 responses
(only 429 → `RateLimitError`), so consumers get no typed error body and Schemathesis can
only assert status codes. **Failure mode:** a client generated from the contract cannot
reliably parse errors; the three shapes break any single error-handling branch.
**Fix:** route `error.ts` through `errorResponse()` (or adopt RFC 7807 problem+json) and add
4xx/5xx response schemas to the OpenAPI registry. ≤1 day.

### C4 — Architecture test is far weaker than ADR-003 claims; real DDD breaches pass green _(Maintainability, P1)_

**Evidence:** `__tests__/unit/architecture.test.ts` enforces only: (a) `application/` +
`infrastructure/` + `domain/` dir existence, (b) the literal regex
`/from\s+['"]sequelize['"]/` in `application/` files (`:76`), (c) a `=` default on
`buildXFeature`, (d) absence of `src/utils/mappers/` + `src/features/admin/`. It has **zero
negative-case assertions** and does **not** check dto/schema presence, mapper location,
cross-feature imports, or non-literal infra imports. Real breaches that pass it (confirmed by
the drift sweep + spot-read):

- `metric/application/use-cases/GenerateDummyMetrics.ts:1,25` imports `@/infrastructure/db/models.js`
  and calls `models.Metric.create()` — an **ORM write in the application layer**, bypassing
  the repository. Same in `metric-log/.../GenerateDummyMetricLogs.ts` + `…Handler.ts`.
- `metric/domain/entities/Metric.ts:3` + `metric-settings/domain/entities/MetricSettings.ts:1`
  import HTTP-coupled `AppError` and `throw new AppError(…, 400)` inside domain invariants —
  the **domain layer knows HTTP status codes**.
- `MetricAccessPort`/`MetricAccessSequelize` are **not exported** from `metric/index.ts`, yet
  `metric-settings`, `analytics`, `metric-log` deep-import them — a bounded-context breach
  that also violates "features export through index.ts only."

This directly undercuts 05-20's P1-10.1 ("drift closed; architecture-test enforces") and
P1-10.2 ("no Sequelize leak in application Yes" — the grep was too narrow). **Fix:** broaden
the test to fail on `@/infrastructure/`, `db/models`, `infrastructure/http/dto` imports in
`application/` and on cross-feature deep imports; fix the ~5 leaking files. Test guard ≤1 day.

### C5 — Sentry has no PII scrubbing _(Observability/Data Protection, ASVS V9, P2)_

**Evidence:** `src/server.ts:56-62` — `Sentry.init({ dsn, tracesSampleRate, environment })`
with **no `beforeSend`**. 5xx exceptions (`error.ts:67-70`) are captured with default scope;
no app-level scrubber strips request bodies/headers/PII before egress to Sentry.
**Fix:** add a `beforeSend` that drops `authorization`, `cookie`, body secrets. ≤1 hour.

### C6 — Log-redaction pattern is suffix-anchored; misses `authorization`/`cookie` _(ASVS V7, P2)_

**Evidence:** `src/config/sensitive-keys.ts:1` — `/(password|secret|token|key|certificate|url)$/i`.
Anchored at `$`, so `authorization`, `cookie`, `bearer`, `passwordHash` are **not** redacted.
Currently _latent_ — no log statement passes `req.headers`/`authorization` (grep confirmed
logs carry only IDs like `userId`, `req.ip`) — but a forker who later logs headers leaks the
bearer token. **Fix:** add `authorization|cookie|bearer|auth` and drop the `$` anchor. ≤1 hour.

---

## 5. Gap entries — disagreements with the 2026-05-20 self-audit

> Format: claim → independent finding → evidence.

- **[D1] "security:delta = 1 medium (down from 4)"** → now **8 medium** (0 high/critical).
  Mostly Express-4 stack + transitive. `tmp/security/security-delta-report.json`. Gate still
  green; the headline count is stale/under-stated.
- **[D2] "`svix` removed from deps; grep returns nothing"** → literally true for _direct_
  deps, but **misleading**: `resend@6.12.2` pulls `svix@1.90.0` transitively (in lockfile +
  `node_modules`), and the security gate flags it. The dependency is present and vulnerable.
- **[D3] "jsonwebtoken absent from app/middleware; contained to the provider"** → true for the
  runtime auth path, **but** `src/utils/token-generator.ts:2,18` is a second `jwt.sign(...,
{expiresIn:"7d"})` living in `src/`, used by `scripts/seed-contract-tests.ts` + a unit test.
  A 7-day non-rotating token minter bypassing `TokenProvider`, sitting in the shipped tree —
  a forkability footgun. (Severity P2: not in the request path.)
- **[D4] P1-10.2 "no Sequelize leak in application Yes"** → the `from "sequelize"` grep is too
  narrow; real leaks via `@/infrastructure/db/models.js` in the dummy-generator use-cases
  (see C4). Disagree: Partial.
- **[D5] P1-10.1 "drift closed; architecture-test enforces going forward"** → the test
  enforces 3 narrow checks and no negative cases (see C4). "Enforces the standard" is
  overstated. Disagree: Partial.
- **[D6] P1-11.4 "no Lakira leaks into runtime; flips in one shot"** → false on a fresh fork
  (see C2). Disagree.
- **[D7] P1-2.1 "envelopes disagree" (mild, graded Partial)** → understated; it violates the documented
  `api-design.md` contract, emits an undocumented `"fail"` status, and is absent from the
  OpenAPI error schemas (see C3). Disagree: stronger P1.
- **[D8] "Sentry hook Yes"** → present and 5xx-only (correct), but no PII scrubbing (C5).
- **[D9] "Winston log redaction Yes"** → exists and wired, but suffix-anchored gap (C6).
- **[D10] `npm test` "163 passed / 168 total"** → very stale; current suite is **664 passing
  / 669 total** (multi-tenancy added ~500 tests). Not a defect, but the audit's numbers no
  longer describe the repo.

**Verified agreements (claims that hold up under code reading):**

- Refresh-token rotation **single-use + family revocation on reuse** — `RotateRefreshToken.ts`
  uses `findByTokenHashForUpdate` (row lock) in a tx, `isRevoked()`→`revokeFamily()` on reuse,
  marks old revoked + links replacement; no raw token logged. (pass)
- Multi-tenant **repository-layer** isolation — every domain read scopes by `organizationId`
  in the WHERE (MetricReadRepo `:189`, MetricRepo, MetricLogRepo `:66,73`, MetricCategoryRepo
  `:37,84`, MetricSettings `:84,100,106`, Trend `:15`, Stats `:18-19`). (pass)
- P1-4.2 **genuinely closed** — `grep process.env src/` (excl. config/tests) returns only
  bootstrap reads (`NODE_ENV`, `SKIP_DB_LIFECYCLE`); all 6 analytics `VIZ_*` reads gone. (pass)
- Email/password-reset tokens: `randomBytes(32)` (256-bit) → SHA-256-hashed → single-use
  (`usedAt`) → 24h/15min TTL. (pass)
- Request-ID ALS propagates across awaits — `request-id.ts:22` wraps `next()` in
  `requestIdStorage.run()`; `logger.ts:41-47` injects it. (pass)
- Dockerfile: multi-stage, `npm ci --omit=dev`, `USER node`, `dumb-init`. Pass (no `HEALTHCHECK`
  directive — PaaS-external, minor).
- `deploy_production`: `if github.ref == refs/heads/main` + `environment: production`
  (manual-approval gate). (pass)
- Readiness probe `/api/v1/ready` checks DB + Redis with a 2s budget → 503. (pass)
- CORS: specific-array origin + `credentials:true`, never `*` (`server.ts:133-139`). (pass)
- Soft-delete still mixed (agree, Partial): paranoid on User/Metric/MetricCategory/Organization;
  hard-delete on the other 7 models; no codifying ADR.
- Migration ordering safe: add nullable + FK → backfill → NOT NULL → index (`…000005`/`000006`). (pass)

---

## 6. Possible issues — needs human judgment _(not promoted to caveats)_

- **Cross-org public-metric existence check.** `MetricRepoSequelize.ts:43-54`
  (`originalMetricExists`) is intentionally org-unscoped (documented) for metric cloning, and
  returns only a **boolean**. Not a data leak, but confirm "public" content _should_ be
  referenceable across tenant boundaries for your product.
- **Login lockout fails open.** `loginLockout.ts:37,57` — `if (!redis.isOpen) return;`. If
  Redis is down, brute-force protection is bypassed (availability over security). Acceptable
  for many SaaS, but an attacker who can disrupt Redis disables lockout. ASVS V2.2.1.
- **TOCTOU on single-use tokens.** `VerifyEmail.ts:43-48` (documented, idempotent → fine) and
  `ResetPassword.ts:39-52` (undocumented) check-then-mark non-atomically. Refresh tokens use
  a row lock; reset/verify do not. Consider `UPDATE … WHERE used_at IS NULL RETURNING *`.
- **JWT verify() doesn't pin algorithms / no iss/aud.** `JwtTokenProvider.ts:22` —
  `jwt.verify(token, secret)` without `{algorithms:["HS256"]}` and no issuer/audience.
  Exploitability low (HS256 + `jsonwebtoken@9` rejects `alg:none`), but pin them anyway.
- **Unauthenticated info disclosure.** `/api/v1/health` (`server.ts:146`) returns
  `environment: NODE_ENV`; `/api/v1/ready` returns db/redis liveness. No versions leaked;
  borderline-acceptable for probes.
- **Express 4 (maintenance mode).** `express@^4.22.1` — several of the 8 medium advisories
  stem from the Express-4 stack (body-parser, qs). Express 5 is GA. Plan an upgrade.
- **Migration lock at scale.** `…000006` `changeColumn` to `NOT NULL` + non-`CONCURRENTLY`
  index take `ACCESS EXCLUSIVE` locks — fine on a fresh base, locks a hot table for a forker
  migrating a populated DB.
- **`xss-clean@0.1.4` unmaintained** (last release 2019, `server.ts:126`) — tracked P2-4.6;
  retire in favor of validating/escaping at the schema layer.

---

## 7. Appendix — files inspected

- **Gates/CI:** `package.json`, `jest.config.mjs`, `Dockerfile`, `.github/workflows/backend-ci.yml`
  (deploy_staging `:361`, deploy_production `:434-439`), `tmp/security/security-delta-report.json`.
- **Auth/security:** `RotateRefreshToken.ts`, `JwtTokenProvider.ts`, `token-generator.ts`,
  `VerifyEmail.ts`, `RequestEmailVerification.ts`, `RequestPasswordReset.ts`, `ResetPassword.ts`,
  `EmailVerificationToken.ts`, `PasswordResetToken.ts`, `RefreshTokenCrypto.ts`,
  `loginLockout.ts`, `rate-limiter.ts`, `sensitive-keys.ts`, `logger.ts`, `request-id.ts`.
- **HTTP/contract:** `server.ts`, `shared/middleware/error.ts`, `utils/response-formatter.ts`,
  `docs/reference/api/lakira-backend-openapi.json` (securitySchemes + 4xx/5xx coverage).
- **Multi-tenancy/persistence:** all 8 domain `*RepoSequelize.ts` / `*RepositorySequelize.ts`,
  `TrendRepoSequelize.ts`, `VisualizationReadRepoSequelize.ts`; migrations
  `20260510000005`/`000006`; `paranoid` sweep across all models.
- **Architecture:** `__tests__/unit/architecture.test.ts`, `metric/index.ts`,
  `GenerateDummyMetrics.ts`, `Metric.ts`, `MetricSettings.ts`, `.claude/rules/architecture.md`,
  ADR-003/004/006/007 in `decisions.md`; plus the `architecture-auditor` subagent drift sweep.
- **Forkability:** `scripts/bootstrap-fork.sh`, `src/config/app-name.ts`, `.gitignore`,
  `.env.test.example`; **live dry-run** in `git archive` scratch tree (rename + edge cases +
  `npm ci`/build/typecheck/unit, with and without `.env.test`).

---

**Verdict: GOLD WITH CAVEATS.** Publish today with the C1–C6 follow-ups tracked (each ≤1
day). C1 (fork flow doesn't work as printed) and C3 (error-contract inconsistency) are the
two a forker or API consumer hits first and should lead the punch list; C2/C4/C5/C6 are fast
hardening wins. No P0 blockers; the ADR-001 strict gate passes; the security and
multi-tenancy fundamentals are sound and verified, not merely asserted.
