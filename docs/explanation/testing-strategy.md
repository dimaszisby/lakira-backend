# Lakira Backend Testing Strategy

**Status:** Active
**Last updated:** 2026-04-13

This document defines the execution order, responsibility, and gate intent of the Lakira backend test stack.

## 1. Testing Pyramid

Execution order (left-to-right):

`Static checks -> Unit tests -> Integration tests -> Contract tests`

- Static checks fail fastest and prevent low-signal runtime failures.
- Unit tests validate domain/use-case/controller logic in memory.
- Integration tests validate real app wiring with database dependencies.
- Contract tests validate externally visible API behavior against OpenAPI/consumer expectations.

## 2. Layer Commands

- Static checks:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run format:check`
  - `npm run docs:openapi:check`
- Unit tests:
  - `npm run test:unit`
  - `npm run test:unit:coverage`
- Integration tests:
  - `npm run test:integration`
  - `npm run test:integration:coverage`
  - `npm run integration:local`
- Contract tests:
  - `npm run test:contract:schemathesis:local`
  - `npm run test:contract:schemathesis:staging`

## 3. CI Gate Expectations

- PR gate baseline:
  1. static checks green
  2. unit tests green
  3. integration tests green
  4. `contract_local` green
- Staging contract runs depend on deploy readiness + secrets.
- Coverage artifacts are retained for unit/integration and contract reports.

## 4. Ownership and Drift Control

- Backend platform owns test scripts/docs and keeps this strategy synchronized with CI.
- Any change to commands, thresholds, or required checks must update this file and the affected layer README in the same PR.
- Historical migration docs remain for traceability, but canonical operational guidance lives in layer READMEs.

## 5. Canonical Layer Docs

- `docs/internal/initiatives/tests-1-static-checks/README.md`
- `docs/internal/initiatives/tests-2-unit-tests/README.md`
- `docs/internal/initiatives/tests-3-integration-tests/README.md`
- `docs/internal/initiatives/tests-4-contract-tests/README.md`
