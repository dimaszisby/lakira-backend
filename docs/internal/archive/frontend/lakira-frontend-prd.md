# Lakira Frontend Product Requirements Document (PRD)

**Status:** Active baseline
**Last updated:** 2026-04-13
**Product surface:** Web frontend consuming Lakira backend (`/api/v1`)
**Backend contract reference:** `docs/explanation/product-requirements.md`

## 1. Purpose

This PRD defines the frontend product requirements aligned to the backend APIs currently implemented. It replaces speculative endpoint assumptions with an integration-safe baseline.

Audience:

- Frontend engineers
- Product/design stakeholders
- QA and release maintainers

## 2. Product Intent

Lakira frontend helps users manage personal progress tracking through:

- Account access and profile management
- Metric category and metric library management
- Goal and display settings per metric
- Time-series logging and trend viewing
- Dashboard and per-metric analytics visualization

## 3. Users and Core Jobs

Primary user: authenticated individual tracking personal goals.

Core jobs:

- Create and maintain personal metric taxonomy (categories + metrics)
- Record measurable progress entries over time
- Configure goal/time-frame/display behavior for each metric
- Review trends and dashboard summaries to understand trajectory

## 4. Scope Boundaries

In scope:

- Browser-based frontend UX and state flows for the implemented backend API set
- Responsive layouts for dashboard, libraries, logs, settings, and profile flows
- Validation and error presentation based on backend contract outcomes

Out of scope:

- Mobile/native app requirements
- Features not exposed by backend APIs (for example reminders, social discovery, adoption marketplace)
- Backend internals beyond integration contracts

## 5. Functional Requirements

### 5.1 Authentication and Session UX

- Support register, login, profile read/update, and logout flows.
- Store JWT securely in client strategy agreed by implementation (for example memory + refresh flow when available).
- Guard authenticated pages and route unauthenticated users to login.
- Show actionable error messages for auth validation failures.

Backend endpoints:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/profile`
- `PUT /api/v1/auth/profile`
- `POST /api/v1/auth/logout`

### 5.2 Metric Category Management

- List categories with pagination/search/filter/sort support.
- Create, update, delete categories.
- Prevent duplicate submission patterns in UI when server-side uniqueness errors occur.

Backend endpoints:

- `GET /api/v1/metric-categories`
- `POST /api/v1/metric-categories`
- `GET /api/v1/metric-categories/:id`
- `PUT /api/v1/metric-categories/:id`
- `DELETE /api/v1/metric-categories/:id`

### 5.3 Metric Management

- List and search metrics with cursor pagination controls.
- Create/update/delete metrics with category association.
- Display metric detail with include modes where needed (settings/category/logs).
- Surface trend visualization entry point from metric detail.

Backend endpoints:

- `GET /api/v1/metrics`
- `POST /api/v1/metrics`
- `GET /api/v1/metrics/:id`
- `PUT /api/v1/metrics/:id`
- `DELETE /api/v1/metrics/:id`
- `GET /api/v1/metrics/:metricId/trends`

### 5.4 Metric Settings Management

- Support one settings record per metric lifecycle.
- Validate goal/time-frame input dependencies in UI before submit:
  - Goal enabled requires goal type + goal value.
  - Time frame enabled requires start + deadline and deadline > start.
- Allow display option updates for dashboard behavior.

Backend endpoints:

- `GET /api/v1/metric-settings`
- `POST /api/v1/metric-settings`
- `GET /api/v1/metric-settings/:id`
- `PUT /api/v1/metric-settings/:id`
- `DELETE /api/v1/metric-settings/:id`
- `PATCH /api/v1/metric-settings/:id/achieve`
- `PATCH /api/v1/metric-settings/:id/display`

### 5.5 Metric Logging

- Create/edit/delete metric logs.
- Provide efficient list browsing with query/filter support.
- Show duplicate timestamp conflict feedback clearly.
- Display aggregate stats where relevant.

Backend endpoints:

- `GET /api/v1/metric-logs`
- `POST /api/v1/metric-logs`
- `GET /api/v1/metric-logs/:id?metricId=<uuid>`
- `PUT /api/v1/metric-logs/:id`
- `DELETE /api/v1/metric-logs/:id`
- `GET /api/v1/metric-logs/stats`

### 5.6 Analytics Views

- Dashboard page consumes multi-metric visualization endpoint.
- Metric detail analytics page consumes per-metric visualization endpoint.
- Query UX supports bucket/range/time-zone/fill controls without generating invalid combinations (`last` xor `start+end`).
- Handle empty-series, sparse-series, and large-range validation errors.

Backend endpoints:

- `GET /api/v1/analytics/dashboard`
- `GET /api/v1/analytics/metrics/:metricId`

## 6. UX and Design Requirements

- Prioritize clarity over decorative density for dashboard + data-entry flows.
- Keep category/metric/log/settings CRUD discoverable in <=2 navigation steps from dashboard.
- Use consistent feedback patterns for loading, empty, validation-error, and destructive actions.
- Ensure keyboard-accessible form controls and actionable labels for major interactions.

## 7. Non-Functional Requirements

Performance:

- Initial authenticated shell should load quickly on common broadband/mobile conditions.
- Large lists must use server pagination rather than unbounded client rendering.
- Analytics pages should avoid unnecessary refetch churn (query-key and cache strategy required).

Reliability:

- Frontend must handle backend `fail`/`error` responses without fatal UI crashes.
- Network retries should be bounded and avoid duplicate mutating submissions.

Security:

- Never expose JWT in URL/query string.
- Escape/render user-provided text safely to avoid frontend XSS vectors.
- Use HTTPS-only deployment targets for non-local environments.

Accessibility:

- Baseline WCAG-focused semantics for forms, navigation, and chart alternatives.

## 8. Explicit Gaps and Dependency Notes

Not available from backend today (frontend must not imply shipped capability):

- Reminder scheduling/notification APIs
- Public profile directory/social feed APIs
- Metric adoption marketplace/discovery APIs
- End-to-end legal workflow APIs (for example DSAR flows)

## 9. Acceptance Criteria (Frontend Baseline)

- Frontend endpoint mapping matches backend routes exactly (no legacy aliases).
- All core CRUD + analytics flows complete without relying on undocumented API behavior.
- Form validation mirrors critical backend invariants to reduce avoidable round trips.
- API errors are translated into user-actionable feedback.
- PRD remains aligned with backend PRD and OpenAPI contract.

## 10. Change Management

- Update this document when frontend requirements or backend integration contracts change.
- If backend routes/schemas change, update this PRD in the same PR as frontend integration updates.
- Keep implementation detail (component-level architecture) in engineering design docs, not this product PRD.
