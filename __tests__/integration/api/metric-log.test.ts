import {
  api,
  authHeader,
  createMetric,
  createMetricLog,
  createTestUser,
} from "../helpers/test-utils.js";
import { models } from "@/infrastructure/db/models.js";

const UNKNOWN_LOG_ID = "00000000-0000-4000-8000-000000000077";

describe("Metric Log API", () => {
  let token: string;
  let metricId: string;

  beforeEach(async () => {
    const auth = await createTestUser();
    token = auth.token;
    const { metric } = await createMetric(token);
    metricId = metric.id;
  });

  it("creates a metric log", async () => {
    const res = await api
      .post("/api/v1/metric-logs")
      .set("Authorization", authHeader(token))
      .send({
        metricId,
        logValue: 15.5,
        type: "manual",
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("success");
    expect(res.body.data).toHaveProperty("metricId", metricId);
    expect(res.body.data.logValue).toBe(15.5);
  });

  it("lists logs via cursor with filters", async () => {
    await createMetricLog(token, metricId, { logValue: 10 });
    await createMetricLog(token, metricId, { logValue: 20 });

    const res = await api
      .get("/api/v1/metric-logs")
      .set("Authorization", authHeader(token))
      .query({
        limit: 10,
        includeTotal: true,
        "filter[metricId]": metricId,
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data).toHaveProperty("totalCount");
  });

  it("fetches a log by id with metric validation", async () => {
    const { log } = await createMetricLog(token, metricId, { logValue: 25 });
    const res = await api
      .get(`/api/v1/metric-logs/${log.id}`)
      .set("Authorization", authHeader(token))
      .query({ metricId });

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(log.id);
  });

  it("updates a metric log", async () => {
    const { log } = await createMetricLog(token, metricId);
    const res = await api
      .put(`/api/v1/metric-logs/${log.id}`)
      .set("Authorization", authHeader(token))
      .send({ logValue: 99.9 });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Log updated successfully");
    expect(res.body.data.logValue).toBe(99.9);
  });

  it("deletes a metric log", async () => {
    const { log } = await createMetricLog(token, metricId);
    const res = await api
      .delete(`/api/v1/metric-logs/${log.id}`)
      .set("Authorization", authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Log deleted successfully");
  });

  it("returns aggregated stats for a metric", async () => {
    await createMetricLog(token, metricId, { logValue: 10 });
    await createMetricLog(token, metricId, { logValue: 30 });

    const res = await api
      .get("/api/v1/metric-logs/stats")
      .set("Authorization", authHeader(token))
      .query({ metricId });

    expect(res.status).toBe(200);
    expect(res.body.data.average).toBe(20);
    expect(res.body.data.min).toBe(10);
    expect(res.body.data.max).toBe(30);
  });

  it("prevents duplicate logs for the same timestamp", async () => {
    const loggedAt = new Date().toISOString();
    await api
      .post("/api/v1/metric-logs")
      .set("Authorization", authHeader(token))
      .send({ metricId, logValue: 10, loggedAt, type: "manual" });

    const res = await api
      .post("/api/v1/metric-logs")
      .set("Authorization", authHeader(token))
      .send({ metricId, logValue: 12, loggedAt, type: "manual" });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already exists/i);
  });

  it("blocks log updates that collide on timestamps", async () => {
    const loggedAt = "2025-03-01T00:00:00.000Z";
    const { log: existing } = await createMetricLog(token, metricId, {
      loggedAt,
      logValue: 33,
    });
    const { log: toUpdate } = await createMetricLog(token, metricId, {
      logValue: 99,
    });

    const res = await api
      .put(`/api/v1/metric-logs/${toUpdate.id}`)
      .set("Authorization", authHeader(token))
      .send({ loggedAt });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already exists/i);
    const followUp = await api
      .get(`/api/v1/metric-logs/${existing.id}`)
      .set("Authorization", authHeader(token))
      .query({ metricId });
    expect(followUp.status).toBe(200);
  });

  it("blocks unauthorized creation", async () => {
    const res = await api.post("/api/v1/metric-logs").send({
      metricId,
      logValue: 5,
      type: "manual",
    });

    expect(res.status).toBe(401);
    expect(res.body.status).toBe("fail");
  });

  it("blocks unauthenticated log listing", async () => {
    const res = await api.get("/api/v1/metric-logs").query({ limit: 5 });

    expect(res.status).toBe(401);
    expect(res.body.status).toBe("fail");
  });

  it("returns 404 for an unknown log", async () => {
    const res = await api
      .get(`/api/v1/metric-logs/${UNKNOWN_LOG_ID}`)
      .set("Authorization", authHeader(token))
      .query({ metricId });

    expect(res.status).toBe(404);
    expect(res.body.status).toBe("fail");
  });

  it("validates log payloads", async () => {
    const res = await api
      .post("/api/v1/metric-logs")
      .set("Authorization", authHeader(token))
      .send({ metricId, logValue: "invalid", type: "manual" });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe("fail");
  });

  it("requires log type to be provided explicitly", async () => {
    const res = await api
      .post("/api/v1/metric-logs")
      .set("Authorization", authHeader(token))
      .send({ metricId, logValue: 5 });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe("fail");
    const errorFields = (res.body.errors ?? []).map(
      (err: { field?: string }) => err.field ?? "",
    );
    expect(errorFields.some((field: string) => field?.includes("type"))).toBe(
      true,
    );
  });

  // These run the synchronous fallback: RABBITMQ_ENABLED is false in test, so the API is
  // wired with NoopMessageQueue. The response is identical on the queued path, which is
  // why the first test asserts on rows, not just the 202. The queued path is covered by
  // __tests__/integration/features/metric-log/GenerateDummyMetricLogsQueue.integration.test.ts.
  describe("POST /api/v1/metric-logs/:metricId/dummy", () => {
    it("returns 202 with a jobId and writes the logs synchronously when the queue is disabled", async () => {
      const res = await api
        .post(`/api/v1/metric-logs/${metricId}/dummy`)
        .set("Authorization", authHeader(token))
        .send({ metricId, count: 5 });

      expect(res.status).toBe(202);
      expect(res.body.status).toBe("success");
      expect(res.body.data).toHaveProperty("jobId");
      expect(typeof res.body.data.jobId).toBe("string");
      expect(res.body.data.jobId.length).toBeGreaterThan(0);
      // No polling: the fallback writes before responding, so the rows must already exist.
      expect(await models.MetricLog.count({ where: { metricId } })).toBe(5);
    });

    it("rejects generation for a metric the user does not own", async () => {
      const other = await createTestUser();
      const { metric: otherMetric } = await createMetric(other.token);

      const res = await api
        .post(`/api/v1/metric-logs/${otherMetric.id}/dummy`)
        .set("Authorization", authHeader(token))
        .send({ metricId: otherMetric.id, count: 3 });

      expect(res.status).toBe(404);
    });

    it("rejects unauthenticated requests", async () => {
      const res = await api
        .post(`/api/v1/metric-logs/${metricId}/dummy`)
        .send({ metricId, count: 3 });

      expect(res.status).toBe(401);
    });

    it("validates count is a positive integer", async () => {
      const res = await api
        .post(`/api/v1/metric-logs/${metricId}/dummy`)
        .set("Authorization", authHeader(token))
        .send({ metricId, count: -1 });

      expect(res.status).toBe(400);
    });
  });
});
