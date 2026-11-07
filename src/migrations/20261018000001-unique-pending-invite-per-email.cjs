"use strict";

/**
 * Kit pending-invite-uniqueness, D-01 (ADR-0064). One unaccepted invite per
 * organization and email, case-insensitive. The index cannot test expiry, so
 * expired unaccepted invites, which can no longer be accepted, are deleted
 * first. Two live invites for one email are left for a person to resolve:
 * each was emailed and still works.
 */
const INDEX_NAME = "uq_organization_invites_pending_email";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.sequelize.transaction(async (transaction) => {
      console.log("[DB PROCESS] Deleting expired unaccepted organization invites...");
      const [{ deleted }] = /** @type {Array<{ deleted: number }>} */ (
        await queryInterface.sequelize.query(
          `WITH removed AS (
             DELETE FROM "organization_invites"
             WHERE "accepted_at" IS NULL AND "expires_at" <= NOW()
             RETURNING 1
           ) SELECT COUNT(*)::int AS deleted FROM removed`,
          { transaction, type: Sequelize.QueryTypes.SELECT },
        )
      );
      console.log(`[DB PROCESS] Deleted ${deleted} expired invite(s).`);

      const [{ collisions }] = /** @type {Array<{ collisions: number }>} */ (
        await queryInterface.sequelize.query(
        `SELECT COUNT(*)::int AS collisions FROM (
           SELECT 1 FROM "organization_invites"
           WHERE "accepted_at" IS NULL
           GROUP BY "organization_id", LOWER("email")
           HAVING COUNT(*) > 1
         ) AS groups`,
          { transaction, type: Sequelize.QueryTypes.SELECT },
        )
      );
      if (collisions > 0) {
        console.error(
          `[DB ERROR] ${collisions} organization and email pair(s) have more than one live pending invite. Remove all but one of each by hand, then run this migration again.`,
        );
        throw new Error(
          `${INDEX_NAME}: ${collisions} live duplicate pending invite group(s); nothing was changed`,
        );
      }

      console.log(`[DB PROCESS] Creating unique index ${INDEX_NAME}...`);
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX "${INDEX_NAME}" ON "organization_invites" ("organization_id", LOWER("email")) WHERE "accepted_at" IS NULL`,
        { transaction },
      );
      console.log(`[DB PROCESS] ${INDEX_NAME} created.`);
    });
  },

  down: async (queryInterface) => {
    return queryInterface.sequelize.transaction(async (transaction) => {
      console.log(`[DB PROCESS] Dropping index ${INDEX_NAME}...`);
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "${INDEX_NAME}"`, {
        transaction,
      });
      // The expired invites deleted by `up` are not restored; none could be accepted.
      console.log(`[DB PROCESS] ${INDEX_NAME} dropped.`);
    });
  },
};
