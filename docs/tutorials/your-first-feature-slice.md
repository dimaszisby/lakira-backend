# Your first feature slice

Read one slice end to end, then add an endpoint to it. By the end you will know which file to
open for any change in this codebase.

Assumes you finished [Getting started](./getting-started.md) and have the API running.

We will use `src/features/public/metric-category/` — the smallest slice that still has every
layer, at 28 files.

## The shape

```
metric-category/
├── domain/                     rules — no I/O, no framework
│   ├── entities/               MetricCategory
│   ├── value-objects/          MetricCategoryName, Color, Icon
│   ├── repositories/           an interface, not an implementation
│   └── services/               MetricCategoryFactory
├── application/                orchestration
│   ├── use-cases/              CreateCategory, UpdateCategory, DeleteCategory
│   ├── queries/                ListCategories, GetCategory
│   └── ports/                  CachePort
├── infrastructure/             the outside world
│   ├── http/                   router · schema.zod · controller · dto
│   ├── persistence/            Sequelize model + repository implementation
│   ├── cache/                  Redis adapter
│   └── mappers/                row ⇄ entity
├── feature.ts                  wires it together
├── index.ts                    its routers, for src/server.ts only
└── public.ts                   what other features may import (ADR-0044)
```

One rule governs all of it: **dependencies point inward.** `domain/` imports nothing from the
outer layers. That is what makes the next section possible.

## Follow one request

Trace `POST /api/v1/metric-categories`. Open each file as you go.

**1. `infrastructure/http/router.ts`** — maps the path, attaches `authMiddleware` and the Zod
validator.

**2. `infrastructure/http/schema.zod.ts`** — the request shape. This same schema is registered
with the OpenAPI generator, so validation and documentation cannot disagree.

**3. `infrastructure/http/controller.ts`** — reads validated input via `pickValidated(req)`, pulls
`userId` and `organizationId` off `req.user`, calls the use case. No business logic here.

**4. `application/use-cases/CreateCategory.ts`** — the actual decision:

```ts
export class CreateCategory {
  constructor(
    private repo: MetricCategoryRepository, // interface
    private cache: CachePort, // interface
  ) {}

  async execute({ userId, organizationId, name, color, icon }: Input) {
    if (await this.repo.existsByName(userId, organizationId, name)) {
      throw new AppError("Category already exists", 409);
    }
    const category = await this.repo.create(userId, organizationId, {
      name,
      color,
      icon,
    });
    if (this.cache.isEnabled()) {
      await this.cache.delByPattern(
        `${METRIC_CATEGORY_CURSOR_NAMESPACE_ALL}:${userId}:*`,
      );
    }
    return category;
  }
}
```

Look at what it does **not** know. Not that the repository is Sequelize. Not that the cache is
Redis. Not that a request triggered it. Both dependencies are interfaces from `domain/` and
`application/ports/`, so this class runs in a unit test with two plain objects — no database, no
Redis, no HTTP.

Note `organizationId` in the input and in `existsByName`. Every query is tenant-scoped; that is
not optional.

**5. `infrastructure/persistence/repositories/MetricCategoryRepoSequelize.ts`** — the interface,
implemented. The only file that knows Sequelize exists.

**6. `feature.ts`** — where the halves meet:

```ts
export const buildMetricCategoryFeature = (overrides = {}) => {
  const repo = overrides.repo ?? new MetricCategoryRepoSequelize();
  const cache = overrides.cache ?? new MetricCategoryCacheRedis();
  return {
    createCategory: new CreateCategory(repo, cache),
    // …
  };
};
```

Manual dependency injection — no container, no decorators. `overrides` is the seam tests use to
inject fakes.

## Now add an endpoint

Goal: `GET /api/v1/metric-categories/count`, returning how many categories the caller has.

**1. Extend the interface** — `domain/repositories/MetricCategoryRepository.ts`:

```ts
countByUser(userId: string, organizationId: string): Promise<number>;
```

Adding it here first is the point: the domain declares what it needs, and the outer layer has to
satisfy it. TypeScript will now fail until the implementation catches up, which is the design
working.

**2. Implement it** — `infrastructure/persistence/repositories/MetricCategoryRepoSequelize.ts`.
Scope by `organizationId` as the neighbouring methods do, and respect the soft-delete
(`deletedAt: null`).

**3. Add the query** — `application/queries/CountCategories.ts`. A query reads; a use case
changes something. This one reads, so it belongs in `queries/`:

```ts
export class CountCategories {
  constructor(private repo: MetricCategoryRepository) {}
  execute({ userId, organizationId }: Input) {
    return this.repo.countByUser(userId, organizationId);
  }
}
```

**4. Wire it** — add `countCategories: new CountCategories(repo)` to `feature.ts`.

**5. Expose it** — a controller handler, then a route in `router.ts` behind `authMiddleware`.
Return through the shared response formatter so the envelope matches every other endpoint.

**6. Register it in OpenAPI** — `src/lib/openapi/openapi-docs.ts`. Skipping this makes CI fail:
`docs:openapi:check` regenerates the spec and diffs it against the committed copy.

**7. Test it** — a unit test for `CountCategories` with a stub repository, and an integration test
that hits the route. See [`../how-to/testing/`](../how-to/testing/).

**8. Verify:**

```bash
npm run lint && npm run typecheck && npm run docs:openapi:generate && npm test
```

## What you just learned

- **Where things go.** Business rule → `domain/`. Orchestration → `application/`. Anything that
  touches the network, database, or framework → `infrastructure/`.
- **Why the boundary holds.** Interfaces in, implementations out. The compiler enforces it.
- **Read vs. write.** `queries/` reads, `use-cases/` changes.
- **Tenancy is not optional.** Every repository method takes `organizationId`.
- **The spec is generated.** Add a route without registering it and CI catches you.

## Next

- [Feature-slice DDD](../explanation/architecture/feature-slice-ddd.md) — the full rules,
  including what may import across slices
- [C4 Level 3](../explanation/architecture/c4-components-auth.md) — the same anatomy on the
  largest slice
- [ADR-0022](../explanation/decisions/adr-0022-transaction-port-consolidation.md) — how
  transactions are meant to cross the boundary without leaking Sequelize (Proposed: two
  `TransactionPort`s still exist today)
