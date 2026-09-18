# SaaS Readiness — Final Audit Summary (Gone-Gold Closeout)

**Status:** ⚠️ **GOLD WITH CAVEATS** — the N1+N2+F1 downgrade is **lifted as of 2026-08-23**.
N1, N2, N3 and F1 all landed together (tenant-scoped cache keys per ADR-0035, production-unsafe
env refusal per ADR-0036, both now Accepted). Of the original C1–C6 caveats, **C1 and C3 are closed** (`8adf7b8` and `75cfdaa`); **C2 is
partly resolved** — the cause this audit cites is gone, though a residual remains (see its note
below the table); **C4, C5 and C6 remain open-unchanged.**
Historical context follows.
The 2026-06-05 re-audit confirmed the 05-24 baseline holds (zero source code drift between
audits) but surfaced two **NEW P0** (cache-layer cross-tenant scoping) and one **NEW HIGH**
(`DISABLE_RATE_LIMITING` has no production guard) findings that all three prior audits missed.
The repo is **not safely shippable** as a SaaS base until N1+N2+F1 land (cumulative ≤2h);
the original C1–C6 caveats remain open-unchanged.
**As of:** 2026-06-05 · **Branch:** `docs/saas-audit-2026-06-04` @ `a0301b6`
**Authoritative audit:** [`audit-2026-06-05.md`](./audit-2026-06-05.md) (delta + fresh
threat-surface re-audit, supersedes the 05-24 verdict per ADR-008 → ADR-009/010/011).
Prior authoritative audit: [`audit-2026-05-24-independent.md`](./audit-2026-05-24-independent.md).
This file is the human-readable capstone that ties the whole SaaS-readiness initiative
together; the dated audits are the evidence of record.

> **What this document is.** A single-page closeout for the SaaS-base readiness initiative:
> where we started, what was fixed across the eight phases, the result of the final
> independent audit, the open caveats and their fix scope, and the lineage of audit runs.
> For per-gap evidence (file:line), read the dated audit files. For the binary gate, see
> ADR-001 in [`decisions.md`](./decisions.md). For the roadmap, see
> [`iteration-plan.md`](./iteration-plan.md).

---

## 1. Executive summary

The Lakira backend began as a personal-app codebase and was hardened into a forkable SaaS
base across eight planned phases. The original baseline audit (2026-05-01) found **7 P0,
17 P1, 11 P2** gaps. Phases 0–7 closed **all 7 P0s and 15 of 17 P1s**; two post-phase
follow-ups (P1-4.2 analytics env-reads, P2-4.5 multi-origin CORS) closed the last items
blocking the strict fork-ready gate. Phase 8 (subscription/billing) is deferred by design.

An independent, skeptical "gone-gold" review on 2026-05-24 re-ran all six empirical gates
(green), pressure-tested the security- and multi-tenancy-critical claims by reading code
(they hold up), ran the architectural drift sweep, and performed a **live forkability
dry-run**. Result: the repo **passes the strict ADR-001 fork-ready gate** and has no P0
blockers, but carries six industry-standard quality gaps that an outside reviewer would fix
before recommending it as a base. Verdict: **GOLD WITH CAVEATS.**

---

## 2. The final audit run (2026-05-24, independent)

### Empirical gates — all six green (re-run, real exit codes)

| Gate                            | Exit | Notes                                                                                                                 |
| ------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`             | `0`  | Clean                                                                                                                 |
| `npm run lint`                  | `0`  | Clean                                                                                                                 |
| `npm run format:check`          | `0`  | Prettier-clean                                                                                                        |
| `npm test`                      | `0`  | unit **84 suites / 497 tests**; integration **24 pass + 2 Redis-flagged skips (5 tests), 0 fail**; `migrate:test` `0` |
| `npm run security:delta:check`  | `0`  | **8 medium, 0 high/critical**                                                                                         |
| `npm run docs:openapi:generate` | `0`  | Regenerated spec byte-identical to committed (in sync)                                                                |

> ⚠️ **Re-audit integrity note:** run `npm test` exactly as the project defines it
> (`test:unit` then `test:integration`). A naïve combined `jest --selectProjects unit
integration` under `SKIP_DB_LIFECYCLE=true` _appears_ to fail (8 errors) — an artifact of
> running integration without its DB lifecycle, not a real failure. Also never let a shell
> pipeline ending in `tail`/`echo` mask jest's exit code. Gates were verified on host
> **Node 22**; CI/Docker use the mandated **Node 20** — re-confirm there.

### Strict ADR-001 fork-ready gate → **PASS**

| Criterion                            | Result                                                                |
| ------------------------------------ | --------------------------------------------------------------------- |
| ① Zero P0 gaps                       | ✅ (all 7 closed)                                                     |
| ② All six gates green                | ✅                                                                    |
| ③ Cat 1/4/6/7/8/11 ≥ 80% ✅          | ✅ — Cat 4 = **87.5%** after P1-4.2 + P2-4.5 closed; all others ≥ 80% |
| ④ `LICENSE` + `.env.example` present | ✅                                                                    |

> ADR-007 framed the pass as "closing P2-4.5 flips the gate." That is arithmetically
> incomplete: Cat 4 was 5✅/3⚠️ (62.5%); CORS alone → 6/8 = 75% (still < 80%). The gate only
> clears because **P1-4.2 also closed** (commit `302a335`). Both were required; both landed.

### What the audit verified solid (by reading code, not trusting prose)

- **Multi-tenant row isolation at the repository layer** — every domain read scopes by
  `organizationId` in the WHERE clause, not just middleware.
- **Refresh-token rotation** — single-use, row-locked in a transaction, with **family
  revocation on reuse** (draft-ietf-oauth-security-topics compliant).
- **Email / password-reset tokens** — 256-bit `randomBytes`, SHA-256-hashed at rest,
  single-use, time-boxed (24h / 15min).
- **JWT** — `jsonwebtoken@9.0.3` rejects `alg:none` by default; HS256 throughout.
- **Request-ID correlation** — AsyncLocalStorage propagates across awaits; injected into every
  log line.
- **Production runtime** — multi-stage Dockerfile (`npm ci --omit=dev`, non-root `USER node`,
  `dumb-init`); `deploy_production` gated on `main` + GitHub environment protection.
- **Migrations** — safe ordering (add-nullable → backfill → NOT NULL → index); no destructive
  step without a backfill path.

---

## 3. What was fixed (remediation journey, Phases 0–7)

**Baseline → now:** 7 P0 / 17 P1 / 11 P2 (2026-05-01) → **0 P0 / 2 P1-by-design-deferred /
P2 follow-ups** (2026-05-24).

| Phase                  | Closed                                 | Outcome                                                                                                                    |
| ---------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 0 — Cheap-P0 sweep     | P0-4.1, P0-6.1, P0-6.2, P0-11.1        | `trust proxy` + HTTPS readiness, `.env.example`, root `README.md`, `LICENSE`                                               |
| 1 — JWT lifecycle      | P0-1.1, P1-10.3                        | Refresh-token family + rotation; `TokenProvider.verify()` port (no `jwt.verify` in middleware)                             |
| 2 — Observability      | P0-5.1, P1-5.2, P1-5.3, P1-4.3         | Request-ID ALS, Sentry hook (5xx), `/ready` probe, Winston redaction filter                                                |
| 3 — Email verification | P1-1.2                                 | End-to-end verify + resend, gated by `requireVerifiedEmail`                                                                |
| 4 — Multi-tenancy      | P0-3.1, P0-9.1, P1-1.3                 | `Organization` + `Membership` + `organizationId` on all domain tables; RBAC via org roles                                  |
| 5 — Drift cleanup      | P1-10.1, P1-10.2, P2-10.4, P2-10.5     | Canonical DDD layout + architecture test (see caveat **C4**)                                                               |
| 6 — Forkability        | P1-11.2, P1-11.3, P1-11.4, P2-11.5⚠️   | `CONTRIBUTING.md`, `bootstrap-fork.sh`, `APP_NAME` centralization (see caveats **C1/C2**); CachePort consolidation partial |
| 7 — Production runtime | P1-8.3, P1-8.4, P1-4.4, P1-7.1         | Multi-stage Dockerfile, `deploy_production`, login lockout, e2e Jest project                                               |
| post-7                 | P1-4.2 (`302a335`), P2-4.5 (`a4c4a86`) | Analytics env-reads routed through `envManager`; CORS comma-separated allowlist (ADR-007)                                  |
| 8 — Subscription       | P1-9.2                                 | 🅿️ Deferred by design (post-multi-tenancy)                                                                                 |

---

## 4. Open caveats (the "gone-gold" punch list)

Each is scoped to ≤1 day. None blocks the ADR-001 gate or represents an exploitable P0.
**Recommended order:** C1 and C3 first (a forker / API consumer hits these first), then the
fast hardening wins C2/C5/C6, then C4.

| ID     | Caveat                                                                                                                                                                                                                                                                                      | Sev | Scope | Status               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ----- | -------------------- |
| **C1** | **Fork flow doesn't work as printed** — `bootstrap-fork.sh` rotates `JWT_SECRET` / sets `APP_NAME` only in `.env.development` (gitignored, absent on fresh clone → silent no-op); its printed step 4 `npm test` fails out-of-box (84 suites) without `.env.test`, which is never mentioned. | P1  | ≤1d   | ✅ Fixed (`8adf7b8`) |
| **C2** | **Lakira branding leaks into the forked runtime** — `src/config/app-name.ts:4` defaults to `"lakira-backend"`; because C1's `APP_NAME` write misses, a fresh fork brands logs/OpenAPI/queues/emails as "lakira-backend".                                                                    | P2  | ≤1h   | ⚠️ Partly — see note |
| **C3** | **Error envelope inconsistent + undocumented** — `error.ts` hand-rolls 3 shapes (incl. an undocumented `"fail"` status), bypassing `errorResponse()`, violating `api-design.md`; OpenAPI documents no 4xx/5xx schema (only 429).                                                            | P1  | ≤1d   | ✅ Fixed (`75cfdaa`) |
| **C4** | **Architecture test too weak** — enforces only 3 narrow checks, no negative cases; real app→infra ORM writes, `AppError` in domain entities, and cross-feature deep imports pass green.                                                                                                     | P1  | ≤1d   | ☐ Open               |
| **C5** | **Sentry has no PII scrubbing** — `Sentry.init()` lacks a `beforeSend` to strip `authorization`/`cookie`/body secrets before egress.                                                                                                                                                        | P2  | ≤1h   | ☐ Open               |
| **C6** | **Log-redaction suffix-anchored** — `SENSITIVE_KEY_PATTERN` misses `authorization`, `cookie`, `bearer`, `passwordHash` (latent: nothing logs them today).                                                                                                                                   | P2  | ≤1h   | ☐ Open               |

**C2 — note (2026-09-17).** This row's stated cause is _"because C1's `APP_NAME` write misses"_,
and that is no longer true: `bootstrap-fork.sh:183-191` now writes `APP_NAME` into `.env`, which the
same script creates from `.env.example` when absent. A fork that runs the documented script is
branded correctly. What remains is that `src/config/app-name.ts:4` still defaults to
`"lakira-backend"`, so a fork that _skips_ the script inherits the template's name. Whether that
counts as a leak or as the script simply being the documented fork path is a judgement call, which is
why this is marked partly rather than closed — closing it is a decision, not a code change.

> **Fix-status convention:** flip ☐ Open → ✅ Fixed (with commit SHA) as each lands. When all
> six are closed, the verdict can be re-stated as **GOLD** and a new dated audit run produced
> per ADR-002.

---

## 5. Possible issues — needs human judgment (not blockers)

These are conscious-design or low-risk items the audit surfaced for a human decision, not
defects to fix blindly:

- **Cross-org public-metric reference** — `originalMetricExists` is intentionally org-unscoped
  (documented) and returns only a boolean, for metric cloning. Confirm "public" content
  _should_ cross tenant boundaries for your product.
- **Login lockout fails open** when Redis is down (availability over security; ASVS V2.2.1).
- **TOCTOU on single-use tokens** — `VerifyEmail` (documented, idempotent → fine) and
  `ResetPassword` (undocumented) check-then-mark non-atomically; refresh tokens use a row lock.
- **JWT `verify()` doesn't pin `algorithms` / no `iss`/`aud`** (low risk; HS256 + `jsonwebtoken@9`).
- **Unauthenticated info disclosure** — `/health` returns `NODE_ENV`; `/ready` returns
  db/redis liveness (no versions leaked).
- **Express 4 (maintenance mode)** — source of several of the 8 medium advisories; Express 5 is GA.
- **`xss-clean@0.1.4` unmaintained** (tracked P2-4.6) — retire in favor of schema-layer escaping.
- **Migration lock at scale** — `changeColumn` NOT NULL + non-`CONCURRENTLY` index lock hot
  tables for a forker migrating a populated DB.

---

## 6. Audit lineage

| Date       | File                                                                   | Verdict                                             | Scorecard                                                                |
| ---------- | ---------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| 2026-05-01 | [`audit-2026-05-01.md`](./audit-2026-05-01.md)                         | NOT fork-ready                                      | 26✅ / 21⚠️ / 18❌ — 7 P0, 17 P1, 11 P2                                  |
| 2026-05-20 | [`audit-2026-05-20.md`](./audit-2026-05-20.md)                         | Shippable; not strictly fork-ready (self-audit)     | 52✅ / 9⚠️ / 4❌ — 0 P0, 4 P1, 9 P2                                      |
| 2026-05-24 | [`audit-2026-05-24-independent.md`](./audit-2026-05-24-independent.md) | **GOLD WITH CAVEATS** (independent)                 | ADR-001 gate **PASS**; 6 caveats + 8 judgment items                      |
| 2026-06-05 | [`audit-2026-06-05.md`](./audit-2026-06-05.md)                         | **GOLD WITH CAVEATS — DOWNGRADED PENDING N1+N2+F1** | All six gates re-run green; 2 new P0, 1 new HIGH, 6 P1, 6 P2, 4 P3 found |

**Key disagreements the independent run raised with the 05-20 self-audit** (full evidence in
the dated file): security findings 1→8 medium; `svix` present transitively via `resend`;
`token-generator.ts` is a second `jwt.sign` path; the "no Sequelize leak in application" and
"drift closed / arch-test enforces" claims are overstated; the runtime branding "flips in one
shot" claim is false on a fresh fork; and the error-envelope ⚠️ is stronger than graded.

---

## 7. 2026-06-05 consolidation (delta + fresh threat-surface re-audit)

The 2026-06-05 re-audit (`audit-2026-06-05.md`) ran a delta pass against everything tracked
above plus a fresh threat-surface scan. Two-pass parallel delegation to `architecture-auditor`
and `security-reviewer`. **Zero source code changes between 2026-05-24 and 2026-06-05** — the
five intervening commits are documentation/process only. The delta pass therefore largely
re-confirmed status. The fresh pass is where this re-audit earned its keep.

### Empirical gates — all six green (re-run, real exit codes)

| Gate                             | Exit | Notes                                                               |
| -------------------------------- | ---- | ------------------------------------------------------------------- |
| `npm run lint`                   | `0`  | Clean                                                               |
| `npm run typecheck`              | `0`  | Clean                                                               |
| `npm run test:unit`              | `0`  | **84 suites / 497 tests** in 65s                                    |
| `npm run test:integration`       | `0`  | Green                                                               |
| `npm run security:delta:check`   | `0`  | **8 medium, 0 high/critical** (unchanged)                           |
| `npm run security:gate:evaluate` | `0`  | `passed=true blocking=0 backlogWarnings=0`                          |
| `npm run docs:openapi:generate`  | `0`  | Regenerated spec **byte-identical** to committed (`git diff` empty) |

Strict ADR-001 fork-ready gate criteria: ① zero P0 in the 05-24 baseline (still true);
② all gates green (true); ③ Cat 1/4/6/7/8/11 ≥ 80% (still true); ④ LICENSE + .env.example
(still true). The 2026-06-05 audit downgrades the **verdict** to "GOLD WITH CAVEATS —
DOWNGRADED PENDING N1+N2+F1" not because ADR-001 fails, but because the newly-surfaced
findings are exactly the kind a clean GOLD restatement should refuse to ignore.

### C1–C6 status — all open-unchanged (zero progress)

> **Historical: this records the 2026-06-05 run.** Its line references are from that date and
> no longer resolve. C1 and C3 have since been fixed and C2 partly so — the live table is the
> one in §4 above, not this one.

| ID  | Caveat                                | Status | Evidence                                                                                                                  |
| --- | ------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| C1  | Fork flow doesn't work as printed     | ☐ Open | `scripts/bootstrap-fork.sh:144,153,182` unchanged                                                                         |
| C2  | Lakira branding leaks                 | ☐ Open | `src/config/app-name.ts:4` unchanged                                                                                      |
| C3  | Error envelope inconsistent + undoc'd | ☐ Open | `src/shared/middleware/error.ts:33,47,76,80` unchanged                                                                    |
| C4  | Architecture test too weak            | ☐ Open | `__tests__/unit/architecture.test.ts:39–118` unchanged; concrete leak: `AppError` in `Metric.ts:3`, `MetricSettings.ts:1` |
| C5  | Sentry no `beforeSend`                | ☐ Open | `src/server.ts:57–61` unchanged                                                                                           |
| C6  | Log-redaction suffix-anchored         | ☐ Open | `src/config/sensitive-keys.ts:1` unchanged                                                                                |

### Newly surfaced findings (full details in `audit-2026-06-05.md` §6)

| ID               | Pri                              | Summary                                                                                                                                    | Effort | ADR          |
| ---------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------------ |
| N1               | ~~**P0**~~ **CLOSED 2026-08-23** | `viz`/`vizdash` Redis cache keys scoped by `userId` only — cross-org cache disclosure                                                      | ≤1h    | ADR-009      |
| N2               | ~~**P0**~~ **CLOSED 2026-08-23** | `VisualizationInvalidationAdapter` missing `organizationId` parameter                                                                      | ≤1h    | ADR-009      |
| F1               | ~~**HI**~~ **CLOSED 2026-08-23** | `DISABLE_RATE_LIMITING` has no `NODE_ENV=production` schema guard                                                                          | ≤30m   | ADR-010      |
| N3               | ~~P1~~ **CLOSED 2026-08-23**     | Cache-key tenant-scoping bug is systemic (metric / metric-log / cursor helpers)                                                            | ≤1d    | ADR-009      |
| N4               | P1                               | No `x-request-id` propagation across RabbitMQ; consumer outside ALS                                                                        | ≤1d    | —            |
| N5               | ~~P1~~ **CLOSED 2026-08-24**     | OpenAPI omits `/metrics/dummy` and `/metric-categories/dummy` (mounted in code, missing from spec)                                         | ≤1d    | —            |
| ADR-003 reopened | P1                               | Auth-flat vs metric-nested persistence layout disagreement (see §6 below; new ADR-011)                                                     | ≤1d    | ADR-011      |
| N6–N11           | P2                               | Queue per-org tenancy, APM gap, Sequelize pool defaults, Redis client topology, stats N+1, JOIN drop                                       | varies | —            |
| F2–F5            | P2                               | `SENTRY_DSN` redaction gap, RabbitMQ `guest:guest` default, `/metric-logs/stats` unbounded range, `MetricSettings.create()` trust boundary | varies | ADR-010 (F3) |
| F6, F7 + minor   | P3                               | CORS normalization, `sameSite` doc gap, `x-request-id` validation, sample-rate clamp                                                       | varies | —            |

### 2026-06-05 contradiction with prior audits — surfaced explicitly

ADR-003 says "auth slice is the canonical reference." Reading current code, `shared/auth/infrastructure/persistence/` is **flat** while `metric/` and `metric-log/` use the nested
`{models, repositories, mappers}/` layout that ADR-003's own prose mandates. The 05-24
audit acknowledged this only obliquely via C4. ADR-011 (Proposed 2026-06-05) pins the
nested layout as canonical and migrates auth. ADR-003 amended in place (Proposed →
Accepted (revised 2026-06-05)).

### New ADRs landed with this re-audit

- **ADR-009** (Proposed) — Tenant scoping is required on every cache key. Driven by N1/N2/N3.
- **ADR-010** (Proposed) — Production-unsafe env switches must be refused at schema layer. Driven by F1/F3.
- **ADR-011** (Proposed) — Resolve the canonical-DDD-layout disagreement (nested wins). Driven by §5 contradiction.

### Recommended order (revised for 2026-06-05)

1. **Same-day** — N1 + N2 + F1 (cumulative ≤2h). Verdict cannot be re-stated as clean
   GOLD until these land.
2. **Within-week** — N3 / N4 / N5 + F2 / F3 / F4 + close C5 / C6 (all ≤1d each).
3. **Within-month** — close the long-tracked C1 / C3 / C4; resolve ADR-011 (auth persistence
   migration); land N7 (OpenTelemetry) / N8 (Sequelize pool tuning) / N9 (Redis client split).
4. **Defer-and-track** — N6 (per-org queue routing); Phase 8 subscription/billing.

---

## 8. Recommended next actions

1. **Close N1 + N2 + F1** — same-day patch PR; lifts the verdict back to "GOLD WITH CAVEATS"
   parity with 2026-05-24.
2. **Close C1 + C3** — the two a forker / API consumer hits first (long-tracked).
3. **Land C2, C5, C6 + F2 + F3** — fast (~1h each) hardening wins.
4. **Strengthen the architecture test (C4)** with the new ADR-011 layout rule + ADR-009
   cache-key org-scoping rule so drift can't silently return.
5. **Re-run all six gates on Node 20** to confirm parity with CI/Docker.
6. When the 2026-06-05 punch list closes, produce a new dated `audit-YYYY-MM-DD.md` per
   ADR-002, re-state the verdict as clean **GOLD**, and update the root
   `SAAS-BASE-CHECKLIST.md` to point at it.
7. Phase 8 (subscription/billing) remains the only deferred initiative — open its kit when
   billing is up next.

---

## 9. Related documents

- [`audit-2026-06-05.md`](./audit-2026-06-05.md) — **current authoritative audit** (delta + fresh threat-surface; evidence of record)
- [`audit-2026-05-24-independent.md`](./audit-2026-05-24-independent.md) — prior authoritative audit
- [`audit-2026-05-20.md`](./audit-2026-05-20.md) · [`audit-2026-05-01.md`](./audit-2026-05-01.md) — prior runs
- [`decisions.md`](./decisions.md) — ADR-001 (fork-ready gate) … ADR-008 (GOLD WITH CAVEATS) · **ADR-009 (cache-key org scoping, 2026-06-05)** · **ADR-010 (prod env switch refusal, 2026-06-05)** · **ADR-011 (canonical persistence layout, 2026-06-05)**
- [`iteration-plan.md`](./iteration-plan.md) — eight-phase roadmap
- [`README.md`](./README.md) — kit overview + re-audit recipe
- `SAAS-BASE-CHECKLIST.md` (repo root) — public one-pager (update to point here per ADR-002)
- Per-phase kits: `../{jwt,observability,email-verification,multi-tenancy,feature-vertical-slice-migration,forkability,production-readiness}/`
