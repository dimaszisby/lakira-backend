import { Response, NextFunction } from "express";
import { redisClient } from "@/utils/redis-client.js";
import logger from "@/utils/logger.js";
import { runInBackground } from "@/utils/background-tasks.js";
import { env } from "@/config/envManager.js";
import { AuthRequest } from "@/types/request.context.js";

export type KeyGenerator = (req: AuthRequest) => string;

export type CacheMiddlewareOptions = {
  /** Skip cache middleware in test environments (default: true) */
  disableInTest?: boolean;
};

export const cacheMiddleware =
  (
    keyGenerator: KeyGenerator,
    duration: number,
    options: CacheMiddlewareOptions = {},
  ) =>
  async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const disableInTest = options.disableInTest ?? true;
    if (disableInTest && env.NODE_ENV === "test") {
      return next();
    }

    try {
      const key = keyGenerator(req);
      const cachedData = await redisClient.get(key);

      if (cachedData) {
        logger.info(`[CACHE PROCESS] Cache HIT: ${key}`);
        res.status(200).json(JSON.parse(cachedData));
        return;
      }

      logger.info(`[CACHE PROCESS] Cache miss for key: ${key}`);

      // A hit is replayed as a 200 (above), so only a 200 may be stored. Error
      // bodies reach this wrapper too: sendError writes through res.json.
      const originalJson = res.json.bind(res);
      res.json = ((data: unknown) => {
        if (res.statusCode === 200) {
          runInBackground(
            "cache-write",
            async () => {
              await redisClient.setEx(key, duration, JSON.stringify(data));
              logger.info(
                `[CACHE] Cached response: ${key} (TTL: ${duration}s)`,
              );
            },
            { cache: key },
          );
        }

        return originalJson(data);
      }) as typeof res.json;

      next();
    } catch (error) {
      logger.error("[CACHE ERROR] Cache middleware error:", error);
      next();
    }
  };

export default cacheMiddleware;
