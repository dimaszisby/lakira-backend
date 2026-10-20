import { describe, beforeEach, it, expect, jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import { cacheMiddleware } from "@/shared/middleware/cache.js";
import { drainBackgroundTasks } from "@/utils/background-tasks.js";
import { metricLogCacheKey } from "@/features/metric-log/infrastructure/http/cache-keys.js";
import type { AuthRequest } from "@/types/request.context.js";

/**
 * Kit query-values-mean-what-they-say, D-05 (register row B-45; audit T5). The handler
 * answers 404 for a log asked for under another metric. Keyed on the log alone, a 200
 * cached under its own metric was replayed for any other. The real middleware and key,
 * with Redis replaced by a map.
 */
jest.mock("@/config/envManager.js", () => ({
  env: { NODE_ENV: "production" },
}));

const store = new Map<string, string>();
jest.mock("@/utils/redis-client.js", () => ({
  redisClient: {
    get: async (key: string) => store.get(key) ?? null,
    setEx: async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
    },
  },
}));

jest.mock("@/utils/logger.js", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

const OWN_METRIC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_METRIC = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LOG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const app = express();
app.use((req, _res, next) => {
  (req as AuthRequest).user = {
    id: "user-1",
    organizationId: "org-1",
  } as never;
  next();
});
const handler = jest.fn((req: express.Request, res: express.Response) => {
  if (req.query.metricId === OWN_METRIC) {
    res.status(200).json({ id: LOG, metricId: OWN_METRIC });
  } else {
    res.status(404).json({ status: "fail", message: "Log not found" });
  }
});
app.get("/metric-logs/:id", cacheMiddleware(metricLogCacheKey, 300), handler);

describe("the single-log cache", () => {
  beforeEach(() => {
    store.clear();
    handler.mockClear();
  });

  it("does not replay a log's 200 for another metric", async () => {
    const own = await request(app).get(
      `/metric-logs/${LOG}?metricId=${OWN_METRIC}`,
    );
    await drainBackgroundTasks();
    expect(own.status).toBe(200);
    expect(store.size).toBe(1);

    const other = await request(app).get(
      `/metric-logs/${LOG}?metricId=${OTHER_METRIC}`,
    );

    expect(other.status).toBe(404);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("still serves the same log under the same metric from the cache", async () => {
    await request(app).get(`/metric-logs/${LOG}?metricId=${OWN_METRIC}`);
    await drainBackgroundTasks();

    const again = await request(app).get(
      `/metric-logs/${LOG}?metricId=${OWN_METRIC}`,
    );

    expect(again.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
