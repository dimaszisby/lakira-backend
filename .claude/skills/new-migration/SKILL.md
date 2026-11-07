---
name: new-migration
description: Generate a Sequelize migration file. Use when the user needs to create a database migration, add a table, alter columns, add indexes, or change the schema.
disable-model-invocation: true
argument-hint: "[description-of-change]"
---

# Generate a Sequelize Migration

Create a new migration file in `src/migrations/`.

## Steps

1. **Generate timestamp and filename**:
   - Format: `YYYYMMDDHHMMSS-description.cjs`
   - Use current UTC time for the timestamp
   - Description in kebab-case: `create-tablename`, `add-column-to-tablename`, `add-indexes-to-tablename`

2. **Read existing migrations** in `src/migrations/` to match the naming and style conventions.

3. **Create the migration** following this template:

```javascript
"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.sequelize.transaction(async (transaction) => {
      console.log("[DB PROCESS] Description of what's happening...");

      // For new tables:
      await queryInterface.createTable(
        "table_name",
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.literal("uuid_generate_v4()"),
            primaryKey: true,
          },
          // ... columns in snake_case ...
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal("NOW()"),
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal("NOW()"),
          },
        },
        { transaction },
      );
    });
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("table_name", { transaction });
      // Clean up ENUMs if created:
      // await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_table_field";', { transaction });
    });
  },
};
```

## Critical Conventions

- **CommonJS only** (`.cjs`) — Sequelize CLI does not support ESM
- **Always wrap in transactions** — both `up` and `down`
- **Always include `down`** — must fully reverse the `up` operation
- **Column names in `snake_case`** — mapped to camelCase in domain via mappers
- **UUIDs**: `Sequelize.UUID` with `defaultValue: Sequelize.literal("uuid_generate_v4()")`
- **Timestamps**: `created_at` and `updated_at` with `Sequelize.literal("NOW()")`
- **Logging**: Use `console.log("[DB PROCESS] ...")` and `console.error("[DB ERROR] ...")`
- **ENUM cleanup**: If creating enums, drop them in `down()` with `DROP TYPE IF EXISTS`

After creating the migration, remind the user to run:

```bash
npm run migrate:development    # Apply to development DB
npm run migrate:test   # Apply to test DB
```
