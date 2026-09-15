# Prompt — SaaS Base Readiness Audit (2026-05-01)

- **Status:** Not a todo — this is the prompt that produced
  [`audits/saas-readiness/`](../audits/saas-readiness/). Kept for provenance; nothing to action.
  The audit's own open findings are tracked in `FINAL-AUDIT-SUMMARY.md`, not here.

---

## Context

Lakira is my first full-stack app — a personal metric tracking app — but it's built following industry-standard conventions for infra, code structure, directory layout, tooling, and core features (auth, reset password, etc.). The goal is for Lakira's backend to eventually serve as a **forkable SaaS base** for future projects.

## Your Task

Perform a **SaaS Base Readiness Audit** on the Lakira backend codebase. Then produce the documents described below.

The audit must be **empirical** (run the commands, don't just inspect files) and **graded against the project's own intended standard** (the rules in `.claude/rules/`), not just generic SaaS criteria.

---

## Step 0 — Read the Rulebook First

Before exploring code, read these to understand the intended standard:

- `CLAUDE.md`
- All files under `.claude/rules/` (architecture, security, api-design, database, validation, testing, code-style, environment, commands, workflow, documentation)
- `docs/explanation/documentation-standards.md`
- `docs/explanation/testing-strategy.md`
- `docs/reference/ci-pipeline/strategy.md`
- The structure of `docs/security/` (existing security audit infrastructure)

A gap is only a gap if it's missing relative to the intended standard, or if the intended standard itself is missing.

---

## Step 1 — Explore the Codebase

Use the `architecture-auditor` subagent (or `Explore` for narrower lookups) to keep the main context clean. Have it map:

- Directory structure and architecture pattern (DDD feature-slice — confirm compliance)
- All existing features (auth, password reset, metric, metric-log, etc.)
- Infra/deployment config (Dockerfile, docker-compose, CI/CD workflows, env handling)
- Tooling (lint, format, test, type-check, hooks)
- Database layer (migrations, schema, ORM, seeders)
- Security middleware stack and rate limiting setup
- API design conventions (versioning, response shape, error format, OpenAPI)
- Developer experience surface (README, `.env.example`, scripts, onboarding flow)
- **Lakira-specific coupling** — what code is generic-base vs. metric-domain-specific?

Do NOT assume what's present — read the actual files.

---

## Step 2 — Run the Verifications (Empirical)

Execute and capture results. A category cannot be ✅ if its verification command fails.

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run security:delta:check
npm run docs:openapi:generate
```

Record exit codes, error counts, and any flakes. If a command isn't safe to run (e.g. requires creds), note that explicitly.

---

## Step 3 — Produce the Deliverables

### File placement

Per `.claude/rules/documentation.md`, architectural topics live under `docs/internal/initiatives/<topic>/` as a lean kit. Use:

```
docs/internal/audits/saas-readiness/
  README.md                    # kit overview + how to re-run the audit
  audit-2026-05-01.md          # full audit (this run)
  decisions.md                 # ADR entries for any standards adopted
SAAS-BASE-CHECKLIST.md         # at repo root — consumer-facing one-pager for forkers
```

The root `SAAS-BASE-CHECKLIST.md` is the public summary (verdict + scorecard + top gaps). The dated audit file under the kit folder holds the full detail and is what gets diffed across re-audits.

### Scorecard format (top of both files)

```
| Category                                    | ✅ | ⚠️ | ❌ | N/A |
| ------------------------------------------- | -- | -- | -- | --- |
| 1. Authentication & Authorization           |    |    |    |     |
| 2. API Design & Contracts                   |    |    |    |     |
| ...                                         |    |    |    |     |
| **Total**                                   |    |    |    |     |
```

Followed by **P0 / P1 / P2 gap counts** and the **fork-ready verdict** (criteria below).

### Gap entry format (in `audit-2026-05-01.md`)

For each ⚠️ / ❌:

```
### [P0|P1|P2] <Category> · <item>
- **Status:** ⚠️ | ❌
- **What's missing/incomplete:** <1–3 sentences>
- **Why it matters for a SaaS base:** <1–2 sentences>
- **Recommended fix:** <opinionated, picks specific lib/pattern fitting the existing stack>
- **Effort:** S / M / L
- **Evidence:** <file paths, command output, or "no file found">
```

### Severity tags

- **P0** — blocks "fork-ready" status. Security holes, missing migrations system, no auth, no CI, no `.env.example`, etc.
- **P1** — should be fixed before recommending the base externally. Missing email verification, no soft-delete pattern, no OpenAPI, etc.
- **P2** — nice-to-have. OAuth, feature flags, webhook outbound, APM, etc.

---

## Step 4 — Checklist Categories

For each item, mark ✅ / ⚠️ / ❌ / N/A and assign P0/P1/P2 if non-✅.

1. **Authentication & Authorization**
   - JWT / session-based auth
   - Refresh token flow
   - Password reset (email flow)
   - Email verification
   - Role-based access control (RBAC)
   - OAuth / social login readiness

2. **API Design & Contracts**
   - Consistent response envelope (data, error, meta)
   - API versioning (e.g. `/v1/`)
   - Pagination support
   - Input validation layer (Zod is in use — check coverage)
   - OpenAPI / Swagger documentation (verify `npm run docs:openapi:generate` works and spec is current)
   - Rate limiting per route/user

3. **Database Layer**
   - Migration system (Sequelize CLI in use — check it's wired and idempotent)
   - Seed scripts (dev/test data)
   - Soft delete pattern
   - Audit trail / timestamps (createdAt, updatedAt, deletedAt)
   - Multi-tenancy readiness (tenant isolation or namespace pattern)

4. **Security**
   - Environment variable handling (no hardcoded secrets — grep for it)
   - CORS configuration
   - HTTP security headers (helmet)
   - Input sanitization (xss-clean, hpp present per `.claude/rules/security.md`)
   - Rate limiting (global + per-route — verify all three limiters exist)
   - Brute force protection on auth endpoints
   - HTTPS enforcement readiness
   - Sensitive data redaction in logs (per `security.md` redaction rules)

5. **Error Handling & Observability**
   - Centralized error handler
   - Structured logging (Winston in use — check JSON format, log levels)
   - Request ID / correlation ID tracing
   - Health check endpoint (`/health` or `/ping`)
   - External error monitoring readiness (Sentry hook point)
   - Metrics/APM readiness

6. **Developer Experience & Onboarding**
   - `.env.example` with all required keys documented
   - README with local setup, env vars, scripts, architecture overview
   - `package.json` scripts cover common tasks (per `.claude/rules/commands.md`)
   - Linting + formatting enforced (ESLint + Prettier)
   - Pre-commit hooks (Husky, lint-staged)
   - TypeScript strict mode enabled

7. **Testing**
   - Unit test setup (Jest `unit` project)
   - Integration test setup (Jest `integration` project, Postgres-backed)
   - E2E test setup (Jest `e2e` project)
   - Test database isolation (per-worker port `4000+workerID`)
   - CI test run on PRs
   - Coverage thresholds enforced (per `.claude/rules/testing.md`)

8. **CI/CD & Deployment**
   - CI pipeline (GitHub Actions)
   - Automated test run in CI
   - Dockerfile / container readiness
   - Environment promotion strategy (dev → staging → main, per project branch model)
   - Database migration run strategy on deploy
   - Secret management in CI

9. **Multi-Tenancy & SaaS-Specific**
   - Tenant/workspace model (if applicable)
   - User ↔ Organization / Workspace relationship
   - Plan/subscription model skeleton
   - Feature flags readiness
   - Webhook outbound support

10. **Code Architecture & Maintainability**
    - Feature-slice DDD compliance (per `.claude/rules/architecture.md`)
    - Manual DI pattern consistently applied
    - No business logic in route handlers
    - Consistent naming conventions (per `.claude/rules/code-style.md`)
    - Dead code / unused dependencies (run `depcheck` or equivalent)

11. **Forkability (SaaS-base–specific)**
    - `LICENSE` file at repo root
    - `CONTRIBUTING.md` (or note that it's intentionally absent)
    - **Genericness:** domain code (metric, metric-log, metric-settings) cleanly separable from reusable base (auth, infra, middleware, scaffolding) — list the coupling points
    - **Hardcoded "Lakira" / "lakira-backend":** grep for them; list every hit a forker would need to rewrite
    - **Module swappability:** email provider (currently Resend per memory), queue, cache, ORM — are these behind ports/interfaces?
    - **Fork bootstrap UX:** is there a script or doc for "rename project, rotate secrets, point at new DB"?

---

## Step 5 — Verdict

At the very top of `SAAS-BASE-CHECKLIST.md`, include:

- **Audit date** (`2026-05-01`)
- **One-paragraph verdict:** is this backend ready to fork as a SaaS base today?
- **Fork-ready exit criteria** (binary — meet all to be ✅):
  1. Zero **P0** gaps remaining
  2. Empirical commands all green (`typecheck`, `lint`, `test`, `security:delta:check`)
  3. Categories 1 (Auth), 4 (Security), 6 (DX), 7 (Testing), 8 (CI/CD), 11 (Forkability) at ≥80% ✅
  4. `LICENSE` and `.env.example` present
- **Top 5 P0/P1 gaps** with one-line summaries linking into the dated audit file.

---

## Output Constraints

- Be honest. Partial implementation is ⚠️ — do not round up to ✅.
- N/A is allowed but requires a one-line reason.
- Documentation only — do NOT change source code.
- Do NOT compact or reformat anything under `docs/internal/audits/security/` (schema-validated by tests).
- All file/line references must be precise (`src/path/file.ts:123`) so the audit is actionable.
- If a verification command fails for environmental reasons (no creds, no Docker), say so — don't fake a result.
