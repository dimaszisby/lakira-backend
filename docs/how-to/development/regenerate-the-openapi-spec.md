# OpenAPI + Zod Guide (Lakira Backend)

**Status:** Active
**Last updated:** 2026-04-13

This guide defines how OpenAPI documentation is produced and maintained in this repository.

## 1. Source of Truth

OpenAPI docs are generated from runtime-adjacent Zod/OpenAPI definitions in:

- `src/lib/openapi/openapi-config.ts`
- `src/lib/openapi/openapi-schemas.ts`
- `src/lib/openapi/openapi-docs.ts`
- Feature validation schemas under `src/features/*/*/infrastructure/http/schema.zod.ts`

Generated artifact:

- `docs/reference/api/lakira-backend-openapi.json`

Runtime docs endpoints:

- `GET /api/v1/docs`
- `GET /api/v1/docs/openapi.json`

## 2. Required Workflow for Contract Changes

When changing API behavior (route, params/query/body rules, response shape):

1. Update runtime code first (router/controller/schema/domain behavior).
2. Update OpenAPI schema/path registration (`openapi-schemas.ts` and/or `openapi-docs.ts`).
3. Regenerate the artifact:
   - `npm run docs:openapi:generate`
4. Verify generated artifact is committed and consistent:
   - `npm run docs:openapi:check`
5. Update canonical docs in the same PR when behavior changed:
   - `docs/explanation/product-requirements.md`
   - the generated spec at `docs/reference/api/lakira-backend-openapi.json`

## 3. Conventions

- Use OpenAPI 3.1.0 config from `openapi-config.ts`.
- Keep endpoint paths in OpenAPI aligned with router mounts (server base path is `/api/v1`).
- Add `security: [{ BearerAuth: [] }]` for authenticated endpoints.
- Reuse shared component responses (`BadRequestError`, `UnauthorizedError`, etc.) for consistency.
- Keep examples realistic and avoid exposing internal implementation details.
- Treat validation behavior in Zod as contract behavior; OpenAPI must mirror it.

## 4. Review Checklist

Before merging API-related changes:

- Route exists and method matches runtime router.
- Required/optional query/body/path fields match active Zod schema behavior.
- Success and error response envelopes match real middleware/controller responses.
- Security requirements are represented in OpenAPI.
- Generated JSON is updated and diff-reviewed.

## 5. Scope Boundaries

This guide is implementation-focused for Lakira backend only.
It is not a generic OpenAPI tutorial.

For broader architecture/process planning, use:
