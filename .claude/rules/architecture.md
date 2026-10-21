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

- **Domain layer** has zero infrastructure imports — only pure types and interfaces. It imports
  no application code either: an import with an `application` path segment is rejected in
  `domain/` (ADR-0058, decision 6). A type both layers need is declared in the domain; the
  transaction handle a repository accepts is `PersistenceTransaction` from
  `@/shared/domain/PersistenceTransaction.js`, and nothing else declares it
- **Application layer** depends on domain only, uses port interfaces for external concerns
- **Neither inner layer speaks HTTP.** Domain and application code throws a `DomainError` subclass
  from `@/shared/domain/errors/DomainError.js` (`ValidationError`, `UnauthorizedError`,
  `ForbiddenError`, `NotFoundError`, `ConflictError`), never `AppError`, which carries a status
  code. `src/shared/middleware/error.ts` maps the kind to a status. Lint refuses an `AppError`
  import in `domain/` and `application/`, in features and in `src/shared` (ADR-0068). Code that
  reacts to an error reads its kind, never a status
- Both are lint-enforced (ADR-0058, ADR-0074), in every file under `src/` whatever its
  extension. `domain/` and `application/` import **only from a list** in `eslint.config.mjs`
  (`DOMAIN_IMPORTS`, `APPLICATION_IMPORTS`): `node:crypto`, the shared kernel, shared constants,
  `@/types/domain/`, `@/constants/zod/zod-messages.js`, another feature's `contract.ts` (never its
  `public.ts`), and for the application the logger, `date-io`, cache keys, `envManager` and
  `app-name`. No third-party package. A relative path is judged by where it lands (ADR-0078): into
  the file's own layer, the application into its feature's domain, or onto the list. An import
  with an `infrastructure` path segment is rejected too, relative ones included. A new entry on a
  list needs a reason. `src/shared/{domain,application}` and `src/types/domain`
  take the same lists. What to use instead:
  - a use case declares its own input type; it does not take a DTO type from `infrastructure/http/`
  - a queue handler takes `IncomingMessage` from `@/shared/application/ports/MessageHandlerPort.js`
  - exchange and routing-key names come from `@/shared/application/messaging/job-routes.js`
- **Outside `src/features/`, a feature is entered by one door per purpose** (ADR-0058,
  ADR-0074): `src/app.ts` through its `index.ts`; `src/composition/` through `feature.ts` or
  `public.ts`; `src/infrastructure/db/` and `src/utils/db-helper.ts` through one model file;
  `src/lib/openapi/` through one `http/schema.zod` file. Every other file under `src/` imports no
  feature, `public.ts` included: a type that needs a feature's type lives in a feature. Within
  features, the frozen model exception names its six files
- **One spelling per module** (ADR-0074, ADR-0078): an `@/`, `@utils/` or `@config/` path with a
  `.` or `..` segment or a doubled slash, or one starting `src/`, is rejected; it hid which
  feature it reached
- **Static imports only under `src/`.** The rules above read `import … from` and `export … from`,
  so the forms they cannot read are refused outright: a dynamic `import()`, an `import("…")` type
  (write `import type { X } from "…"`), anything from node's `module` package
  (`createRequire`), `process.getBuiltinModule`, `module.require`, `eval`, and the `Function`
  constructor however it is reached (ADR-0074, ADR-0078). A
  file that truly needs a lazy import gets a named exemption in `eslint.config.mjs`
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

A feature's queue handlers are built by the same factory, from the same dependencies as its use
cases (`dummyLogsHandler` in `buildMetricLogFeature`), so no process can wire them differently.

### One wiring for every entry point (ADR-0056)

The application runs as two processes, `src/server.ts` and `src/worker.ts`. When a feature needs
an adapter that another feature provides, it is wired once in `src/composition/`
(`buildWiredMetricLogFeature`), and both entry points call that function.

- An entry point never calls such a feature's `buildXFeature` itself, and `src/worker.ts` imports
  nothing from a feature's `domain/`, `application/` or `infrastructure/`.
- `src/composition/` imports a feature through its `feature.ts` or `public.ts`, never `index.ts`:
  `index.ts` exports the router, which loads express and every rate limiter into the worker.
- A factory's no-op defaults (`NoopVisualizationInvalidation`) are for tests. They are not
  referenced anywhere else in `src/`.

`__tests__/unit/architecture.test.ts` › "entry points share one wiring" enforces all three. The
worker once built its handler by hand with the no-op, and queued jobs left charts stale (audit R5).

## Export Convention

Three surfaces per feature (ADR-0045, ADR-0078):

- **`index.ts` is for `src/app.ts` only.** It exports the router factories (`createXRouter`) and
  `buildXFeature`. `createApp` calls the factories at mount time. `feature.ts` may also be
  imported by `src/composition/` (ADR-0056).
- **`public.ts` is what other features' infrastructure and `src/composition/` import** — a
  deliberately narrow set (mappers, DTO helpers, `authMiddleware`, adapters). Another feature's
  domain and application may not import it.
- **`contract.ts` is what other features' domain and application import** (ADR-0078). It
  re-exports domain types from its own feature's `domain/` and nothing else; lint holds it to the
  domain's rules. Only metric-category has one (`type MetricCategory`).
- **Nothing else of another feature is importable.** ESLint rejects a feature importing another
  feature's `index.ts`, bare alias or `feature.ts`, and anything under its `domain/`,
  `application/` or `infrastructure/`. Both spellings are checked: the short alias (`@/features/metric/...`) and the
  full path (`@/features/public/metric/...`). `__tests__/unit/feature-boundaries.lint.test.ts`
  proves each rule rejects, and `architecture.test.ts` catches a relative import that crosses into
  another feature.
- **A port belongs to the feature that consumes it** (ADR-0023), so a contract carries no port.
  If a feature needs something from another, it declares the interface in its own
  `application/ports/` and receives the adapter, which the provider exports from its `public.ts`. `MetricAccessPort` is the worked example: one
  copy each in metric-log, metric-settings and analytics, all satisfied by `MetricAccessSequelize`.
- **Importing a feature module constructs nothing.** No router, feature or middleware is built at
  module scope. `__tests__/unit/architecture.test.ts` enforces this.
- **A feature is handed to its router** (ADR-0072). `src/composition/features.ts`
  (`buildWiredFeatures`) builds every feature once; `src/app.ts` (`createApp`) hands each to its
  router, `createXRouter(feature)`, which builds `createXController(feature)`. A controller keeps
  no module-level slot and builds nothing, and no file exports an `install*Feature` or `*ForTest`
  hook; `architecture.test.ts` fails on each. A test that needs a different feature builds an app
  of its own with `appWith({ ... })` (`__tests__/integration/helpers/app-with.ts`) or calls the
  controller factory with a stub. One slot is left on purpose: `authMiddleware`'s default
  instance, which routers and tests refer to by identity
- Use `.js` extensions in all import paths (ESM)

## Post-response work

Work a handler starts but does not await — the verification email, the cache write — goes through
`runInBackground(label, task, meta)` from `src/utils/background-tasks.ts`, never a bare
`promise.catch(...)` (ADR-0054). A bare promise cannot be waited for: shutdown closes the database
underneath it, and the next integration test truncates the tables it is writing to. Shutdown and
the integration setup both call `drainBackgroundTasks()`.

Lint enforces it (ADR-0076): `no-floating-promises` and `no-misused-promises` are errors in every
linted file. A promise is awaited, handed to `runInBackground`, given a `.catch` that handles the
failure, or marked `void` with a comment saying why nothing awaits it. Shutdown itself goes through
`createShutdown` (`src/utils/shutdown.ts`): it runs once, within one deadline.

- The label names the work in logs and in the drain-timeout warning; keep it stable.
- `meta` is logged on failure. Ids only — never an email address or a token.
- The work is not durable: a crash loses it. Anything that must not be lost belongs on the queue.
- The verification email is on the queue (ADR-0067): `ScheduleEmailVerification` publishes a job
  the worker sends, and falls back to `runInBackground` only when the queue is off or a publish
  fails. A new job follows it: the message carries ids, never an address or a token; the handler
  reads its body with `readJobBody` and checks every field before acting, so a bad one parks
  (`src/shared/application/messaging/job-body.ts`); it does its writes and its side effect inside
  `MessageIdempotencyPort.runOnce`, which records it per queue; and its queue is declared through
  `assertWorkQueue` in `topology.ts`, its retries waiting in a queue per delay (ADR-0073). Inside
  `runOnce`, every repository call passes the `tx` the work receives, so a job holds one connection;
  a read through the pool there deadlocks once the pool is full of jobs (ADR-0077). The password-reset email does the same,
  with its fallback in the request (ADR-0069), and so does the invite email, whose fallback saves
  the invite and sends inside one transaction (ADR-0070).
