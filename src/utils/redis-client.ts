import { createClient, RedisClientType } from "redis";
import logger, { flushLogs } from "./logger.js";
import { env } from "../config/envManager.js";
import { cacheEntryName } from "./cache-entry-name.js";

/**
 * Retry budget before we stop trying to reach Redis.
 *
 * Delay per attempt is `min(retries * 50, 2000)` ms, so the total window is
 * `50 * N(N-1)/2` while under the 2000ms cap (which is only reached at attempt 40).
 * 35 attempts is therefore ~29.8s — long enough to ride out a Redis restart or a
 * cold start, short enough that a genuinely unreachable Redis surfaces promptly.
 */
const MAX_RECONNECT_RETRIES = 35;

/**
 * Set once the strategy below gives up. This is what separates "Redis hiccuped"
 * from "Redis is gone": node-redis emits `error` on *every* failed attempt, so the
 * error handler alone cannot tell the two apart.
 */
let reconnectExhausted = false;

/**
 * Returning a number schedules another attempt; returning an Error stops retrying.
 * That is node-redis v4's documented mechanism, and using it is what lets the retry
 * budget above exist at all.
 */
const reconnectStrategy = (retries: number): number | Error => {
  if (retries >= MAX_RECONNECT_RETRIES) {
    reconnectExhausted = true;
    return new Error(
      `Redis unreachable after ${MAX_RECONNECT_RETRIES} attempts (~30s)`,
    );
  }
  return Math.min(retries * 50, 2000);
};

const redisConfig = env.REDIS_URL
  ? {
      url: env.REDIS_URL,
      socket: {
        reconnectStrategy,
      },
    }
  : {
      socket: {
        host: env.REDIS_HOST || "127.0.0.1",
        port: Number(env.REDIS_PORT) || 6379,
        reconnectStrategy,
      },
      ...(env.REDIS_PASSWORD && { password: env.REDIS_PASSWORD }),
    };

// Create Redis Client
const redisClient: RedisClientType = createClient(redisConfig);

const isTestEnv = env.NODE_ENV === "test";
const redisIntegrationEnabled = env.ENABLE_REDIS_INTEGRATION;

/**
 * Redis errors are logged but are NOT fatal on their own.
 *
 * This used to `process.exit(1)` on the first error event, which meant the reconnect
 * strategy above could never run a single retry — node-redis emits `error` on every
 * failed attempt, including the first. A momentary blip killed the process. The exit
 * now waits for the retry budget to be exhausted.
 */
redisClient.on("error", (err: Error) => {
  logger.error("[REDIS - ERROR] Redis Connection Error:", err);

  if (!reconnectExhausted || isTestEnv) return;

  if (env.REDIS_REQUIRED) {
    logger.error(
      "[REDIS] Giving up: Redis is required and unreachable after the retry budget. Exiting.",
    );
    // Flush first — otherwise the line above, which is the only explanation for the
    // restart, can be lost to process.exit (ADR-0041).
    void flushLogs().then(() => process.exit(1));
    return;
  }

  logger.warn(
    "[REDIS] Redis unreachable after the retry budget; continuing without Redis (REDIS_REQUIRED=false).",
  );
});

redisClient.on("connect", () => {
  // A successful connect earns a fresh retry budget for any future outage.
  reconnectExhausted = false;
  logger.info("[REDIS] Connected to Redis");
});
redisClient.on("reconnecting", () =>
  logger.warn("[REDIS] Reconnecting to Redis..."),
);
redisClient.on("end", () => logger.warn("[REDIS] Redis connection closed."));

// Ensure connection before exporting
const connectRedis = async () => {
  try {
    const shouldConnect = !isTestEnv || redisIntegrationEnabled;

    if (shouldConnect) {
      await redisClient.connect();
      logger.info(
        `[REDIS] Redis connection established${
          redisIntegrationEnabled && isTestEnv ? " (tests opted in)" : ""
        }.`,
      );
    } else {
      logger.info("[REDIS] Skipping Redis connection in test environment.");
    }
  } catch (err) {
    // Deliberately does not exit. The initial connect rejects once the strategy gives
    // up, and the error handler above owns that decision — having both exit meant two
    // racing paths for the same failure.
    logger.error("[ERROR] Redis connection failed:", err);
    if (!env.REDIS_REQUIRED) {
      logger.warn("[REDIS] Continuing without Redis connection.");
    }
  }
};

// Graceful Shutdown Hook
const disconnectRedis = async () => {
  try {
    if (!redisClient.isOpen) {
      logger.info("[PROCESS] Redis client already closed.");
      return;
    }
    await redisClient.quit();
    logger.info("[PROCESS] Redis client disconnected.");
  } catch (error) {
    logger.error("[ERROR] closing Redis connection:", error);
  }
};

/**
 * Invalidates the Redis cache for the given key.
 * @param key - The cache key to invalidate.
 */
const invalidateCache = async (key: string) => {
  if (redisClient.isOpen) {
    await redisClient.del(key);
    logger.info(`[CACHE] invalidated ${cacheEntryName(key)}`);
  }
};

/**
 * Invalidates Redis cache keys matching a given pattern.
 * Uses SCAN to avoid blocking the server on large datasets.
 * @param pattern - The pattern to match cache keys (e.g., 'metrics:user123:*').
 */
const invalidateCacheByPattern = async (pattern: string) => {
  if (redisClient.isOpen) {
    // Named, not printed: the deleted keys hold request text.
    const name = cacheEntryName(pattern);
    let cursor = 0;
    do {
      const scanResult = await redisClient.scan(cursor, {
        MATCH: pattern,
        COUNT: 100, // Process 100 keys at a time
      });
      cursor = Number(scanResult.cursor);
      const keys = scanResult.keys;

      if (keys.length > 0) {
        await redisClient.del(keys);
        logger.info(
          `[CACHE] invalidated ${keys.length} entries matching ${name}`,
        );
      } else {
        logger.info(`[CACHE] no entries matching ${name}`);
      }
    } while (cursor !== 0);
  }
};

// Auto-connect on import
connectRedis();

export {
  redisClient,
  disconnectRedis,
  invalidateCache,
  invalidateCacheByPattern,
};
