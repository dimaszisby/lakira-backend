# Postman/Newman Checklist

**Status:** Superseded — Newman was retired in #75 (`a4635f3`); see this folder's `README.md`
**Last updated:** 2026-04-13

## Contract Readiness

- [ ] OpenAPI artifact regenerated and committed (`npm run docs:openapi:check` passes).
- [ ] Collections reflect current FE-facing endpoints.
- [ ] Local/staging environment files and runtime variable usage are current.

## Scenario Coverage

- [ ] Happy-path requests exist for each critical endpoint domain.
- [ ] Validation error scenarios covered (`400`).
- [ ] Auth failures covered (`401`).
- [ ] Not-found/ownership errors covered (`404`/`403` where applicable).
- [ ] Analytics caching/conditional request behavior covered (`ETag`, `Cache-Control`, `304`).

## Execution

- [ ] `npm run test:contract:local` passes.
- [ ] Reports generated under `reports/local/<timestamp>/`.
- [ ] For staging changes: `npm run test:contract:staging` passes with current `STAGING_*` secrets.
- [ ] Staging reports generated under `reports/staging/<timestamp>/`.

## CI/Gate

- [ ] `contract_local` remains required in branch protection.
- [ ] Artifact upload paths still match workflow configuration.
- [ ] Failures are logged in `../incidents.md` and metric impact tracked in `../metrics-tracker.md`.
