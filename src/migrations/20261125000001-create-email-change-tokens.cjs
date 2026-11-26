"use strict";

/**
 * A pending email change (credential-changes D-02, ADR-0099). The account's
 * address changes only when the link sent to `new_email` is confirmed;
 * `old_email` is kept so the notice reaches the address the request came from.
 * `token_hash` is null until the job mints the token (D-05), and a token is
 * stored only as its SHA-256 hash (ADR-0008). One pending change per user:
 * of two racing requests, the second fails on the partial unique index rather
 * than leaving two working links (D-11).
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.sequelize.transaction(async (transaction) => {
      try {
        console.log("[DB PROCESS] Creating email_change_tokens table...");

        await queryInterface.createTable(
          { schema: "public", tableName: "email_change_tokens" },
          {
            id: {
              type: Sequelize.UUID,
              defaultValue: Sequelize.literal("uuid_generate_v4()"),
              primaryKey: true,
              allowNull: false,
            },
            user_id: {
              type: Sequelize.UUID,
              allowNull: false,
              references: {
                model: { schema: "public", tableName: "users" },
                key: "id",
              },
              onUpdate: "CASCADE",
              onDelete: "CASCADE",
            },
            new_email: {
              type: Sequelize.STRING(255),
              allowNull: false,
            },
            old_email: {
              type: Sequelize.STRING(255),
              allowNull: false,
            },
            token_hash: {
              type: Sequelize.STRING(64),
              allowNull: true,
              unique: true,
            },
            expires_at: {
              type: Sequelize.DATE,
              allowNull: false,
            },
            used_at: {
              type: Sequelize.DATE,
              allowNull: true,
            },
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

        await queryInterface.addIndex(
          { schema: "public", tableName: "email_change_tokens" },
          ["user_id", "used_at"],
          {
            name: "email_change_tokens_user_id_used_at_idx",
            transaction,
          },
        );

        await queryInterface.sequelize.query(
          'CREATE UNIQUE INDEX "uq_email_change_tokens_pending_user" ON "email_change_tokens" ("user_id") WHERE "used_at" IS NULL',
          { transaction },
        );

        console.log(
          "[DB PROCESS] email_change_tokens table created successfully.",
        );
      } catch (error) {
        console.error("[DB ERROR] creating email_change_tokens table:", error);
        throw error;
      }
    });
  },

  down: async (queryInterface) => {
    return queryInterface.sequelize.transaction(async (transaction) => {
      try {
        await queryInterface.dropTable(
          { schema: "public", tableName: "email_change_tokens" },
          { transaction },
        );
        console.log("[DB PROCESS] email_change_tokens table dropped.");
      } catch (error) {
        console.error("[DB ERROR] dropping email_change_tokens table:", error);
        throw error;
      }
    });
  },
};
