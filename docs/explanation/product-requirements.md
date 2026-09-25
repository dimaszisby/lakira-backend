# Lakira Backend Product Requirements Document (PRD)

**Status:** Active
**Last updated:** 2026-09-24 (rewritten against the code by the `docs-sweep` kit; previous revision 2026-04-13 predated multi-tenancy)
**Scope:** Lakira backend API only (`/api/v1`)
**Review cadence:** Contract-change driven + 4-week drift sweep

## 1. Purpose

This PRD defines the backend product baseline as implemented in code today. It is intentionally "as-built" first, with non-implemented themes captured as explicit gaps.

Audience:

- Backend engineers
- Frontend engineers integrating with Lakira APIs
- QA and contract-test maintainers
- CI/CD maintainers

## 2. Product Intent

Lakira backend provides authenticated, organization-scoped APIs for:

- Identity, sessions and profile management
- Organizations, memberships and invites
- Metric categories
- Metrics
- Metric settings and goal state
- Metric logs and aggregate stats
- Analytics visualizations (dashboard and per-metric)

Service stack: Node.js 24 + Express + TypeScript, PostgreSQL persistence, Redis for cache, rate limits and login lockout (required outside tests unless `REDIS_REQUIRED=false`), optional RabbitMQ for background jobs, Zod validation, and a generated OpenAPI contract.

## 3. Source of Truth and Precedence

Normative artifacts:

- Routers: `src/features/*/*/infrastructure/http/*router.ts`, mounted in `src/server.ts`
- Validation: `src/features/*/*/infrastructure/http/schema.zod.ts`
- Domain/persistence logic: `src/features/**`, models, `src/migrations/`
- Configuration: `src/config/zodEnv.ts`
- OpenAPI artifact: `docs/reference/api/lakira-backend-openapi.json` (generated from the Zod schemas, drift- and validity-gated in CI)
- Test strategy: `docs/explanation/testing-strategy.md`

Conflict rule: runtime behavior in code is authoritative; docs must be updated to match.

## 4. Scope Boundaries

In scope:

- REST endpoints under `/api/v1`
- JWT-protected, organization-scoped business routes
- Cursor-based list APIs and domain filters
- API docs surfaces (`/api/v1/docs`, `/api/v1/docs/openapi.json`)
- Health and readiness surfaces (`/api/v1/health`, `/api/v1/ready`)

Out of scope:

- Frontend UX/UI specification
- Native/mobile product requirements
- Commercial/legal policy implementation details unless represented by backend API behavior

## 5. Functional Requirements (As-Built)

### 5.1 Common API Rules

- Base path: `/api/v1`
- Protected routes require `Authorization: Bearer <access token>`. The token carries the active
  organization; the caller must hold an active membership in it, and every domain read and write
  is scoped to that organization.
- Sessions are an access token (HS256, `ACCESS_TOKEN_TTL_SEC`, default 15 minutes) plus a rotating
  refresh token in an httpOnly cookie (`REFRESH_TOKEN_TTL_DAYS`, default 30)
- JSON request bodies for body endpoints; non-object JSON bodies are rejected with `400`
- Every error uses one envelope, documented in the OpenAPI spec for every operation
- Unsupported methods on known routes return `405`
- Dummy endpoints are gated by `ENABLE_DUMMY_ENDPOINTS`

### 5.2 Domain Requirements by Route Group

Operation lists match the committed OpenAPI spec (46 operations, 2026-09-24).

| Domain            | Prefix                                       | Implemented endpoints                                                                                                                                                                                                    | Key requirements                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth              | `/auth`                                      | `POST /register`, `POST /login`, `GET /profile`, `PUT /profile`, `POST /logout`, `POST /refresh`, `POST /forgot-password`, `POST /reset-password`, `POST /verify-email`, `POST /resend-verification`, `POST /switch-org` | Register requires `username/email/password/passwordConfirmation` (must match); password is bcrypt-hashed. Register creates the user, a personal organization and an `owner` membership in one transaction. Register, login, refresh and switch-org each return an access token and set the refresh cookie (ADR-0043). Refresh rotates the token; reuse revokes the family. Logout revokes the family and clears the cookie. Login is locked out after repeated failures (Redis). Password-reset and verification tokens are hashed at rest and single-use; `/verify-email` failures share one generic message and `/resend-verification` always answers 200 (ADR-0017). Email verification is not required by any route (ADR-0018). |
| Organizations     | `/organizations`, `/invites`, `/memberships` | `POST /organizations/:id/invites`, `GET /organizations/:id/members`, `POST /invites/accept`, `PATCH /memberships/:id`, `DELETE /memberships/:id`                                                                         | Roles are `owner`, `admin`, `member` (ADR-0030). Inviting requires `owner` or `admin`; changing roles and removing members require `owner`, and the last owner can be neither demoted nor removed. Listing members requires membership. Invites are hashed, single-use tokens (ADR-0031).                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Metric Categories | `/metric-categories`                         | `POST /`, `GET /`, `GET /:id`, `PUT /:id`, `DELETE /:id`, optional `POST /dummy`                                                                                                                                         | Resource with `name/color/icon`; list supports cursor pagination, search and filters; active names are unique per user, case-insensitive.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Metrics           | `/metrics`                                   | `POST /`, `GET /`, `GET /:id`, `PUT /:id`, `DELETE /:id`, `GET /:metricId/trends`, optional `POST /dummy`                                                                                                                | Metric with `categoryId/originalMetricId/name/description/defaultUnit/isPublic`; default settings created in the same transaction; active names unique per user, case-insensitive; linked category and original metric are ownership-checked; detail supports `include=flat` or `full` or a list of `settings,category,logs`, plus `logsLimit`.                                                                                                                                                                                                                                                                                                                                                                                     |
| Metric Settings   | `/metric-settings`                           | `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`, `PATCH /:id/achieve`, `PATCH /:id/display`                                                                                                                     | One settings row per metric; if `goalEnabled=true`, `goalType` and `goalValue` are required; if `timeFrameEnabled=true`, `startDate` and `deadlineDate` are required and `deadlineDate > startDate`; the display patch requires at least one field.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Metric Logs       | `/metric-logs`                               | `GET /`, `GET /stats`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`, optional `POST /:metricId/dummy`                                                                                                                 | Create requires `metricId`, `type` (`manual` or `automatic`) and `logValue`; duplicate (`metric_id`, `logged_at`) is rejected; `GET /:id` requires a `metricId` query for ownership validation; `/stats` returns aggregate stats with optional filters.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Analytics         | `/analytics`                                 | `GET /dashboard`, `GET /metrics/:metricId`                                                                                                                                                                               | Analytics rate limiter applies; supports `bucket` (`1h/1d/1w/1m/1y`), `tz` (IANA), `fill` (`none/zero/nan`), and either `last=<N><h,d,w,m,y>` or `start`+`end`; the range defaults to `last=30d`; a range-size guard prevents excessive bucket counts; responses are cached (tenant-scoped keys, ADR-0035) and carry an ETag, answering `304` to a matching `If-None-Match`.                                                                                                                                                                                                                                                                                                                                                        |
| Admin             | `/admin`                                     | `GET /_ping`                                                                                                                                                                                                             | Requires `admin` or `owner`; a probe for the role guard, excluded from contract fuzzing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Platform          | `/health`, `/ready`, `/docs`                 | `GET /api/v1/health`, `GET /api/v1/ready`, `GET /api/v1/docs`, `GET /api/v1/docs/openapi.json`                                                                                                                           | Health returns `status`, `environment`, `release` and `timestamp`; ready checks Postgres and Redis. Both are outside the OpenAPI contract and ahead of rate limiting. Docs require auth unless `SWAGGER_REQUIRE_AUTH=false`, which production refuses.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## 6. Data Model Requirements

Twelve tables (27 migrations as of 2026-09-24; full columns in `docs/reference/database-schema.md`):

- Identity and tenancy: `users`, `organizations`, `memberships`, `organization_invites`
- Sessions and tokens: `refresh_tokens`, `password_reset_tokens`, `email_verification_tokens`
- Domain: `metric_categories`, `metrics`, `metric_settings`, `metric_logs`
- System: `processed_messages` (RabbitMQ idempotency ledger, ADR-0007)

Enums: `enum_metric_settings_goal_type` (`cumulative`, `incremental`) and `enum_metric_logs_type`
(`manual`, `automatic`). Membership roles are a checked `varchar` (`owner`, `admin`, `member`);
`users.role` was dropped (`20260516000001`).

Key relational and constraint requirements:

- Every domain row carries `organization_id` and is read and written only within the caller's
  organization. Rows also keep `user_id` (the creator).
- On organization delete: domain tables **RESTRICT**, memberships and invites **CASCADE**, refresh
  tokens and processed messages **SET NULL** (ADR-0029).
- One membership per (user, organization).
- Metric optionally references category and original metric (`SET NULL` on delete).
- Metric has one settings row (`metric_id` unique).
- Metric logs enforce unique (`metric_id`, `logged_at`).
- Active metric and category names are unique per user, case-insensitive (partial unique indexes
  on `(user_id, lower(name)) WHERE deleted_at IS NULL`).
- Soft delete (`deleted_at`) on `users`, `organizations`, `metrics` and `metric_categories`.

## 7. Non-Functional Requirements (As-Built)

Security baseline:

- Short-lived access token plus rotating refresh token with reuse detection (ADR-0019)
- Organization membership checked on every protected request; role guards for admin actions
- Bcrypt password hashing; single-use tokens stored as SHA-256 hashes
- Redis-backed login lockout
- Global and per-route rate limits (see `.claude/rules/security.md`)
- Production refuses unsafe env switches at startup (ADR-0036)
- Log and Sentry payloads redact sensitive keys (`src/config/sensitive-keys.ts`)
- `helmet`, `xss-clean`, `hpp`, and TRACE disallow guard
- Zod validation across body/query/params

Reliability and error handling:

- Central error middleware; domain code raises `DomainError`, and HTTP status mapping lives only in the middleware (ADR-0044)
- Request-ID correlation via AsyncLocalStorage on every log line; logs go to stdout (ADR-0041)
- Optional Sentry error reporting for 5xx (ADR-0021)
- Optional RabbitMQ worker with retries, a parking-lot queue and idempotent handlers (ADR-0005, ADR-0007)
- Deterministic 400 behavior for malformed JSON body inputs
- Graceful shutdown closes HTTP server, DB, and Redis connections

Performance and caching:

- Cursor/list endpoints enforce bounded query params
- Redis cache for selected GET routes, with every key scoped by organization (ADR-0035)
- Redis-backed rate-limit store; in-memory only in tests, or when `REDIS_REQUIRED=false` and Redis is down
- Analytics invalidation is triggered on metric-log mutations

Configuration controls:

- Env validation via Zod schema
- Feature toggles include `ENABLE_DUMMY_ENDPOINTS`, `SWAGGER_REQUIRE_AUTH`, `DISABLE_RATE_LIMITING`, `ENABLE_REDIS_INTEGRATION`, `RABBITMQ_ENABLED`, `EMAIL_PROVIDER` (full list: `docs/reference/configuration.md`)

## 8. Operational Readiness

Release-gate expectations:

- Lint + typecheck pass
- Unit and integration tests pass
- OpenAPI consistency check (`docs:openapi:check`) passes
- Security delta gate passes (no Critical/High findings)
- Schemathesis contract tests pass locally (`contract_local`); the smoke suite passes against staging after deploy (`smoke_staging`)

Contract governance:

- Any API behavior change must update route/schema code, OpenAPI artifact, tests, and this PRD together.

## 9. Known Gaps (Not Yet Productized)

Product capability gaps:

- Reminder scheduling and delivery APIs
- Public profile discovery/social APIs
- First-class metric adoption marketplace/discovery APIs
- End-to-end compliance APIs (for example DSAR/export/delete workflows)

- Subscription and billing (deferred; ADR-0025 and ADR-0026 are Proposed)

Engineering hardening gaps:

- Formalized SLO/SLI objectives and alert thresholds as enforceable repo gates
- Metrics/APM backing service (ADR-0038, Proposed)
- Request-ID propagation across RabbitMQ messages (saas-readiness N4)
- A deployed worker process and the VPS deployment target (ADR-0040, ADR-0042)

## 10. Change Management

- Update this PRD in the same change set as contract-affecting backend changes.
- The earlier `lakira-backend-prd-outline.md` is archived under `docs/internal/archive/`; this file supersedes it.
- Keep frontend product requirements in frontend docs; do not duplicate UI detail here.
- If no content changes during a drift sweep, record review evidence in PR/commit context.
