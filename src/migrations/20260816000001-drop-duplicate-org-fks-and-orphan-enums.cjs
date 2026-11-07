"use strict";

// Cleanup found by introspecting a freshly migrated database while rewriting
// docs/reference/database-schema.md.
//
// 1. Every domain table carries TWO identical organization_id foreign keys:
//    `<table>_organization_id_fkey` and `<table>_organization_id_fkey1`, both
//    REFERENCES organizations(id) ON DELETE RESTRICT. 20260510000005 added the
//    column with its constraint and 20260510000006 re-added one when flipping
//    the column to NOT NULL. Harmless, but doubles FK-check work on every write.
//
// 2. Two enum types outlived their columns: enum_users_role (column dropped in
//    20260516000001) and enum_metric_log_type (superseded by the live
//    enum_metric_logs_type).
//
// Written defensively — IF EXISTS throughout — so it is a no-op on databases
// that never grew the duplicates.

const DUPLICATE_FK_TABLES = [
  "metrics",
  "metric_logs",
  "metric_settings",
  "metric_categories",
];

const ORPHANED_ENUMS = ["enum_users_role", "enum_metric_log_type"];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface) => {
    return queryInterface.sequelize.transaction(async (transaction) => {
      for (const table of DUPLICATE_FK_TABLES) {
        const constraint = `${table}_organization_id_fkey1`;
        console.log(`[DB PROCESS] Dropping duplicate FK ${constraint}...`);
        await queryInterface.sequelize.query(
          `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${constraint}";`,
          { transaction },
        );
      }

      for (const enumName of ORPHANED_ENUMS) {
        console.log(`[DB PROCESS] Dropping orphaned enum type ${enumName}...`);
        // DROP TYPE without CASCADE: if a column still uses the type this
        // errors loudly rather than silently altering a live column.
        await queryInterface.sequelize.query(
          `DROP TYPE IF EXISTS "${enumName}";`,
          { transaction },
        );
      }

      console.log("[DB PROCESS] Done.");
    });
  },

  down: async (queryInterface) => {
    return queryInterface.sequelize.transaction(async (transaction) => {
      // Restores the prior state faithfully, duplicates included, so a rollback
      // lands on exactly what the previous migration produced.
      for (const table of DUPLICATE_FK_TABLES) {
        const constraint = `${table}_organization_id_fkey1`;
        console.log(`[DB PROCESS] Restoring duplicate FK ${constraint}...`);
        await queryInterface.sequelize.query(
          `ALTER TABLE "${table}"
             ADD CONSTRAINT "${constraint}"
             FOREIGN KEY ("organization_id")
             REFERENCES "organizations" ("id")
             ON DELETE RESTRICT;`,
          { transaction },
        );
      }

      console.log("[DB PROCESS] Restoring orphaned enum types...");
      await queryInterface.sequelize.query(
        `DO $$ BEGIN
           CREATE TYPE "enum_users_role" AS ENUM ('user', 'admin');
         EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DO $$ BEGIN
           CREATE TYPE "enum_metric_log_type" AS ENUM ('manual', 'automatic');
         EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
        { transaction },
      );

      console.log("[DB PROCESS] Done.");
    });
  },
};
