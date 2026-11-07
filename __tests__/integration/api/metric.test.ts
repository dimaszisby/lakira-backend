import {
  api,
  authHeader,
  createCategory,
  createMetric,
  createMetricLog,
  createTestUser,
} from "../helpers/test-utils.js";

const UNKNOWN_METRIC_ID = "00000000-0000-4000-8000-000000000088";

describe("Metric API", () => {
  let token: string;
  let categoryId: string;

  beforeEach(async () => {
    const auth = await createTestUser();
    token = auth.token;
    const { category } = await createCategory(token);
    categoryId = category.id;
  });

  it("creates a metric with required fields", async () => {
    const res = await api
      .post("/api/v1/metrics")
      .set("Authorization", authHeader(token))
      .send({
        name: "Weight",
        defaultUnit: "kg",
        isPublic: true,
        categoryId,
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("success");
    expect(res.body.data).toMatchObject({
      name: "Weight",
      defaultUnit: "kg",
      isPublic: true,
      categoryId,
    });
  });

  it("lists metrics via cursor", async () => {
    await createMetric(token, { name: "Bench Press", categoryId });
    await createMetric(token, { name: "Deadlift", categoryId });

    const res = await api
      .get("/api/v1/metrics")
      .set("Authorization", authHeader(token))
      .query({
        limit: 5,
        includeTotal: true,
        "filter[name]": "Bench",
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].name).toContain("Bench");
    expect(res.body.data.totalCount).toBe(1);
  });

  it("fetches metric details with related data", async () => {
    const { metric } = await createMetric(token, { categoryId });
    await createMetricLog(token, metric.id, { logValue: 42 });
    await createMetricLog(token, metric.id, { logValue: 21 });

    const res = await api
      .get(`/api/v1/metrics/${metric.id}`)
      .set("Authorization", authHeader(token))
      .query({ include: "full", logsLimit: 1 });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("settings");
    expect(res.body.data).toHaveProperty("category");
    expect(res.body.data.logs).toHaveLength(1);
  });

  it("updates a metric", async () => {
    const { metric } = await createMetric(token, { name: "Tempo Squat" });
    const res = await api
      .put(`/api/v1/metrics/${metric.id}`)
      .set("Authorization", authHeader(token))
      .send({ name: "Paused Squat", description: "Controlled eccentric" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Metric updated successfully");
    expect(res.body.data.name).toBe("Paused Squat");
    expect(res.body.data.description).toBe("Controlled eccentric");
  });

  it("deletes a metric", async () => {
    const { metric } = await createMetric(token);
    const res = await api
      .delete(`/api/v1/metrics/${metric.id}`)
      .set("Authorization", authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Metric deleted successfully");
  });

  it("rejects metrics that reference unknown categories", async () => {
    const res = await api
      .post("/api/v1/metrics")
      .set("Authorization", authHeader(token))
      .send({
        name: "Bad Category",
        defaultUnit: "cm",
        isPublic: false,
        categoryId: "00000000-0000-4000-8000-000000000999",
      });

    expect(res.status).toBe(404);
    expect(res.body.status).toBe("fail");
  });

  it("blocks unauthenticated metric creation", async () => {
    const res = await api.post("/api/v1/metrics").send({
      name: "Unauthorized",
      defaultUnit: "kg",
      isPublic: false,
    });

    expect(res.status).toBe(401);
    expect(res.body.status).toBe("fail");
  });

  it("blocks unauthenticated metric listing", async () => {
    const res = await api.get("/api/v1/metrics").query({ limit: 5 });

    expect(res.status).toBe(401);
    expect(res.body.status).toBe("fail");
  });

  it("rejects metric creation without a name", async () => {
    const res = await api
      .post("/api/v1/metrics")
      .set("Authorization", authHeader(token))
      .send({ defaultUnit: "kg", isPublic: false, categoryId });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe("fail");
  });

  it("returns 404 for an unknown metric", async () => {
    const res = await api
      .get(`/api/v1/metrics/${UNKNOWN_METRIC_ID}`)
      .set("Authorization", authHeader(token));

    expect(res.status).toBe(404);
    expect(res.body.status).toBe("fail");
  });

  it("searches metrics by query string", async () => {
    await createMetric(token, { name: "Front Squat" });
    await createMetric(token, { name: "Back Squat" });

    const res = await api
      .get("/api/v1/metrics")
      .set("Authorization", authHeader(token))
      .query({ q: "Front" });

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].name).toBe("Front Squat");
  });

  it("returns trends for a metric", async () => {
    const { metric } = await createMetric(token, { categoryId });
    await createMetricLog(token, metric.id, { logValue: 55 });

    const res = await api
      .get(`/api/v1/metrics/${metric.id}/trends`)
      .set("Authorization", authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0]).toHaveProperty("value");
  });
});
