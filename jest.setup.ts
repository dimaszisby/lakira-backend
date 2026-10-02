//jest.setup.ts

import { jest } from "@jest/globals";
import type { Server } from "http";
import { QueryTypes } from "sequelize";
import { setImmediate } from "timers";
import app from "./src/server.js";
import { attachClientErrorHandler } from "./src/shared/middleware/client-error.js";
import sequelize from "./src/config/db.js";
import { disconnectRedis } from "./src/utils/redis-client.js";
import request from "supertest";
import { env } from "./src/config/envManager.js";
import logger from "./src/utils/logger.js";
import { drainBackgroundTasks } from "./src/utils/background-tasks.js";

const skipDbLifecycle = process.env.SKIP_DB_LIFECYCLE === "true";
jest.setTimeout(40000);
const DRAIN_TIMEOUT_MS = 5000;

if (skipDbLifecycle) {
  logger.info(
    "[PROCESS] SKIP_DB_LIFECYCLE enabled — skipping server/DB bootstrap.",
  );
}

// Ensure Jest uses the correct test environment
if (!env.NODE_ENV) {
  throw new Error("[ERROR] NODE_ENV not set. Check your .env.test file.");
}

logger.info(`🛠 Jest running in environment: ${env.NODE_ENV}`);
logger.info(`🔗 Connected to test DB: ${env.TEST_DATABASE_URL}`);
logger.info(`DB_HOST: ${env.DB_HOST}`);
logger.info(`DB_PORT: ${env.DB_PORT}`);

// Ensure immediate functions are available in Jest
global.setImmediate = setImmediate;

let server: Server;
const workerId = Number(process.env.JEST_WORKER_ID ?? "0");
const TEST_SERVER_PORT = 4000 + workerId;

/**
 * Initialize Database & Start Test Server Before Running Tests
 */
if (!skipDbLifecycle) {
  beforeAll(async () => {
    try {
      server = app.listen(TEST_SERVER_PORT, () => {
        logger.info(
          `[PROCESS] Test server running on port ${TEST_SERVER_PORT}`,
        );
      });
      attachClientErrorHandler(server);

      await sequelize.authenticate();
      logger.info("[PROCESS] Database connection established.");
    } catch (error) {
      logger.error("[ERROR] during test setup:", error);
      throw error;
    }
  });
} else {
  beforeAll(async () => {
    await disconnectRedis();
  });
}

/**
 * Clean Up Database After Each Test (Truncate Tables)
 */
if (!skipDbLifecycle) {
  beforeEach(async () => {
    try {
      // A task still writing would deadlock with the TRUNCATE (ADR-0054).
      // Bounded, so a stuck task is named in the log instead of timing out.
      await drainBackgroundTasks(DRAIN_TIMEOUT_MS);

      logger.info("🛑 Starting raw SQL table truncation...");

      const result = (await sequelize.query(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public';",
        { type: QueryTypes.SELECT },
      )) as { tablename: string }[] | unknown;
      const tables = Array.isArray(result)
        ? (result as { tablename: string }[])
        : [];

      for (const table of tables) {
        const tableName = table.tablename;
        if (["SequelizeMeta", "SequelizeData"].includes(tableName)) {
          continue;
        }
        await sequelize.query(
          `TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE;`,
        );
      }

      logger.info("[PROCESS] Completed raw SQL table truncation.");
    } catch (error) {
      logger.error("[ERROR] during table truncation:", error);
      throw error;
    }
  });
}

/**
 * Gracefully Shut Down Server & DB Connection After Tests
 */
afterAll(async () => {
  if (skipDbLifecycle) {
    return;
  }

  try {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      logger.info("[PROCESS] Test server closed.");
    }

    await drainBackgroundTasks(DRAIN_TIMEOUT_MS);

    await sequelize.close();
    logger.info("[PROCESS] Database connection closed.");

    await disconnectRedis();
  } catch (error) {
    logger.error("[ERROR] closing connections:", error);
  }
});

// Export test request helper
export const testRequest = request(app);
