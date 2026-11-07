# Security Audit Log – Features/Controllers Layer

- **Generated:** Fri Nov 21 17:45:48 WIB 2025
- **Scope:** Application logic housed under `/features`, `/controllers`, `/routes`, and `/services`. Focus is on routing, validation, domain services, and feature modules. Infrastructure and configs were covered separately.

## Architecture Overview

- **Routing & Controllers:** REST entry points reside in `src/routes` and `src/controllers`. Each resource router wires `authMiddleware`, Zod-based validation, caching, and `userRateLimiter` (e.g., metrics in `src/routes/metric.routes.ts:1-118`, metric logs in `src/routes/metric-log.routes.ts:1-154`, settings in `src/routes/metric-settings.routes.ts:1-141`, auth in `src/features/auth/infrastructure/http/router.ts:1-31`). Controllers marshal DTOs and call the corresponding service layer (`src/controllers/*.ts`).
- **Services / Features:** Business logic for auth now lives inside `src/features/auth`, metric logs and metrics are under their slices, while metric settings still rely on `src/services/metric-settings.service.ts`.
- **Feature Modules:** New DDD-style functionality for analytics, cursor pagination, and caching is under `src/features`. Example: cursor-based listing in `src/features/metric/application/queries/ListMetrics.ts:1-200` and visualization queries at `src/features/analytics/application/queries/GetVisualization.ts:1-132` plus dashboard variant `GetDashboardVisualization.ts:1-144`.
- **Shared Guards:** Helpers like `validateMetricAccess` and entity finders are centralized in `src/utils/db-helper.ts:1-150` and are reused throughout services.

## Existing Protective Controls

- **Strong request validation:** Zod schemas enforce DTO shape for most routes via the shared `validate` middleware (e.g., metric body rules in `src/types/api/zod-metric.schema.ts:1-120`, log schemas in `src/types/api/zod-metric-log.schema.ts:1-140`, settings schema in `src/types/api/zod-metric-settings.schema.ts:1-150`).
- **Authentication guardrails:** Resource routers (metrics, logs, settings, analytics) call `authMiddleware` up front (`src/routes/metric.routes.ts:20-27`, `src/routes/metric-log.routes.ts:95-99`, `src/features/analytics/infrastructure/http/visualization.router.ts:11-21`), and controllers double-check with `assertAuthenticated`.
- **Rate limiting on mutations:** `userRateLimiter` wraps state-changing routes, reducing abuse for create/update/delete endpoints (e.g., `src/routes/metric.routes.ts:101-115`, `src/routes/metric-log.routes.ts:125-151`, `src/routes/metric-settings.routes.ts:103-140`).
- **Multi-tenant filtering:** Feature query modules consistently join on the authenticated user when reading paginated datasets (e.g., `baseIncludeForOwnership` in `src/features/metric/application/queries/ListMetrics.ts:101-160`, log listing include in `src/features/metric-log/application/queries/ListMetricLogs.ts:217-253`, settings in `src/features/metric-settings/application/queries/listMetricSettings.ts:168-220`).

## Findings & Recommendations

1. **Privilege escalation during signup (Critical).** The signup schema exposes a `role` field (`src/features/auth/infrastructure/http/schema.zod.ts:8-33`), and the register use case persists the entire payload without filtering. An attacker can POST `{ role: "admin" }` to `/api/v1/auth/register` (`src/features/auth/infrastructure/http/router.ts:13-20`) and immediately receive an admin account. Restrict the schema to user-controllable fields and hard-code the role server-side.

2. **Public metrics become world-writable (Critical).** Authorization helpers only block access when a metric is marked non-public: `validateMetricAccess` and `findOwnedMetricSettings/Log` return successfully if `metric.isPublic === true` (`src/utils/db-helper.ts:18-135`). Because new metrics default to `isPublic: true` (`src/constants/zod/zod-rules.ts:60-87`) and controllers/use cases persist the client flag (`src/features/metric/infrastructure/http/controller.ts:1-51`, `src/features/metric/application/use-cases/CreateMetric.ts:1-34`), any authenticated user can read/update logs, settings, and stats for another user’s metric simply by targeting its ID. Treat `isPublic` as a read-only discovery flag and continue enforcing `metric.userId === requester` for all write operations.

3. **Login endpoint lacks validation and throttling (High).** `/api/v1/auth/login` is defined without `validate` or `userRateLimiter` middleware (`src/features/auth/infrastructure/http/router.ts:20-29`), so attackers can flood the server with arbitrarily large payloads and unlimited password guesses. Add schema validation and at least the lightweight `userRateLimiter` (ideally per-IP + CAPTCHA) to slow brute-force attempts.

4. **Testing-only mass insert endpoints are exposed (High).** Controllers and routes ship dummy data generators meant for local testing: metrics (`src/features/metric/infrastructure/http/controller.ts:153-205`, `src/routes/metric.routes.ts:123-150`) and metric logs (`src/features/metric-log/infrastructure/http/controller.ts:120-166`, `src/routes/metric-log.routes.ts:144-152`) create up to 1,000 records per request (`src/types/api/zod-metric.schema.ts:126-140`, `src/types/api/zod-metric-log.schema.ts:120-154`). They’re available to any authenticated user in production, enabling database bloat and noisy metrics. Hide these behind an admin-only flag or remove them outside non-production builds.

5. **User-identifying data logged in plaintext (Medium).** Several cache helpers `console.log` full cache keys or operations that embed user IDs, metric IDs, filters, and counts: `src/routes/metric-log.routes.ts:47-87`, `src/routes/metric-settings.routes.ts:48-78`, `src/features/metric-log/infrastructure/http/controller.ts:120-166`, `src/features/metric-settings/application/queries/listMetricSettings.ts:199`, `src/features/metric-log/application/queries/ListMetricLogs.ts:221`, and cache utilities under `src/features/metric-category`. These logs can leak sensitive behavioral data if log storage is compromised. Replace ad-hoc `console.log` calls with structured `logger.debug` statements that scrub identifiers or remove them entirely in production builds.

6. **Analytics visualization endpoints lack route-level throttling (Medium).** The analytics router explicitly notes `// TODO: User Rate Limit` and exposes `/api/v1/analytics/dashboard` and `/api/v1/analytics/metrics/:metricId` without any additional limiter (`src/features/analytics/infrastructure/http/visualization.router.ts:11-30`). These endpoints execute heavy aggregation SQL over potentially large timespans (`src/features/analytics/application/queries/GetVisualization.ts:1-120`, `src/features/analytics/application/queries/GetDashboardVisualization.ts:1-120`). Attackers can spam expensive range queries to exhaust the database. Apply dedicated throttling or caching per user/metric combination at the router layer.

## Suggested Next Steps

1. Sanitize auth DTOs to prevent client-controlled role assignment and introduce validation + rate limiting on login.
2. Rework `validateMetricAccess`/`findOwned*` helpers so write operations require ownership regardless of the `isPublic` flag, and consider defaulting new metrics to private.
3. Disable or strictly gate all dummy-data endpoints outside local/test environments.
4. Remove sensitive `console.log` statements or downgrade them to redacted debug logs behind feature flags.
5. Add request limits or async job offloading for analytics visualization routes to mitigate resource-exhaustion attacks.
