# Backend Documentation Plan (Current)

**Status:** Active
**Last updated:** 2026-04-13

This repository no longer uses a single monolithic backend-doc writing plan.
Documentation is maintained through source-of-truth docs plus update rules.

## Canonical Sources

- Product baseline: `docs/explanation/product-requirements.md`
- Route contract view: `docs/documentation/architecture/lakira-backend-routes.md`
- Data model view: `docs/reference/database-schema.md`
- Type/DTO view: `docs/documentation/architecture/lakira-backend-types.md`
- OpenAPI artifact: `docs/reference/api/lakira-backend-openapi.json`

## Maintenance Workflow

1. Change backend contract in code (routes/schemas/models/migrations).
2. Update OpenAPI artifact.
3. Update canonical docs above in the same PR.
4. Run contract/integration checks.
5. Record significant decisions in the relevant `docs/development/` or `docs/tests/` topic docs.

## Note

For reusable documentation structure guidance, use:
`docs/explanation/documentation-standards.md`.
