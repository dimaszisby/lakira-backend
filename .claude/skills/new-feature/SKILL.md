---
name: new-feature
description: Scaffold a complete DDD feature with all layers. Use when the user wants to create a new feature, module, or domain entity in src/features/.
disable-model-invocation: true
argument-hint: "[feature-name] [brief description]"
---

# Scaffold a New DDD Feature

Create a complete feature module at `src/features/<audience>/$0/` following this project's Domain-Driven Design architecture. `<audience>` is `public` for an org-scoped product feature (metric, metric-log, analytics, …) or `shared` for a cross-cutting one (auth). Ask if the description does not make it clear. Below, `<slice>` means `src/features/<audience>/$0`.

## Steps

1. **Read reference features** to match the exact patterns used in this codebase:
   - `src/features/shared/auth/` — simple feature (entity, use cases, queries, providers)
   - `src/features/public/metric-log/` — complex feature (cache, access checks, query repos)
   - Read the `.claude/rules/architecture.md` for architectural constraints

2. **Create the domain layer** (`<slice>/domain/`):
   - `entities/{EntityName}.ts` — private constructor, `static fromPersistence()` factory, getter methods, business logic methods, `private touch()` for updatedAt
   - `repositories/{EntityName}Repository.ts` — interface defining CRUD + query methods

3. **Create the application layer** (`<slice>/application/`):
   - `use-cases/` — one class per write operation, constructor-injected deps (repo + ports), `async execute(input): Promise<Result>`
   - `queries/` — one class per read operation, same pattern
   - `ports/` — interfaces for external services if needed (cache, notifications, etc.)

4. **Create the infrastructure layer** (`<slice>/infrastructure/`):
   - `http/schema.zod.ts` — Zod schemas using base rules from `src/constants/zod/zod-rules.ts`, error messages from `ZodMessages` in `src/constants/zod/zod-messages.ts`, OpenAPI metadata via `.openapi()`
   - `http/controller.ts` — use `catchAsync`, `pickValidated`, `successResponse` for success and `throw new AppError(...)` for failures (there is no `errorResponse()`), build feature via `buildXFeature()`
   - `http/router.ts` — factory `createXRouter()`, middleware pipeline: `router.use(authMiddleware)` first, then per route any rate limiter → `requireJsonObjectBody()` → `validate(schema)` → handler, then `methodNotAllowed()` catch-alls (see `.claude/rules/api-design.md`)
   - `http/dto.ts` — response DTOs if needed
   - `persistence/models/{name}.sequelize.ts` — Sequelize model; one model file per feature also exports `registerXModels(sequelize)` and `associateXModels(models)`, which `src/infrastructure/db/models.ts` calls
   - `persistence/repositories/{Name}RepositorySequelize.ts` — implements domain repository interface
   - `persistence/mappers/{Name}Mapper.ts` — `toDomain(sequelizeModel)` and `toPersistence(domainEntity)`, handles `snake_case` ↔ `camelCase`

5. **Create the wiring files**:
   - `feature.ts` — `export const buildXFeature = () => { ... }` instantiating repos, providers, use cases
   - `index.ts` — export `buildXFeature` and `createXRouter` only (no router instance); imported only by `src/server.ts`, which calls `createXRouter()` when mounting it
   - in the controller, build the feature lazily — `let feature: F | undefined; const getFeature = () => (feature ??= buildXFeature());` — never at module scope (ADR-0045)
   - `public.ts` — the cross-feature surface other features may import (ADR-0044). It must not import routers or `feature.ts`
   - add the `@/features/$0` path alias to `tsconfig.json` alongside the existing ones

6. **Register the feature**:
   - Register Sequelize model in `src/infrastructure/db/models.ts`
   - Mount router in `src/server.ts` under the appropriate API path

7. **Add Zod base rules** if new field types are needed:
   - Add reusable validators to `src/constants/zod/zod-rules.ts` (prefix with `z`)
   - Add error messages to `src/constants/zod/zod-messages.ts` under a new domain key

## Critical Conventions

- All imports use `.js` extensions (ESM)
- Path aliases: `@/*` for `src/*`, `@utils/*`, `@config/*`
- Domain layer has ZERO infrastructure imports
- Use `AppError` for known errors, never raw `throw new Error()`
- Double quotes, semicolons, 2-space indent
- Feature name in kebab-case for directory, PascalCase for classes
