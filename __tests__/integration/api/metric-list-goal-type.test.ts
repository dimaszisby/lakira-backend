import {
  api,
  authHeader,
  createMetric,
  createMetricLog,
  createTestUser,
} from "../helpers/test-utils.js";

/**
 * Issue #314 (audit 2026-11-14 Y20): GET /metrics listed goalType "Not Set" for every metric.
 * The mapper read an association the list query never loaded.
 */
describe("GET /metrics lists each metric's goal type (#314)", () => {
  let token: string;

  /** The settings a metric is created with. */
  const settingsOf = async (metricId: string): Promise<string> => {
    const res = await api
      .get("/api/v1/metric-settings")
      .set("Authorization", authHeader(token))
      .query({ "filter[metricId]": metricId });
    expect(res.status).toBe(200);
    return res.body.data.items[0].id as string;
  };

  const list = (query: Record<string, string | number | boolean>) =>
    api
      .get("/api/v1/metrics")
      .set("Authorization", authHeader(token))
      .query(query);

  beforeEach(async () => {
    ({ token } = await createTestUser());
  });

  it("gives the goal type the settings hold, and Not Set where there is none", async () => {
    const { metric: withGoal } = await createMetric(token, { name: "A goal" });
    const { metric: withoutGoal } = await createMetric(token, {
      name: "B none",
    });
    const { metric: settingsGone } = await createMetric(token, {
      name: "C deleted",
    });

    // The issue's repro: settings set to a cumulative goal.
    const put = await api
      .put(`/api/v1/metric-settings/${await settingsOf(withGoal.id)}`)
      .set("Authorization", authHeader(token))
      .query({ metricId: withGoal.id })
      .send({ goalEnabled: true, goalType: "cumulative", goalValue: 10 });
    expect(put.status).toBe(200);

    const del = await api
      .delete(`/api/v1/metric-settings/${await settingsOf(settingsGone.id)}`)
      .set("Authorization", authHeader(token));
    expect(del.status).toBe(200);

    const res = await list({ limit: 5 });
    expect(res.status).toBe(200);
    const goalTypes = Object.fromEntries(
      (res.body.data.items as { id: string; goalType: string }[]).map(
        (item) => [item.id, item.goalType],
      ),
    );
    expect(goalTypes).toEqual({
      [withGoal.id]: "cumulative",
      [withoutGoal.id]: "Not Set",
      [settingsGone.id]: "Not Set",
    });
  });

  it("pages, counts logs and totals as before the settings were joined", async () => {
    const created: string[] = [];
    for (const name of ["d1", "d2", "d3"]) {
      const { metric } = await createMetric(token, { name });
      created.push(metric.id);
      await api
        .put(`/api/v1/metric-settings/${await settingsOf(metric.id)}`)
        .set("Authorization", authHeader(token))
        .query({ metricId: metric.id })
        .send({ goalEnabled: true, goalType: "incremental", goalValue: 5 });
    }
    await createMetricLog(token, created[0]!);
    await createMetricLog(token, created[0]!);

    const first = await list({ limit: 2, sort: "name", includeTotal: true });
    expect(first.status).toBe(200);
    expect(first.body.data.totalCount).toBe(3);
    const cursor = first.body.data.nextCursor as string;
    expect(cursor).toBeDefined();
    const second = await list({ limit: 2, sort: "name", after: cursor });
    expect(second.status).toBe(200);

    const items = [...first.body.data.items, ...second.body.data.items] as {
      id: string;
      name: string;
      logCount: number;
      goalType: string;
    }[];
    expect(items.map((item) => item.name)).toEqual(["d1", "d2", "d3"]);
    expect(items.map((item) => item.logCount)).toEqual([2, 0, 0]);
    expect(new Set(items.map((item) => item.goalType))).toEqual(
      new Set(["incremental"]),
    );

    // The logCount sort puts the count's subquery in the ORDER BY and the cursor's WHERE,
    // beside both joins (review L4).
    await createMetricLog(token, created[1]!);
    const byCount = await list({ limit: 2, sort: "-logCount" });
    expect(byCount.status).toBe(200);
    const rest = await list({
      limit: 2,
      sort: "-logCount",
      after: byCount.body.data.nextCursor as string,
    });
    expect(rest.status).toBe(200);
    const counted = [...byCount.body.data.items, ...rest.body.data.items] as {
      name: string;
      logCount: number;
    }[];
    expect(counted.map((item) => [item.name, item.logCount])).toEqual([
      ["d1", 2],
      ["d2", 1],
      ["d3", 0],
    ]);
  });
});
