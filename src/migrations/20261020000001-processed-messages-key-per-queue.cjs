"use strict";

/**
 * Kit queue-design-hardening, D-01 (ADR-0073; audit 2026-09-29, R8).
 *
 * A message is recorded as processed per queue. Keyed on message_id alone, a second
 * queue bound to the same routing key received the same id, found it recorded and
 * skipped work it had never done. The key becomes (message_id, queue), and
 * processed_at gets the index a cleanup by age would need (register row B-41).
 *
 * down restores the single-column key, but refuses while any message_id is recorded on
 * two queues: the old key cannot hold both, and choosing which to delete is not a
 * migration's call.
 */

const TABLE = "processed_messages";
const PRIMARY_KEY = "processed_messages_pkey";
const PROCESSED_AT_INDEX = "processed_messages_processed_at_idx";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface) => {
    return queryInterface.sequelize.transaction(async (transaction) => {
      console.log(
        "[DB PROCESS] Keying processed_messages on (message_id, queue)...",
      );

      await queryInterface.removeConstraint(TABLE, PRIMARY_KEY, {
        transaction,
      });
      await queryInterface.addConstraint(TABLE, {
        fields: ["message_id", "queue"],
        type: "primary key",
        name: PRIMARY_KEY,
        transaction,
      });
      await queryInterface.addIndex(TABLE, ["processed_at"], {
        name: PROCESSED_AT_INDEX,
        transaction,
      });

      console.log("[DB PROCESS] processed_messages keyed per queue.");
    });
  },

  down: async (queryInterface) => {
    return queryInterface.sequelize.transaction(async (transaction) => {
      const [rows] = await queryInterface.sequelize.query(
        `SELECT message_id FROM ${TABLE} GROUP BY message_id HAVING COUNT(*) > 1 LIMIT 5`,
        { transaction },
      );
      const shared = /** @type {Array<{ message_id: string }>} */ (rows);
      if (shared.length > 0) {
        const count =
          shared.length === 5 ? "at least 5" : String(shared.length);
        const examples = shared.map((row) => row.message_id).join(", ");
        throw new Error(
          `[DB ERROR] Cannot key ${TABLE} on message_id alone: ${count} message id(s) ` +
            `are recorded on more than one queue, e.g. ${examples}. ` +
            "Decide which rows to keep, delete the others, then run this again.",
        );
      }

      console.log("[DB PROCESS] Keying processed_messages on message_id...");
      await queryInterface.removeIndex(TABLE, PROCESSED_AT_INDEX, {
        transaction,
      });
      await queryInterface.removeConstraint(TABLE, PRIMARY_KEY, {
        transaction,
      });
      await queryInterface.addConstraint(TABLE, {
        fields: ["message_id"],
        type: "primary key",
        name: PRIMARY_KEY,
        transaction,
      });
      console.log("[DB PROCESS] processed_messages keyed on message_id.");
    });
  },
};
