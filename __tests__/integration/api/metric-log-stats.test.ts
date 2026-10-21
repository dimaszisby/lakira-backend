import { randomUUID } from "crypto";
import { QueryTypes } from "sequelize";
import sequelize from "@/config/db.js";
import { models } from "@/infrastructure/db/models.js";
import {
  api,
  authHeader,
  createMetric,
  createMetricLog,
  createTestUser,
} from "../helpers/test-utils.js";
import { createUserRow } from "../helpers/db-fixtures.js";
import { env } from "@/config/envManager.js";
import { redisClient } from "@/utils/redis-client.js";
import type { AuthRequest } from "@/types/request.context.js";
import { metricLogStatsCacheKey } from "@/features/metric-log/infrastructure/http/cache-keys.js";
import { MetricLogCacheRedis } from "@/features/metric-log/infrastructure/cache/MetricLogCacheRedis.js";

/**
 * GET /metric-logs/stats (kit metric-log-stats-in-sql; register B-79, audit 2026-10-20 X20).
 * The stats were computed in JavaScript over every row, which failed past about 150,000 logs,
 * and startDate/endDate were validated and then dropped.
 */
describe("GET /metric-logs/stats", () => {
  let token: string;
  let metricId: string;
  let organizationId: string;

  const stats = (query: Record<string, string | undefined> = {}) =>
    api
      .get("/api/v1/metric-logs/stats")
      .set("Authorization", authHeader(token))
      .query(query);

  /** Inserts `count` logs with values 1..count, one second apart from `from`. */
  const insertLogs = async (
    forMetricId: string,
    count: number,
    from = "2025-01-01T00:00:00Z",
  ) => {
    await sequelize.query(
      `INSERT INTO metric_logs (metric_id, organization_id, log_value, logged_at)
       SELECT :metricId, :organizationId, g, :from::timestamptz + g * interval '1 second'
       FROM generate_series(1, :count) AS g`,
      {
        replacements: { metricId: forMetricId, organizationId, from, count },
        type: QueryTypes.INSERT,
      },
    );
  };

  beforeEach(async () => {
    const auth = await createTestUser();
    token = auth.token;
    const { metric } = await createMetric(token);
    metricId = metric.id;
    const row = await models.Metric.findByPk(metricId);
    organizationId = row!.organizationId;
  });

  // AC-1: the dated run's reproduction.
  it("answers 200 with exact stats over 200,000 logs", async () => {
    await insertLogs(metricId, 200_000);

    for (const query of [{ metricId }, {}]) {
      const res = await stats(query);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ average: 100000.5, min: 1, max: 200000 });
    }
  }, 60_000);

  // AC-2: the range is honoured, half-open, by loggedAt.
  it("counts logs from startDate, inclusive, to endDate, exclusive", async () => {
    // Values 1..10, logged at 00:00:01 to 00:00:10.
    await insertLogs(metricId, 10);
    const at = (second: number) =>
      `2025-01-01T00:00:${String(second).padStart(2, "0")}Z`;

    const both = await stats({
      metricId,
      startDate: at(3),
      endDate: at(7),
    });
    expect(both.status).toBe(200);
    expect(both.body.data).toEqual({ average: 4.5, min: 3, max: 6 });

    const fromOnly = await stats({ metricId, startDate: at(8) });
    expect(fromOnly.body.data).toEqual({ average: 9, min: 8, max: 10 });

    const toOnly = await stats({ metricId, endDate: at(3) });
    expect(toOnly.body.data).toEqual({ average: 1.5, min: 1, max: 2 });

    // The same instant in another offset is the same bound.
    const offset = await stats({
      metricId,
      startDate: "2025-01-01T07:00:03+07:00",
      endDate: at(7),
    });
    expect(offset.body.data).toEqual({ average: 4.5, min: 3, max: 6 });

    const empty = await stats({ metricId, startDate: at(20) });
    expect(empty.body.data).toEqual({ average: 0, min: 0, max: 0 });
  });

  it("refuses a range that ends before it starts, and a datetime with no offset", async () => {
    for (const query of [
      { startDate: "2025-01-02T00:00:00Z", endDate: "2025-01-01T00:00:00Z" },
      { startDate: "2025-01-01T00:00:00Z", endDate: "2025-01-01T00:00:00Z" },
      { startDate: "2025-01-01T00:00:00" },
      { endDate: "2025-01-01" },
      { startDate: "yesterday" },
    ]) {
      const res = await stats({ metricId, ...query });
      expect({ query, status: res.status }).toEqual({ query, status: 400 });
    }
  });

  // AC-4: scoping is unchanged.
  it("counts only the caller's own logs, with and without metricId", async () => {
    await insertLogs(metricId, 3); // 1, 2, 3

    // A metric of another user in the same organization.
    const colleague = await createUserRow();
    const colleagueMetric = await models.Metric.create({
      id: randomUUID(),
      userId: colleague.id,
      organizationId,
      categoryId: null,
      name: `colleague-${randomUUID()}`,
      defaultUnit: "units",
      description: null,
      isPublic: true,
    } as any);
    await insertLogs(colleagueMetric.id, 5, "2025-02-01T00:00:00Z");

    // Another organization's user.
    const other = await createTestUser();
    const { metric: otherMetric } = await createMetric(other.token);
    await createMetricLog(other.token, otherMetric.id, { logValue: 1000 });

    expect((await stats({ metricId })).body.data).toEqual({
      average: 2,
      min: 1,
      max: 3,
    });
    expect((await stats()).body.data).toEqual({ average: 2, min: 1, max: 3 });

    const foreign = await stats({ metricId: otherMetric.id });
    expect(foreign.status).toBe(404);
    // A colleague's metric is in the organization but not the caller's: 403, as before.
    const colleagues = await stats({ metricId: colleagueMetric.id });
    expect(colleagues.status).toBe(403);
  });

  // AC-5: the range is part of the cache key, and a write clears every range. cacheMiddleware
  // is off under NODE_ENV=test, so this drives the real key builder and the real invalidation
  // against a live Redis, when the run opts in to it as VisualizationCacheRedis's test does.
  const describeRedis = env.ENABLE_REDIS_INTEGRATION ? describe : describe.skip;
  describeRedis("with the Redis cache", () => {
    const OTHER_METRIC = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const keyFor = (userId: string, query: Record<string, string>) =>
      metricLogStatsCacheKey({
        user: { id: userId, organizationId },
        query,
        params: {},
      } as unknown as AuthRequest);

    beforeAll(async () => {
      if (!redisClient.isOpen) await redisClient.connect();
    });
    beforeEach(async () => {
      await redisClient.flushDb();
    });
    afterAll(async () => {
      await redisClient.flushDb();
    });

    it("clears every cached range of the metric and of all, and nothing else", async () => {
      const userId = "stats-user";
      const range = {
        startDate: "2025-01-01T00:00:00Z",
        endDate: "2025-02-01T00:00:00Z",
      };
      const cleared = [
        keyFor(userId, { metricId }),
        keyFor(userId, { metricId, ...range }),
        keyFor(userId, { metricId, startDate: range.startDate }),
        keyFor(userId, {}),
        keyFor(userId, range),
      ];
      const kept = [
        keyFor(userId, { metricId: OTHER_METRIC }),
        keyFor(userId, { metricId: OTHER_METRIC, ...range }),
        keyFor("another-user", { metricId }),
        keyFor("another-user", {}),
      ];
      expect(new Set(cleared).size).toBe(cleared.length);
      for (const key of [...cleared, ...kept]) {
        await redisClient.set(key, "{}");
      }

      const cache = new MetricLogCacheRedis({
        invalidateByMetric: async () => {},
      });
      await cache.invalidate(userId, organizationId, metricId);

      for (const key of cleared) {
        expect({ key, cached: await redisClient.exists(key) }).toEqual({
          key,
          cached: 0,
        });
      }
      for (const key of kept) {
        expect({ key, cached: await redisClient.exists(key) }).toEqual({
          key,
          cached: 1,
        });
      }
    });
  });
});
