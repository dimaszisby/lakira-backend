# Auth Feature Module

- Last updated: 2025-12-03T06:24:39Z

## Context

- Authentication logic now lives inside `src/features/auth`, exposed through the feature entrypoint consumed by `src/server.ts`.
- Responsibilities: user registration, login/token generation, profile retrieval, profile updates, logout (client-side only).
- Dependencies: Sequelize `models.User`, bcrypt for hashing, JWT token generator, Express controllers, feature-owned Zod schemas/DTO/mappers under `infrastructure/http`.

## Migration Goals

1. Mirror the metric feature slice layout so auth logic sits inside `src/features/auth`.
2. Introduce a domain entity + repository contract for users rather than manipulating Sequelize models directly.
3. Provide application use cases (`RegisterUser`, `LoginUser`, `GetProfile`, `UpdateProfile`) behind explicit ports (password hashing, token generation).
4. Relocate HTTP handlers/routes into the feature infrastructure layer and expose a composition root for `src/features/auth/infrastructure/http/router.ts`.
5. Add targeted unit/integration tests for use cases and adapters to replace the legacy service-level coverage.

## Work Breakdown

- **Domain**: define `AuthUser` entity with invariants + repository interface for uniqueness checks, creation, and lookups.
- **Application**: implement use cases plus ports for password hashing, token issuing, and profile serialization.
- **Infrastructure**: Sequelize-backed `UserRepository`, bcrypt hasher, JWT token provider, Express controller functions, and the feature-owned `authMiddleware` (`src/features/auth/infrastructure/http/authMiddleware.ts`).
- **Testing**: add unit specs for the domain/use cases and integration tests for repository + HTTP layer.

## Risks / Notes

- Must ensure registration/login remain rate-limited and validated as they are today.
- Password hashing + token generation should stay deterministic with existing helpers to avoid regression in other modules.
- Until profile update migrates, keep compatibility helpers so legacy code can reuse the new use cases progressively.

## Controller Wiring

- HTTP handlers live under `src/features/auth/infrastructure/http/controller.ts` and are composed via `buildAuthFeature`.
- Tests can inject stubbed use cases by calling the exported `overrideAuthFeature(buildFeature())` helper.

## Testing

- Unit: `NODE_ENV=test SKIP_DB_LIFECYCLE=true npm run jest -- __tests__/features/auth/application/*.test.ts`
- Domain/entity: `NODE_ENV=test SKIP_DB_LIFECYCLE=true npm run jest -- __tests__/features/auth/domain/AuthUser.test.ts`
- Infrastructure: `NODE_ENV=test SKIP_DB_LIFECYCLE=true npm run jest -- __tests__/features/auth/infrastructure/**/*.test.ts`
- Controller tests rely on the `overrideAuthFeature` seam and mock guards/formatters to assert protocol translation without hitting the database.
