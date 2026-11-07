# Lakira Backend PRD Outline

Use this outline when revising `lakira-backend-prd.md`. Keep it as-built first; capture non-implemented themes as explicit gaps.

## 1. Metadata

- Status
- Last updated
- Scope
- Review cadence

## 2. Purpose

- Document intent
- Audience

## 3. Product Intent

- Core backend capabilities
- Service stack summary

## 4. Source of Truth and Precedence

- Normative artifacts (routes, schemas, models/migrations, OpenAPI, tests)
- Conflict rule (runtime code wins)

## 5. Scope Boundaries

- In scope
- Out of scope

## 6. Functional Requirements (As-Built)

- Common API rules
- Domain requirements by route group
  - Auth
  - Metric Categories
  - Metrics
  - Metric Settings
  - Metric Logs
  - Analytics
  - Platform surfaces

## 7. Data Model Requirements

- Core tables/enums
- Relational rules
- Constraint/index expectations

## 8. Non-Functional Requirements

- Security baseline
- Reliability/error handling
- Performance/caching
- Configuration controls

## 9. Operational Readiness

- CI/release gates
- API contract governance

## 10. Known Gaps

- Product capability gaps
- Engineering hardening gaps

## 11. Change Management

- Update triggers
- Sync rules with OpenAPI/tests
- Drift-sweep cadence
