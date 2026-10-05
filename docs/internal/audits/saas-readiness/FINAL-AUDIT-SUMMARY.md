# SaaS Readiness — Final Audit Summary (Gone-Gold Closeout)

**Status:** **GOLD WITH CAVEATS** — the N1+N2+F1 downgrade is **lifted as of 2026-08-23**.
N1, N2, N3 and F1 all landed together (tenant-scoped cache keys per ADR-0035, production-unsafe
env refusal per ADR-0036, both now Accepted). Of the original C1–C6 caveats, **C1 and C3 are closed** (`8adf7b8` and `75cfdaa`);
**C5 and C6 are closed as of 2026-09-21** (`b28381a` — log-redaction coverage and a Sentry
`beforeSend`; C5's severity was overstated — see its note below the table); **C4 is closed as of
2026-09-23** (`78a05a1`, `3ce0c0e` — feature boundaries enforced in ESLint, the model-association
exception frozen, and HTTP status codes out of the domain layer — ADR-0044); **C2 is closed as of
2026-09-24 by decision** — the cause this audit cites is gone, and the residual is accepted rather
than coded around (see its note below the table and
[`saas-audit-closeout` D-01](../../initiatives/saas-audit-closeout/decisions.md)).

**2026-09-29 re-audit: GOLD WITH CAVEATS reconfirmed; clean GOLD not yet earned.** The dated run
[`audit-2026-09-29.md`](./audit-2026-09-29.md) passes the ADR-001 gate on Node 24 (zero P0), but it
finds the C1–C6 closures narrower than claimed: **C1 is open again at P1** (a fresh fork's
`npm test` fails, because `.env.test` keeps the upstream database credentials; reproduced), and
**C3 and C4 are open again at P2**. C2, C5 and C6 are confirmed closed. The table in § 4 carries the
current status. Next step: close C1, then another dated run.

**2026-10-03 re-audit: GOLD WITH CAVEATS reconfirmed again; C1 and C3 are closed, clean GOLD still
not earned.** The dated run [`audit-2026-10-03.md`](./audit-2026-10-03.md) passes the ADR-001 gate
on Node 24 (zero P0, no flake) and executes a fresh fork's printed steps end to end. It confirms C1
and C3 closed, with C2, C5 and C6. **C4 stays open at P2** on two routes the last fix did not cover.
It also records **two new P1 findings that block a clean GOLD**: S1, the response cache replays
error bodies with status 200, and S2, a fork's OpenAPI gate cannot pass. Next step: fix S1, S2 and
the C4 residual, then another dated run.

**2026-10-05 re-audit: GOLD WITH CAVEATS reconfirmed a third time; C4, S1 and S2 are closed, and C6
is open again.** The dated run [`audit-2026-10-05.md`](./audit-2026-10-05.md) passes the ADR-001
gate on Node 24 (zero P0, first run after a clean install) and confirms every blocker the last run
named, S1 and S2 against running code. Every fix was graded by a subagent and not by the session
that wrote it. It does not restate GOLD: **C6 is open again at P2**, because a database error is
logged with the values bound to its statement, and a double-submitted registration writes the
email address and the password hash to the log (finding T1). Next step: fix T1, then another dated
run.

**2026-10-05, second run: GOLD WITH CAVEATS reconfirmed a fourth time; T1 and T2 are closed, and
the graders kept C6 and C2 open.** The dated run [`audit-2026-10-05-b.md`](./audit-2026-10-05-b.md)
passes the ADR-001 gate on Node 24 and reproduces both fixes: a duplicate registration no longer
writes an address or a hash to the log, and a fork's spec describes the fork. Every caveat was put
to a subagent this time. **C6 stays open at P3**: an error nested in log metadata still leaks
through two routes nothing reaches today (U1). **C2 was graded open at P2** on a fork deployed
without `APP_NAME` (U2), a case the owner accepted by decision on 2026-09-24. Next step: fix U1,
and the owner's word on C2, then another dated run.

The **Status** paragraph at the top records the closures as they stood on 2026-09-24, when all six
were believed closed.

Historical context follows.
The 2026-06-05 re-audit confirmed the 05-24 baseline holds (zero source code drift between
audits) but surfaced two **NEW P0** (cache-layer cross-tenant scoping) and one **NEW HIGH**
(`DISABLE_RATE_LIMITING` has no production guard) findings that all three prior audits missed.
The repo is **not safely shippable** as a SaaS base until N1+N2+F1 land (cumulative ≤2h);
the original C1–C6 caveats remain open-unchanged.
**As of:** 2026-10-06 · **Branch:** `docs/saas-reaudit-2026-10-05-b` @ `747d4b3`
**Authoritative audit:** [`audit-2026-10-05-b.md`](./audit-2026-10-05-b.md) (a grade for every
caveat, fork dry-run, live reproductions and full 65-item re-grade, on Node 24).
Prior authoritative audits: [`audit-2026-10-05.md`](./audit-2026-10-05.md),
[`audit-2026-10-03.md`](./audit-2026-10-03.md),
[`audit-2026-09-29.md`](./audit-2026-09-29.md),
[`audit-2026-06-05.md`](./audit-2026-06-05.md).
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
(green), pressure-tested the security- and multi-tenancy-critical Pass-graded claims by reading code
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

> **Re-audit integrity note:** run `npm test` exactly as the project defines it
> (`test:unit` then `test:integration`). A naïve combined `jest --selectProjects unit
integration` under `SKIP_DB_LIFECYCLE=true` _appears_ to fail (8 errors) — an artifact of
> running integration without its DB lifecycle, not a real failure. Also never let a shell
> pipeline ending in `tail`/`echo` mask jest's exit code. Gates were verified on host
> **Node 22**; CI/Docker use the mandated **Node 20** — re-confirm there.

### Strict ADR-001 fork-ready gate → **PASS**

| Criterion                              | Result                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------- |
| (1) Zero P0 gaps                       | Yes (all 7 closed)                                                     |
| (2) All six gates green                | Yes                                                                    |
| (3) Cat 1/4/6/7/8/11 ≥ 80% (pass)      | Yes — Cat 4 = **87.5%** after P1-4.2 + P2-4.5 closed; all others ≥ 80% |
| (4) `LICENSE` + `.env.example` present | Yes                                                                    |

> ADR-007 framed the pass as "closing P2-4.5 flips the gate." That is arithmetically
> incomplete: Cat 4 was 5 pass/3 partial (62.5%); CORS alone → 6/8 = 75% (still < 80%). The gate only
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

| Phase                  | Closed                                     | Outcome                                                                                                                    |
| ---------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 0 — Cheap-P0 sweep     | P0-4.1, P0-6.1, P0-6.2, P0-11.1            | `trust proxy` + HTTPS readiness, `.env.example`, root `README.md`, `LICENSE`                                               |
| 1 — JWT lifecycle      | P0-1.1, P1-10.3                            | Refresh-token family + rotation; `TokenProvider.verify()` port (no `jwt.verify` in middleware)                             |
| 2 — Observability      | P0-5.1, P1-5.2, P1-5.3, P1-4.3             | Request-ID ALS, Sentry hook (5xx), `/ready` probe, Winston redaction filter                                                |
| 3 — Email verification | P1-1.2                                     | End-to-end verify + resend, gated by `requireVerifiedEmail`                                                                |
| 4 — Multi-tenancy      | P0-3.1, P0-9.1, P1-1.3                     | `Organization` + `Membership` + `organizationId` on all domain tables; RBAC via org roles                                  |
| 5 — Drift cleanup      | P1-10.1, P1-10.2, P2-10.4, P2-10.5         | Canonical DDD layout + architecture test (see caveat **C4**)                                                               |
| 6 — Forkability        | P1-11.2, P1-11.3, P1-11.4, P2-11.5 partial | `CONTRIBUTING.md`, `bootstrap-fork.sh`, `APP_NAME` centralization (see caveats **C1/C2**); CachePort consolidation partial |
| 7 — Production runtime | P1-8.3, P1-8.4, P1-4.4, P1-7.1             | Multi-stage Dockerfile, `deploy_production`, login lockout, e2e Jest project                                               |
| post-7                 | P1-4.2 (`302a335`), P2-4.5 (`a4c4a86`)     | Analytics env-reads routed through `envManager`; CORS comma-separated allowlist (ADR-007)                                  |
| 8 — Subscription       | P1-9.2                                     | Deferred by design (post-multi-tenancy)                                                                                    |

---

## 4. Open caveats (the "gone-gold" punch list)

Each is scoped to ≤1 day. None blocks the ADR-001 gate or represents an exploitable P0.
**Recommended order:** C1 and C3 first (a forker / API consumer hits these first), then the
fast hardening wins C2/C5/C6, then C4.

| ID     | Caveat                                                                                                                                                                                                                                                                                      | Sev | Scope | Status                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ----- | -------------------------------- |
| **C1** | **Fork flow doesn't work as printed** — `bootstrap-fork.sh` rotates `JWT_SECRET` / sets `APP_NAME` only in `.env.development` (gitignored, absent on fresh clone → silent no-op); its printed step 4 `npm test` fails out-of-box (84 suites) without `.env.test`, which is never mentioned. | P1  | ≤1d   | Fixed (#122) — confirmed         |
| **C2** | **Lakira branding leaks into the forked runtime** — `src/config/app-name.ts:4` defaults to `"lakira-backend"`; because C1's `APP_NAME` write misses, a fresh fork brands logs/OpenAPI/queues/emails as "lakira-backend".                                                                    | P2  | ≤1h   | **Open (P2), 2026-10-06** — note |
| **C3** | **Error envelope inconsistent + undocumented** — `error.ts` hand-rolls 3 shapes (incl. an undocumented `"fail"` status), bypassing `errorResponse()`, violating `api-design.md`; OpenAPI documents no 4xx/5xx schema (only 429).                                                            | P1  | ≤1d   | Fixed (#124, #131) — confirmed   |
| **C4** | **Architecture test too weak** — enforces only 3 narrow checks, no negative cases; real app→infra ORM writes, `AppError` in domain entities, and cross-feature deep imports pass green.                                                                                                     | P1  | ≤1d   | Fixed (#135) — confirmed         |
| **C5** | **Sentry has no PII scrubbing** — `Sentry.init()` lacks a `beforeSend` to strip `authorization`/`cookie`/body secrets before egress.                                                                                                                                                        | P2  | ≤1h   | Fixed (`b28381a`) — note         |
| **C6** | **Log-redaction suffix-anchored** — `SENSITIVE_KEY_PATTERN` misses `authorization`, `cookie`, `bearer`, `passwordHash` (latent: nothing logs them today).                                                                                                                                   | P2  | ≤1h   | **Open (P3), 2026-10-06**        |

**C2 — note (2026-09-17).** This row's stated cause is _"because C1's `APP_NAME` write misses"_,
and that is no longer true: `bootstrap-fork.sh:183-191` now writes `APP_NAME` into `.env`, which the
same script creates from `.env.example` when absent. A fork that runs the documented script is
branded correctly. What remains is that `src/config/app-name.ts:4` still defaults to
`"lakira-backend"`, so a fork that _skips_ the script inherits the template's name. Whether that
counts as a leak or as the script simply being the documented fork path is a judgement call, which is
why this is marked partly rather than closed — closing it is a decision, not a code change.

**C2 — closed by decision (2026-09-24).** The residual is accepted: `bootstrap-fork.sh` is the
documented fork path, and it brands the runtime correctly. The obvious code guard — refusing a
missing `APP_NAME` when `NODE_ENV=production` — was checked and rejected because it does not close the
residual. `.env.example:10` ships `APP_NAME=lakira-backend` and `loadEnv.ts` loads `.env` in every
environment, so a fork that skips the script but copies `.env.example` passes that check with the
template's name. Refusing the literal name would stop the template's own production from booting.
Full reasoning and the rejected options:
[`saas-audit-closeout` D-01](../../initiatives/saas-audit-closeout/decisions.md). The
`app-name.ts:4` default is unchanged, so a later audit that disagrees can reopen this deliberately.

**C5 — note (2026-09-21).** This row's severity is **overstated**, and two sessions have now spent
effort re-deriving that. `Sentry.init()` did lack a `beforeSend`, but the installed `@sentry/node`
is **10.69.0**, where `sendDefaultPii` defaults to `false` — so the SDK never attached the headers,
cookies or request bodies this row describes. The genuine residue was narrower: data the
application passes **explicitly** (`captureException` context, `extra`, properties riding on an
error object), which no SDK default covers. That is what
`scrubSentryEvent` (`src/utils/sentry-scrub.ts`) now closes. Recorded rather than silently
rewritten, so the row stands as what was believed on 2026-06-05.

**C1, C3, C4 — reopened (2026-09-29).** The dated run [`audit-2026-09-29.md`](./audit-2026-09-29.md)
§ 4.1 found each closure narrower than its claim. **C1:** `bootstrap-fork.sh` renames the database
credentials in `.env` but not `.env.test`, so a fresh fork's `npm test` fails at integration
(reproduced); the printed steps also omit `db:migrate:test` and RabbitMQ.
[Todo](../../todos/2026-09-29-todo-fork-test-credentials.md). **C3:** unknown routes return an HTML
404, oversized or badly-encoded bodies return a masked 500, and limiters answer outside the envelope
(reproduced). [Todo](../../todos/2026-09-29-todo-error-envelope-residuals.md). **C4:**
audience-prefixed deep imports pass the boundary rule, and ADR-0044's negative cases were never
persisted (reproduced with ESLint).
[Todo](../../todos/2026-09-22-todo-feature-boundary-rule-scope.md). Grading reasons:
[`saas-gold-reaudit` D-03, D-05](../../initiatives/saas-gold-reaudit/decisions.md).

**C1 — fix landed, not yet re-audited (2026-09-29).** The
[`fork-test-credentials`](../../initiatives/fork-test-credentials/README.md) kit renames the test
chain at bootstrap, derives database identifiers from an underscore slug, and adds a `Fork Smoke`
workflow that bootstraps and runs `npm test` on every push
([ADR-0051](../../../explanation/decisions/adr-0051-fork-proven-in-ci.md)). The row above stays
"Reopened" until a dated run confirms it (ADR-002).

**C4 — fix landed, not yet re-audited (2026-09-29).** The
[`feature-boundary-audience-paths`](../../initiatives/feature-boundary-audience-paths/README.md) kit
makes every boundary pattern check both import spellings, moves `MetricAccessPort` to its consumers
(ADR-0023, now Accepted), persists ADR-0044's negative cases as a lint test, and catches relative
cross-feature imports in `architecture.test.ts`. The row above stays "Reopened" until a dated run
confirms it (ADR-002).

**C3 — fix landed, not yet re-audited (2026-10-03).** The
[`error-envelope-residuals`](../../initiatives/error-envelope-residuals/README.md) kit closed the
three residuals in two parts. #124 (`7ea5ec6`) gave unknown routes a JSON 404 and mapped
body-parser's client errors to their own 4xx. The second part moves all nine rate limiters onto the
envelope through one shared handler, with the spec updated and lakira-frontend's agreement recorded
([ADR-0057](../../../explanation/decisions/adr-0057-rate-limiters-answer-through-the-error-envelope.md)).
The readiness probe's 503 body is named there as the one exception. The row above stays "Reopened"
until a dated run confirms it (ADR-002).

**C1, C3 — confirmed closed; C4 — still open (2026-10-03).** The dated run
[`audit-2026-10-03.md`](./audit-2026-10-03.md) § 4.1 re-tested each. **C1:** the five printed steps
were executed on a fresh fork against services carrying the fork's own settings, and `npm test`
passed (its § 5). **C3:** every error path answers through the envelope, rate limits included;
graded by an independent pass, with the readiness probe's 503 as the one named exception
(ADR-0057). **C4:** what was reopened on 2026-09-29 is fixed, but cross-feature imports through
`src/types/` and application code importing infrastructure still pass green.
[Todo](../../todos/2026-10-03-todo-boundary-rule-types-and-application-infra.md). Grading reasons:
[`saas-reaudit-2026-10-03` D-03, D-04, D-06](../../initiatives/saas-reaudit-2026-10-03/decisions.md).

**Two P1 findings outside C1–C6 also block a clean GOLD (2026-10-03).** S1: the response cache
stores error bodies and replays them with status 200.
[Todo](../../todos/2026-10-03-todo-cache-replays-error-responses.md). S2: a fork's
`npm run docs:openapi:check` exits 128.
[Todo](../../todos/2026-10-03-todo-fork-openapi-gate-and-bootstrap-order.md). ADR-008 names only
C1–C6; why these count is recorded in
[`saas-reaudit-2026-10-03` D-05](../../initiatives/saas-reaudit-2026-10-03/decisions.md).

**S1 — fix landed, not yet re-audited (2026-10-04).** The response cache now stores a response
only when its status is 200, so an error body is never stored or replayed
([`saas-reaudit-2026-10-03` D-07](../../initiatives/saas-reaudit-2026-10-03/decisions.md)). S1 stays
open until a dated run confirms it (ADR-002). Merged in #133 (`50258e4`).

**S2, S3, S4 — fix landed, not yet re-audited (2026-10-04).** The
[`fork-openapi-gate`](../../initiatives/fork-openapi-gate/README.md) kit makes the spec's filename
follow the package name from one module, so bootstrap renames the file with the package; renames an
existing `.env`; and lets a second run create missing env files. `Fork Smoke` now runs lint,
typecheck and the OpenAPI gate on the bootstrapped tree. They stay open until a dated run confirms
them (ADR-002). Merged in #134 (`0ce4511`); `Fork Smoke` passed with the new steps on that PR.

**C4 — residual fix landed, not yet re-audited (2026-10-04).** The
[`boundary-rule-residuals`](../../initiatives/boundary-rule-residuals/README.md) kit closes the two
routes the 2026-10-03 run kept C4 open on. Metric's two type files moved out of `src/types/` into
the metric feature, and shared code may no longer import a feature. The domain and application
layers may no longer import infrastructure or a driver package, and the four use cases that did now
own their input and message types
([ADR-0058](../../../explanation/decisions/adr-0058-inner-layers-and-shared-code-import-rules.md)).
The C4 row above stays "Open" until a dated run confirms it (ADR-002). With S1 and S2, every item
that run named as blocking the GOLD restatement now has a fix merged or in review. **Next: the dated
run.**

**2026-10-05 — the dated run.** [`audit-2026-10-05.md`](./audit-2026-10-05.md) confirms all of the
above. S1: one unknown id answered 404 three times on a live server. S2, S3 and S4: reproduced
closed on fresh forks, `docs:openapi:check` exit 0. C4: no route around the rule, by grep and by
lint. S7 and S8 are confirmed as well. Each was graded by a subagent, not by the session that wrote
the fix ([`saas-reaudit-2026-10-05` D-01](../../initiatives/saas-reaudit-2026-10-05/decisions.md)).

**C6 — open again at P2 (2026-10-05).** The pattern covers the four terms this row names. But
`src/shared/middleware/error.ts` passes a database error to the logger as metadata, and its `sql`,
`parameters`, `fields` and `errors` keys match no term. Twelve concurrent registrations with one
email logged the address and the bcrypt hash of the submitted password eleven times. C6 called its
gap latent, with nothing logging the keys it missed; this is logged today. Finding T1;
[todo](../../todos/2026-10-05-todo-error-log-may-carry-personal-data.md); grading reason in
[`saas-reaudit-2026-10-05` D-03](../../initiatives/saas-reaudit-2026-10-05/decisions.md). C2's
residual has also grown, without changing its grade: a fork's spec names the upstream cookie
(T2, [D-04](../../initiatives/saas-reaudit-2026-10-05/decisions.md)).

**C6 — fix landed, not yet re-audited (2026-10-05).** The logger now reduces every error it is
given to an allowlist of its fields before anything is written, so a database error's SQL and bound
values no longer reach the log from any of the 17 call sites that pass one
([ADR-0059](../../../explanation/decisions/adr-0059-an-error-passed-to-the-logger-is-reduced-to-an-allowlist.md)).
The same race of twelve registrations now logs eleven `Client error 409` lines with no address and
no hash. The C6 row above stays "Open" until a dated run confirms it (ADR-002), graded by an agent
and not by the session that wrote the fix. **Next: the dated run.**

**T2 — fix landed, not yet re-audited (2026-10-05).** The committed spec now describes the package:
the generator takes the app's name from `package.json`, and `bootstrap-fork.sh` rewrites the title
and cookie name in the spec it renames
([`fork-openapi-gate` D-04](../../initiatives/fork-openapi-gate/decisions.md)). On a fresh fork
named `acme-api` the spec is titled "Acme Api API", the gate exits 0 whatever `APP_NAME` the shell
exports, and the cookie the server sets is the cookie the spec names. Upstream the spec is
byte-identical. T2 stays open until a dated run confirms it (ADR-002); that run also grades C2,
whose residual this was.

**Correction to `audit-2026-10-05.md` (recorded 2026-10-05).** That audit's § 5 "A stale link" and
the second half of its T8 say a fork's `docs/reference/api/README.md` keeps the upstream spec
name. It does not: bootstrap renames it. The auditor had run `git checkout -- docs/reference/api`
on the scratch fork to undo a spec diff, which also reverted bootstrap's edit to that README, and
read the reverted file as a finding. Two untouched scratch forks, and a fresh one, have it renamed.
The dated file is immutable (ADR-002) and is left as written; this note is the correction.

**2026-10-05, second run — the dated run.** [`audit-2026-10-05-b.md`](./audit-2026-10-05-b.md)
confirms T1 and T2 closed, each reproduced, and S1, S2 and S8 again. It records the correction
above in its own § 5.

**C6 — still open, at P3 (2026-10-06).** T1's reproduction is closed and a top-level error is
reduced. An error nested inside a metadata object is not: `logger.error("x %j", { err })`, `%o`, an
error in an array, and an error five levels deep each wrote the address, the password hash and the
SQL, through the real logger with a real `DatabaseError`. No message in `src/` contains a format
token, so nothing reaches it today, which is what this row said of itself when it was written.
ADR-0059's sentence that nothing after its format holds an error object is not true and has to be
corrected with the fix. Finding U1;
[todo](../../todos/2026-10-06-todo-nested-error-payload-in-logs.md);
[`saas-reaudit-2026-10-05-b` D-04](../../initiatives/saas-reaudit-2026-10-05-b/decisions.md).

**C2 — graded open at P2 (2026-10-06); the owner's decision is in question, not a defect newly
found.** Put to a grader for the first time since it was closed by decision, C2 was kept open on
one case: a fork deployed without `APP_NAME` as a platform variable is branded Lakira, because the
image excludes `.env` and bootstrap writes the variable to `.env` only. Reproduced on the fork's
build. [`saas-audit-closeout` D-01](../../initiatives/saas-audit-closeout/decisions.md) accepted "a
fork with no `.env` and no platform variable" by name on 2026-09-24, and the fork tutorial states
the requirement. The run recorded the grader's grade and did not overrule it; reaffirming or
changing that decision is the owner's. Finding U2;
[todo](../../todos/2026-10-06-todo-fork-deployed-without-app-name.md);
[`saas-reaudit-2026-10-05-b` D-05](../../initiatives/saas-reaudit-2026-10-05-b/decisions.md).

> **Fix-status convention:** flip `Open` → `Fixed (<commit SHA>)` as each lands; a caveat closed
> by decision rather than code cites the decision entry instead of a SHA. (Written with emoji
> markers until 2026-09-24.) When all six are closed, the verdict can be re-stated as **GOLD** and
> a new dated audit run produced per ADR-002. All six closed on 2026-09-24.

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

| Date           | File                                                                   | Verdict                                                               | Scorecard                                                                                                                           |
| -------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-01     | [`audit-2026-05-01.md`](./audit-2026-05-01.md)                         | NOT fork-ready                                                        | 26 pass / 21 partial / 18 fail — 7 P0, 17 P1, 11 P2                                                                                 |
| 2026-05-20     | [`audit-2026-05-20.md`](./audit-2026-05-20.md)                         | Shippable; not strictly fork-ready (self-audit)                       | 52 pass / 9 partial / 4 fail — 0 P0, 4 P1, 9 P2                                                                                     |
| 2026-05-24     | [`audit-2026-05-24-independent.md`](./audit-2026-05-24-independent.md) | **GOLD WITH CAVEATS** (independent)                                   | ADR-001 gate **PASS**; 6 caveats + 8 judgment items                                                                                 |
| 2026-06-05     | [`audit-2026-06-05.md`](./audit-2026-06-05.md)                         | **GOLD WITH CAVEATS — DOWNGRADED PENDING N1+N2+F1**                   | All six gates re-run green; 2 new P0, 1 new HIGH, 6 P1, 6 P2, 4 P3 found                                                            |
| 2026-09-29     | [`audit-2026-09-29.md`](./audit-2026-09-29.md)                         | **GOLD WITH CAVEATS** (reconfirmed; clean GOLD blocked by C1)         | ADR-001 gate **PASS** on Node 24; 47 pass / 14 partial / 4 fail; C1 reopened P1, C3 + C4 reopened P2; 0 P0, 6 new P2, 7 P3          |
| 2026-10-03     | [`audit-2026-10-03.md`](./audit-2026-10-03.md)                         | **GOLD WITH CAVEATS** (reconfirmed; clean GOLD blocked by C4, S1, S2) | ADR-001 gate **PASS** on Node 24; 49 pass / 12 partial / 4 fail; C1 + C3 closed, C4 open P2; 0 P0, 2 new P1, 8 new P2               |
| 2026-10-05     | [`audit-2026-10-05.md`](./audit-2026-10-05.md)                         | **GOLD WITH CAVEATS** (reconfirmed; clean GOLD blocked by C6)         | ADR-001 gate **PASS** on Node 24; 50 pass / 11 partial / 4 fail; C4, S1, S2 closed; C6 reopened P2; 0 P0, 0 P1, 2 new P2            |
| 2026-10-05 (b) | [`audit-2026-10-05-b.md`](./audit-2026-10-05-b.md)                     | **GOLD WITH CAVEATS** (reconfirmed; clean GOLD blocked by C6 and C2)  | ADR-001 gate **PASS** on Node 24; 50 pass / 11 partial / 4 fail; T1, T2 closed; C6 open P3, C2 graded open P2; 0 P0, 0 P1, 1 new P2 |

**Key disagreements the independent run raised with the 05-20 self-audit** (full evidence in
the dated file): security findings 1→8 medium; `svix` present transitively via `resend`;
`token-generator.ts` is a second `jwt.sign` path; the "no Sequelize leak in application" and
"drift closed / arch-test enforces" claims are overstated; the runtime branding "flips in one
shot" claim is false on a fresh fork; and the error-envelope Partial grade is stronger than graded.

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

Strict ADR-001 fork-ready gate criteria: (1) zero P0 in the 05-24 baseline (still true);
(2) all gates green (true); (3) Cat 1/4/6/7/8/11 ≥ 80% (still true); (4) LICENSE + .env.example
(still true). The 2026-06-05 audit downgrades the **verdict** to "GOLD WITH CAVEATS —
DOWNGRADED PENDING N1+N2+F1" not because ADR-001 fails, but because the newly-surfaced
findings are exactly the kind a clean GOLD restatement should refuse to ignore.

### C1–C6 status — all open-unchanged (zero progress)

> **Historical: this records the 2026-06-05 run.** Its line references are from that date and
> no longer resolve. C1 and C3 have since been fixed and C2 partly so — the live table is the
> one in §4 above, not this one.

| ID  | Caveat                                | Status | Evidence                                                                                                                  |
| --- | ------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| C1  | Fork flow doesn't work as printed     | Open   | `scripts/bootstrap-fork.sh:144,153,182` unchanged                                                                         |
| C2  | Lakira branding leaks                 | Open   | `src/config/app-name.ts:4` unchanged                                                                                      |
| C3  | Error envelope inconsistent + undoc'd | Open   | `src/shared/middleware/error.ts:33,47,76,80` unchanged                                                                    |
| C4  | Architecture test too weak            | Open   | `__tests__/unit/architecture.test.ts:39–118` unchanged; concrete leak: `AppError` in `Metric.ts:3`, `MetricSettings.ts:1` |
| C5  | Sentry no `beforeSend`                | Open   | `src/server.ts:57–61` unchanged                                                                                           |
| C6  | Log-redaction suffix-anchored         | Open   | `src/config/sensitive-keys.ts:1` unchanged                                                                                |

### Newly surfaced findings (full details in `audit-2026-06-05.md` §6)

| ID               | Pri                              | Summary                                                                                              | Effort | ADR      |
| ---------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------- | ------ | -------- |
| N1               | ~~**P0**~~ **CLOSED 2026-08-23** | `viz`/`vizdash` Redis cache keys scoped by `userId` only — cross-org cache disclosure                | ≤1h    | ADR-009  |
| N2               | ~~**P0**~~ **CLOSED 2026-08-23** | `VisualizationInvalidationAdapter` missing `organizationId` parameter                                | ≤1h    | ADR-009  |
| F1               | ~~**HI**~~ **CLOSED 2026-08-23** | `DISABLE_RATE_LIMITING` has no `NODE_ENV=production` schema guard                                    | ≤30m   | ADR-010  |
| N3               | ~~P1~~ **CLOSED 2026-08-23**     | Cache-key tenant-scoping bug is systemic (metric / metric-log / cursor helpers)                      | ≤1d    | ADR-009  |
| N4               | P1                               | No `x-request-id` propagation across RabbitMQ; consumer outside ALS                                  | ≤1d    | —        |
| N5               | ~~P1~~ **CLOSED 2026-08-24**     | OpenAPI omits `/metrics/dummy` and `/metric-categories/dummy` (mounted in code, missing from spec)   | ≤1d    | —        |
| ADR-003 reopened | P1                               | Auth-flat vs metric-nested persistence layout disagreement (see §6 below; new ADR-011)               | ≤1d    | ADR-011  |
| N6–N11           | P2                               | Queue per-org tenancy, APM gap, Sequelize pool defaults, Redis client topology, stats N+1, JOIN drop | varies | —        |
| F2               | ~~P2~~ **CLOSED 2026-09-22**     | `SENTRY_DSN` redaction gap — closed by `21f12eb` (#105)                                              | ≤1h    | ADR-0028 |
| F3               | ~~P2~~ **CLOSED 2026-08-23**     | RabbitMQ `guest:guest` default — refused in production by `f5f28b9`                                  | ≤1h    | ADR-0036 |
| F4, F5           | P2                               | `/metric-logs/stats` unbounded range, `MetricSettings.create()` trust boundary                       | varies | —        |
| F6, F7 + minor   | P3                               | CORS normalization, `sameSite` doc gap, `x-request-id` validation, sample-rate clamp                 | varies | —        |

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

Rewritten 2026-09-24. Items 1–3 of the previous list are done and item 4 mostly so; done items are kept here, struck, so
the list still reads as the history it is.

1. ~~**Close N1 + N2 + F1**~~ — done 2026-08-23 (`f5f28b9`).
2. ~~**Close C1 + C3**~~ — done (`8adf7b8`, `75cfdaa`).
3. ~~**Land C2, C5, C6 + F2 + F3**~~ — done: C5 + C6 `b28381a`, F2 `21f12eb`, F3 `f5f28b9`, C2
   closed by decision (2026-09-24, see its note in § 4).
4. **Strengthen the architecture test (C4)** — C4 itself is done (`78a05a1`, `3ce0c0e`,
   ADR-0044), and the ADR-009 cache-key org-scoping rule is in `architecture.test.ts`
   ("cache keys are tenant-scoped"). **The ADR-011 layout rule is not:** ADR-0037 is still
   Proposed and `shared/auth/infrastructure/persistence/` is still flat. That part stays open. It
   does not gate the verdict.
5. ~~**Produce a new dated `audit-YYYY-MM-DD.md` per ADR-002**~~ — done 2026-09-29:
   [`audit-2026-09-29.md`](./audit-2026-09-29.md). It did **not** restate GOLD: C1 reopened at P1,
   C3 and C4 at P2. What gates the restatement is still C1–C6, per ADR-008
   ([`saas-audit-closeout` D-02](../../initiatives/saas-audit-closeout/decisions.md)).
6. Phase 8 (subscription/billing) remains the only deferred initiative — open its kit when
   billing is up next.
7. ~~**Close C1**~~ — fix merged in #122 (ADR-0051), with `Fork Smoke` green; pending a dated run
   to confirm it (ADR-002). **Next: close the C3 and C4 residuals**
   ([`2026-09-29-todo-error-envelope-residuals.md`](../../todos/2026-09-29-todo-error-envelope-residuals.md),
   [`2026-09-22-todo-feature-boundary-rule-scope.md`](../../todos/2026-09-22-todo-feature-boundary-rule-scope.md)),
   **then** a new dated run to restate GOLD. ADR-008 restates GOLD only when C1–C6 are all closed,
   so an open C3 or C4 blocks it; they cannot ride along as caveats. (Corrected 2026-09-29: an
   earlier wording of this item said they could.) The run's other findings are in its § 6.
   **Update 2026-10-03:** both residual fixes landed: C4 in #123, C3 in #124 and #131 (`582c1b5`,
   ADR-0057). ~~**Next: the dated run.**~~ Done, see item 8.
8. **Dated run of 2026-10-03** — [`audit-2026-10-03.md`](./audit-2026-10-03.md). C1 and C3 are
   confirmed closed. It did **not** restate GOLD. **Next, in this order:** S1 (the cache replays
   error bodies as 200), S2 with S3 and S4 (a fork's OpenAPI gate and bootstrap ordering), the C4
   residual (S5, S6), **then** another dated run. Each has a todo dated 2026-10-03; the run's other
   findings are in its § 6.
9. **Dated run of 2026-10-05** — [`audit-2026-10-05.md`](./audit-2026-10-05.md). S1, S2 to S4,
   the C4 residual, S7 and S8 are confirmed closed. It did **not** restate GOLD: C6 is open again
   (T1). **Next, in this order:** T1 (a database error is logged with its bound values), **then**
   another dated run, with C2 put to a grader explicitly. After that T2 (a fork's spec describes
   the upstream), S9 and S10. The run's other findings are in its § 6.
10. **Second dated run of 2026-10-05** — [`audit-2026-10-05-b.md`](./audit-2026-10-05-b.md). T1
    and T2 are confirmed closed. It did **not** restate GOLD: the graders kept C6 open (U1, P3) and
    graded C2 open (U2, P2). **Next, in this order:** U1 (an error nested in log metadata), and the
    owner's decision on C2, **then** another dated run. After that S9, S10 and T3.

---

## 9. Related documents

- [`audit-2026-10-05-b.md`](./audit-2026-10-05-b.md) — **current authoritative audit** (a grade for every caveat, fork dry-run, live reproductions, full re-grade on Node 24)
- [`audit-2026-10-05.md`](./audit-2026-10-05.md) — prior authoritative audit
- [`audit-2026-10-03.md`](./audit-2026-10-03.md) — prior authoritative audit
- [`audit-2026-09-29.md`](./audit-2026-09-29.md) — prior authoritative audit
- [`audit-2026-06-05.md`](./audit-2026-06-05.md) — prior authoritative audit
- [`audit-2026-05-24-independent.md`](./audit-2026-05-24-independent.md) — earlier authoritative audit
- [`audit-2026-05-20.md`](./audit-2026-05-20.md) · [`audit-2026-05-01.md`](./audit-2026-05-01.md) — prior runs
- [`decisions.md`](./decisions.md) — ADR-001 (fork-ready gate) … ADR-008 (GOLD WITH CAVEATS) · **ADR-009 (cache-key org scoping, 2026-06-05)** · **ADR-010 (prod env switch refusal, 2026-06-05)** · **ADR-011 (canonical persistence layout, 2026-06-05)**
- [`iteration-plan.md`](./iteration-plan.md) — eight-phase roadmap
- [`README.md`](./README.md) — kit overview + re-audit recipe
- `SAAS-BASE-CHECKLIST.md` (repo root) — public one-pager (update to point here per ADR-002)
- Per-phase kits: `../{jwt,observability,email-verification,multi-tenancy,feature-vertical-slice-migration,forkability,production-readiness}/`
