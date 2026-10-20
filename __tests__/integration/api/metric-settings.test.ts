import {
  api,
  authHeader,
  createMetric,
  createTestUser,
} from "../helpers/test-utils.js";

const today = () => new Date().toISOString().split("T")[0];
const tomorrow = () =>
  new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];

describe("Metric Settings API", () => {
  let token: string;
  let metricId: string;
  let baseSettingsId: string;

  beforeEach(async () => {
    const auth = await createTestUser();
    token = auth.token;
    const { metric } = await createMetric(token);
    metricId = metric.id;

    const listRes = await api
      .get("/api/v1/metric-settings")
      .set("Authorization", authHeader(token))
      .query({ "filter[metricId]": metricId });

    const firstItem = listRes.body.data.items[0];
    baseSettingsId = firstItem.id;
  });

  it("creates metric settings for a metric", async () => {
    const deleteRes = await api
      .delete(`/api/v1/metric-settings/${baseSettingsId}`)
      .set("Authorization", authHeader(token));

    expect(deleteRes.status).toBe(200);

    const res = await api
      .post("/api/v1/metric-settings")
      .set("Authorization", authHeader(token))
      .send({
        metricId,
        goalEnabled: true,
        goalType: "cumulative",
        goalValue: 50,
        timeFrameEnabled: true,
        startDate: today(),
        deadlineDate: tomorrow(),
        displayOptions: {
          showOnDashboard: true,
          priority: 2,
          chartType: "bar",
          color: "#123456",
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("success");
    expect(res.body.data.metricId).toBe(metricId);
  });

  it("lists settings via cursor", async () => {
    const res = await api
      .get("/api/v1/metric-settings")
      .set("Authorization", authHeader(token))
      .query({
        "filter[metricId]": metricId,
        includeTotal: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data).toHaveProperty("totalCount");
  });

  // query-values-mean-what-they-say D-02 (register row B-44): "false" meant true.
  it.each([
    ["false", 200, false],
    ["true", 200, true],
    ["yes", 400, false],
  ])(
    "lists with includeTotal=%s: answers %i, with a total %p",
    async (includeTotal, status, hasTotal) => {
      const res = await api
        .get("/api/v1/metric-settings")
        .set("Authorization", authHeader(token))
        .query({ "filter[metricId]": metricId, includeTotal });

      expect(res.status).toBe(status);
      if (status === 200) {
        expect("totalCount" in res.body.data).toBe(hasTotal);
      }
    },
  );

  it("retrieves settings by id", async () => {
    const res = await api
      .get(`/api/v1/metric-settings/${baseSettingsId}`)
      .set("Authorization", authHeader(token))
      .query({ metricId });

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(baseSettingsId);
  });

  it("updates metric settings", async () => {
    const res = await api
      .put(`/api/v1/metric-settings/${baseSettingsId}`)
      .set("Authorization", authHeader(token))
      .query({ metricId })
      .send({
        goalEnabled: true,
        goalType: "cumulative",
        goalValue: 100,
        alertEnabled: true,
        alertThresholds: 70,
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Metric settings updated successfully");
    expect(res.body.data.goalValue).toBe(100);
    expect(res.body.data.alertThresholds).toBe(70);
  });

  it("deletes metric settings", async () => {
    const res = await api
      .delete(`/api/v1/metric-settings/${baseSettingsId}`)
      .set("Authorization", authHeader(token))
      .query({ metricId });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Metric settings deleted successfully");
  });

  it("rejects duplicate metric settings for the same metric", async () => {
    const res = await api
      .post("/api/v1/metric-settings")
      .set("Authorization", authHeader(token))
      .send({
        metricId,
        goalEnabled: true,
        goalType: "cumulative",
        goalValue: 42,
        timeFrameEnabled: false,
        alertEnabled: false,
        displayOptions: {
          showOnDashboard: true,
          priority: 1,
          chartType: "line",
          color: "#E897A3",
        },
      });

    expect(res.status).toBe(409);
    expect(res.body.status).toBe("fail");
  });

  it("toggles goal achievement", async () => {
    const res = await api
      .patch(`/api/v1/metric-settings/${baseSettingsId}/achieve`)
      .set("Authorization", authHeader(token))
      .query({ metricId });

    expect(res.status).toBe(200);
    expect(res.body.data.isAchieved).toBe(true);
  });

  it("updates display options", async () => {
    const res = await api
      .patch(`/api/v1/metric-settings/${baseSettingsId}/display`)
      .set("Authorization", authHeader(token))
      .query({ metricId })
      .send({
        displayOptions: {
          showOnDashboard: false,
          priority: 3,
          chartType: "line",
          color: "#654321",
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      showOnDashboard: false,
      priority: 3,
      color: "#654321",
    });
  });

  it("enforces authentication", async () => {
    const res = await api.post("/api/v1/metric-settings").send({
      metricId,
      goalValue: 10,
    });

    expect(res.status).toBe(401);
    expect(res.body.status).toBe("fail");
  });

  it("blocks unauthenticated settings listing", async () => {
    const res = await api.get("/api/v1/metric-settings").query({ limit: 10 });

    expect(res.status).toBe(401);
    expect(res.body.status).toBe("fail");
  });

  it("validates payload combinations", async () => {
    const res = await api
      .post("/api/v1/metric-settings")
      .set("Authorization", authHeader(token))
      .send({
        metricId,
        goalEnabled: true,
      });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe("fail");
  });

  it("returns 404 for unknown settings", async () => {
    const unknownId = "00000000-0000-4000-8000-000000000999";
    const res = await api
      .get(`/api/v1/metric-settings/${unknownId}`)
      .set("Authorization", authHeader(token))
      .query({ metricId });

    expect(res.status).toBe(404);
    expect(res.body.status).toBe("fail");
  });
});
