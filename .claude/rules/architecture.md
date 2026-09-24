---
paths:
  - "src/features/**"
  - "src/infrastructure/**"
  - "src/shared/**"
---

# Architecture — Feature-Slice DDD

## Feature Structure

Every feature in `src/features/` follows this layered structure:

```
features/{name}/
├── domain/
│   ├── entities/        # Domain entities (private constructor + static factory)
│   └── repositories/    # Repository interfaces (ports)
├── application/
│   ├── use-cases/       # Write operations (commands)
│   ├── queries/         # Read operations
│   └── ports/           # External service interfaces (TokenProvider, PasswordHasher)
├── infrastructure/
│   ├── http/            # router.ts, controller.ts, dto.ts, schema.zod.ts
│   ├── persistence/     # XRepositorySequelize, Sequelize models
│   ├── providers/       # Port implementations (JwtTokenProvider, BcryptPasswordHasher)
│   └── mappers/         # XMapper with toDomain() / toPersistence()
├── feature.ts           # buildXFeature() — manual DI wiring
├── index.ts             # Router factories + buildXFeature, for src/server.ts only
└── public.ts            # What other features may import
```

## Dependency Rules

- **Domain layer** has zero infrastructure imports — only pure types and interfaces
- **Application layer** depends on domain only, uses port interfaces for external concerns
- **Infrastructure layer** implements domain interfaces and wires to frameworks
- **feature.ts** is the composition root — instantiates repos, providers, use cases

## Banned Imports (ESLint-enforced)

Never import from these legacy paths — they no longer exist:

- `src/services/**`, `@services/**`
- `src/controllers/**`, `@controllers/**`
- `src/routes/**`, `@routes/**`

## Domain Entity Pattern

```typescript
class MyEntity {
  private constructor(private props: MyEntityProps) {}
  static fromPersistence(raw: PersistenceData): MyEntity { ... }
  get id(): string { return this.props.id; }
  changeSomething(value: string): void { this.props.field = value; this.touch(); }
  private touch(): void { this.props.updatedAt = new Date(); }
}
```

## Manual Dependency Injection

Each feature exports a factory function — no DI container:

```typescript
export function buildAuthFeature() {
  const repo = new UserRepositorySequelize();
  const hasher = new BcryptPasswordHasher();
  const tokenProvider = new JwtTokenProvider();
  const registerUser = new RegisterUser(repo, hasher, tokenProvider);
  return { registerUser /* ... */ };
}
```

## Export Convention

Two surfaces per feature (ADR-0045):

- **`index.ts` is for `src/server.ts` only.** It exports the router factories (`createXRouter`) and
  `buildXFeature`. `server.ts` calls the factories at mount time.
- **`public.ts` is what other features import** — a deliberately narrow set (mappers, DTO
  helpers, `authMiddleware`). ESLint rejects a feature importing another feature's `index.ts`,
  bare alias or `feature.ts`.
- **Importing a feature module constructs nothing.** No router, feature or middleware is built at
  module scope; controllers build their feature on first use (`feature ??= buildXFeature()`).
  `__tests__/unit/architecture.test.ts` enforces this.
- Use `.js` extensions in all import paths (ESM)
