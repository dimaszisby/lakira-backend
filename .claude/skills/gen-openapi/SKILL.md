---
name: gen-openapi
description: Regenerate the OpenAPI spec and verify consistency. Use when the user says "generate openapi", "update swagger", "openapi spec", or after modifying Zod schemas or route definitions.
disable-model-invocation: true
---

# Regenerate OpenAPI Spec

## Steps

1. **Generate the spec** from current Zod schemas and route definitions:

   ```bash
   npm run docs:openapi:generate
   ```

2. **Verify consistency** — ensure the generated spec matches what's committed:

   ```bash
   npm run docs:openapi:check
   ```

3. **Report the result**:
   - If check passes: spec is up to date
   - If check fails: show the diff and remind the user to commit the updated spec at `docs/reference/api/lakira-backend-openapi.json`

## When This Is Needed

- After adding or modifying routes in any feature's `router.ts`
- After changing Zod schemas in `schema.zod.ts` files
- After modifying OpenAPI metadata (`.openapi()` calls on Zod schemas)
- After updating `src/lib/openapi/openapi-docs.ts` or `src/lib/openapi/openapi-schemas.ts`
