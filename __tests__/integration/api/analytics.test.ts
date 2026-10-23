import {
  api,
  authHeader,
  createMetric,
  createMetricLog,
  createTestUser,
} from "../helpers/test-utils.js";
import { redisClient } from "@/utils/redis-client.js";
import { env } from "@/config/envManager.js";

describe("Analytics API", () => {
  let token: string;
  let metricId: string;

  beforeEach(async () => {
    const auth = await createTestUser();
    token = auth.token;
    const { metric } = await createMetric(token);
    metricId = metric.id;

    await createMetricLog(token, metricId, { logValue: 10 });
    await createMetricLog(token, metricId, { logValue: 20 });
  });

  it("returns dashboard visualization data", async () => {
    const res = await api
      .get("/api/v1/analytics/dashboard")
      .set("Authorization", authHeader(token))
      .query({ last: "7d" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.meta).toHaveProperty("range");
  });

  it("returns visualization for a specific metric", async () => {
    const res = await api
      .get(`/api/v1/analytics/metrics/${metricId}`)
      .set("Authorization", authHeader(token))
      .query({ last: "7d" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(Array.isArray(res.body.data.series)).toBe(true);
    expect(res.body.data.meta.metricId).toBe(metricId);
  });

  // Kit api-tooling-residuals, D-01 (audit X23). Intl and Postgres read an offset with
  // opposite signs, so a request's range and its buckets disagreed by twice the offset.
  it.each([
    ["+07:00", 400],
    ["-04:00", 400],
    ["Asia/Jakarta", 200],
    ["UTC", 200],
  ])("answers tz=%s with %i on both routes", async (tz, status) => {
    for (const path of [
      "/api/v1/analytics/dashboard",
      `/api/v1/analytics/metrics/${metricId}`,
    ]) {
      const res = await api
        .get(path)
        .set("Authorization", authHeader(token))
        .query({ last: "7d", tz });
      expect(res.status).toBe(status);
    }
  });

  it("requires authentication", async () => {
    const res = await api
      .get("/api/v1/analytics/dashboard")
      .query({ last: "7d" });

    expect(res.status).toBe(401);
    expect(res.body.status).toBe("fail");
  });
});

const describeRedis = env.ENABLE_REDIS_INTEGRATION ? describe : describe.skip;

describeRedis("Analytics API – Redis cache coverage", () => {
  const query = {
    start: "2025-05-01T00:00:00.000Z",
    end: "2025-05-05T00:00:00.000Z",
    bucket: "1d",
    tz: "UTC",
    fill: "zero",
  };

  beforeAll(async () => {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
  });

  beforeEach(async () => {
    if (redisClient.isOpen) {
      await redisClient.flushDb();
    }
  });

  afterAll(async () => {
    if (redisClient.isOpen) {
      await redisClient.flushDb();
    }
  });

  const listKeys = async (pattern: string) => {
    const keys: string[] = [];
    if (!redisClient.isOpen) return keys;
    for await (const key of redisClient.scanIterator({ MATCH: pattern })) {
      keys.push(key);
    }
    return keys;
  };

  it("hydrates cache and invalidates when metric logs mutate", async () => {
    const auth = await createTestUser();
    const { metric } = await createMetric(auth.token);
    await createMetricLog(auth.token, metric.id, {
      logValue: 12,
      loggedAt: "2025-05-01T00:00:00.000Z",
    });

    const firstViz = await api
      .get(`/api/v1/analytics/metrics/${metric.id}`)
      .set("Authorization", authHeader(auth.token))
      .query(query);

    expect(firstViz.status).toBe(200);
    expect(firstViz.body.data.meta.metricId).toBe(metric.id);
    const vizKeys = await listKeys(`viz:*:${auth.user.id}:${metric.id}:*`);
    expect(vizKeys.length).toBeGreaterThan(0);

    const dash = await api
      .get("/api/v1/analytics/dashboard")
      .set("Authorization", authHeader(auth.token))
      .query(query);
    expect(dash.status).toBe(200);
    const dashKeys = await listKeys(`vizdash:*:${auth.user.id}:*`);
    expect(dashKeys.length).toBeGreaterThan(0);

    await createMetricLog(auth.token, metric.id, {
      logValue: 27,
      loggedAt: "2025-05-02T00:00:00.000Z",
    });

    expect(await listKeys(`viz:*:${auth.user.id}:${metric.id}:*`)).toHaveLength(
      0,
    );
    expect(await listKeys(`vizdash:*:${auth.user.id}:*`)).toHaveLength(0);

    const refreshed = await api
      .get(`/api/v1/analytics/metrics/${metric.id}`)
      .set("Authorization", authHeader(auth.token))
      .query(query);
    expect(refreshed.status).toBe(200);
    const nonZeroPoints = refreshed.body.data.series.filter(
      (point: { value: number | null }) =>
        typeof point.value === "number" && point.value > 0,
    );
    expect(nonZeroPoints).toHaveLength(2);
    const metricValues = nonZeroPoints.map(
      (point: { value: number }) => point.value,
    );
    expect(metricValues).toEqual(expect.arrayContaining([12, 27]));
    const refreshedKeys = await listKeys(
      `viz:*:${auth.user.id}:${metric.id}:*`,
    );
    expect(refreshedKeys.length).toBeGreaterThan(0);
  });
});
