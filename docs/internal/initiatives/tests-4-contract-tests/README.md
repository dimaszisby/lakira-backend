# Contract Tests

**Status:** Active
**Last updated:** 2026-04-13

Contract tests enforce externally visible API behavior with **Schemathesis** (spec-driven
generative/fuzz coverage). Postman/Newman was the second tool until it was retired in #75
(`a4635f3`); `postman-newman/` is kept as history.

## Scope

In scope:

- FE-facing APIs under `/api/v1/auth`, `/metrics`, `/metric-logs`, `/metric-settings`, `/metric-categories`, `/analytics`
- Status-code, payload-shape, and key header guarantees (`Content-Type`, `ETag`, `Cache-Control` where applicable)
- Local and staging contract execution paths

Out of scope:

- UI/E2E automation
- performance/load testing
- lower-level logic already covered by unit/integration layers

## Commands

```bash
npm run test:contract:schemathesis:local
npm run test:contract:schemathesis:staging
npm run contract:local:quick
npm run contract:local:gate
npm run contract:local:full
```

## Environment Notes

- Local runs rely on deterministic seeding (`npm run seed:contract-tests`) and `tmp/contract-seed.json` outputs.
- For heavy fuzzing/local stress, use `DISABLE_RATE_LIMITING=true` in test env.
- Staging runs require `STAGING_*` and `SCHEMATHESIS_STAGING_*` secrets.

## CI Expectations

- `contract_local` should remain required for merge gates.
- `contract_staging` is dependent on deploy + secret readiness.
- Newman and Schemathesis artifacts must be retained for triage.

## References

- `contract-tests-plan.md`
- `contract-tests-checklist.md`
- `contract-tests-ticket.md`
- `metrics-tracker.md`
- `incidents.md`
- `postman-newman/README.md`
- `postman-newman/STAGING_RUNBOOK.md`
- `schemathesis/README.md`
