import {
  api,
  authHeader,
  createCategory,
  createMetric,
  createMetricLog,
  createTestUser,
} from "../helpers/test-utils.js";

// Absolute bounds rather than `last=7d`: a relative window is anchored to the
// current bucket, so a conditional request that straddles a bucket boundary
// would compute a different range and never match its own ETag.
const RANGE = {
  start: "2025-05-01T00:00:00.000Z",
  end: "2025-05-08T00:00:00.000Z",
  bucket: "1d",
  tz: "UTC",
};

const UNKNOWN_METRIC_ID = "00000000-0000-4000-8000-000000000099";

describe("Analytics HTTP caching", () => {
  let token: string;
  let metricId: string;
  let categoryName: string;

  beforeEach(async () => {
    const auth = await createTestUser();
    token = auth.token;

    const { category, payload } = await createCategory(token);
    categoryName = payload.name;

    const { metric } = await createMetric(token, { categoryId: category.id });
    metricId = metric.id;

    // Creating a metric also creates its settings, but the dashboard only
    // lists metrics flagged for display — opt this one in so the item-shape
    // assertion has something to inspect.
    const detail = await api
      .get(`/api/v1/metrics/${metricId}`)
      .set("Authorization", authHeader(token))
      .query({ include: "full" });
    const settingsId = detail.body.data.settings.id as string;

    await api
      .patch(`/api/v1/metric-settings/${settingsId}/display`)
      .set("Authorization", authHeader(token))
      .send({
        displayOptions: {
          showOnDashboard: true,
          priority: 1,
          chartType: "line",
          color: "#E897A3",
        },
      });

    await createMetricLog(token, metricId, {
      logValue: 10,
      loggedAt: "2025-05-02T00:00:00.000Z",
    });
  });

  it("surfaces ETag and Cache-Control on the dashboard", async () => {
    const res = await api
      .get("/api/v1/analytics/dashboard")
      .set("Authorization", authHeader(token))
      .query(RANGE);

    expect(res.status).toBe(200);
    expect(res.headers.etag).toBeDefined();
    expect(res.headers["cache-control"]).toContain("private");
    expect(res.headers["cache-control"]).toContain("max-age=");
  });

  it("returns 304 for a conditional dashboard request", async () => {
    const first = await api
      .get("/api/v1/analytics/dashboard")
      .set("Authorization", authHeader(token))
      .query(RANGE);

    expect(first.status).toBe(200);

    const second = await api
      .get("/api/v1/analytics/dashboard")
      .set("Authorization", authHeader(token))
      .set("If-None-Match", first.headers.etag)
      .query(RANGE);

    expect(second.status).toBe(304);
    expect(second.text).toBe("");
    expect(second.headers.etag).toBe(first.headers.etag);
  });

  it("surfaces an ETag on a single metric visualization", async () => {
    const res = await api
      .get(`/api/v1/analytics/metrics/${metricId}`)
      .set("Authorization", authHeader(token))
      .query(RANGE);

    expect(res.status).toBe(200);
    expect(res.headers.etag).toBeDefined();
  });

  it("returns 304 for a conditional single metric request", async () => {
    const first = await api
      .get(`/api/v1/analytics/metrics/${metricId}`)
      .set("Authorization", authHeader(token))
      .query(RANGE);

    expect(first.status).toBe(200);

    const second = await api
      .get(`/api/v1/analytics/metrics/${metricId}`)
      .set("Authorization", authHeader(token))
      .set("If-None-Match", first.headers.etag)
      .query(RANGE);

    expect(second.status).toBe(304);
    expect(second.text).toBe("");

    // RFC 9110 15.4.5: a 304 must carry the same validator the 200 would have, so a
    // client can refresh its cache entry rather than treating revalidation as failed.
    expect(second.headers.etag).toBe(first.headers.etag);
    expect(second.headers["cache-control"]).toContain("private");
    expect(second.headers["cache-control"]).toBe(
      first.headers["cache-control"],
    );
  });

  it("changes the single metric ETag when the underlying data changes", async () => {
    const before = await api
      .get(`/api/v1/analytics/metrics/${metricId}`)
      .set("Authorization", authHeader(token))
      .query(RANGE);

    expect(before.status).toBe(200);

    // A second log inside the same window moves a value late in the payload while
    // leaving its opening bytes identical. The previous ETag was a base64 prefix of
    // the body covering only its first 20 bytes, so it did not move — and the
    // conditional request below was answered 304 with stale data.
    await createMetricLog(token, metricId, {
      logValue: 99,
      loggedAt: "2025-05-03T00:00:00.000Z",
    });

    const after = await api
      .get(`/api/v1/analytics/metrics/${metricId}`)
      .set("Authorization", authHeader(token))
      .query(RANGE);

    expect(after.status).toBe(200);
    expect(after.headers.etag).not.toBe(before.headers.etag);

    const revalidated = await api
      .get(`/api/v1/analytics/metrics/${metricId}`)
      .set("Authorization", authHeader(token))
      .set("If-None-Match", before.headers.etag)
      .query(RANGE);

    expect(revalidated.status).toBe(200);
  });

  it("rejects an unsupported bucket", async () => {
    const res = await api
      .get("/api/v1/analytics/dashboard")
      .set("Authorization", authHeader(token))
      .query({ bucket: "yearly", last: "30d" });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe("fail");
  });

  it("returns 404 for an unknown metric", async () => {
    const res = await api
      .get(`/api/v1/analytics/metrics/${UNKNOWN_METRIC_ID}`)
      .set("Authorization", authHeader(token))
      .query(RANGE);

    expect(res.status).toBe(404);
    expect(res.body.status).toBe("fail");
  });

  it("returns dashboard items carrying category and series", async () => {
    const res = await api
      .get("/api/v1/analytics/dashboard")
      .set("Authorization", authHeader(token))
      .query(RANGE);

    expect(res.status).toBe(200);

    const item = res.body.data.items.find(
      (candidate: { metricId: string }) => candidate.metricId === metricId,
    );

    expect(item).toBeDefined();
    expect(item.category_name).toBe(categoryName);
    expect(Array.isArray(item.series)).toBe(true);
  });
});
