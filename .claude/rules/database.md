---
paths:
  - "src/migrations/**"
  - "src/**/persistence/**"
  - "src/infrastructure/db/**"
  - "src/config/db.ts"
  - "src/config/config.cjs"
---

# Database Conventions

## ORM & Driver

Sequelize v6 with PostgreSQL. Connection configured in `src/config/db.ts`.

## Migration Files

- Location: `src/migrations/`
- Format: **CommonJS** (`.cjs`) — Sequelize CLI requires it
- Naming: `YYYYMMDDHHMMSS-description.cjs`
- Always wrap in transactions
- Always include both `up` and `down` methods
- Use `console.log("[DB PROCESS] ...")` / `console.error("[DB ERROR] ...")` for migration logging

```javascript
module.exports = {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.sequelize.transaction(async (transaction) => {
      console.log("[DB PROCESS] Creating table...");
      await queryInterface.createTable(
        "my_table",
        {
          /* columns */
        },
        { transaction },
      );
    });
  },
  down: async (queryInterface) => {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("my_table", { transaction });
    });
  },
};
```

## Model Registration

- Models defined in feature's `infrastructure/persistence/models/`
- Each feature exports `registerXModels(sequelize)` and `associateXModels(models)` from one of its
  model files (e.g. `registerAuthModels` in `shared/auth/.../models/user.sequelize.ts`); individual
  model files export their own `associateX` helpers
- All models registered in `src/infrastructure/db/models.ts` (cached singleton)
- DB column names use `snake_case`; domain properties use `camelCase`

## Repository + Mapper Pattern

```
Domain:          XRepository (interface in domain/repositories/)
Infrastructure:  XRepositorySequelize implements XRepository
Mapper:          XMapper.toDomain(sequelizeModel) / XMapper.toPersistence(domainEntity)
```

- Repositories return domain entities, never Sequelize models
- Mappers handle the `snake_case` ↔ `camelCase` translation
- Repository methods: `create()`, `findById()`, `save()`, `findByX()`, `existsX()`

## Sequelize CLI Config

- There is no `.sequelizerc`: every `migrate:*` script passes `--config src/config/config.cjs` and
  `--migrations-path src/migrations` explicitly. Running `npx sequelize-cli` by hand needs both flags
- Environment-specific connection strings: `DEVELOPMENT_DATABASE_URL`, `TEST_DATABASE_URL`, etc.
- SSL enabled for staging/production (`dialectOptions.ssl`)
