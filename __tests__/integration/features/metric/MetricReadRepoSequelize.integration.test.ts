import { MetricReadRepoSequelize } from "@/features/metric/infrastructure/persistence/repositories/MetricReadRepoSequelize.js";
import { models } from "@/infrastructure/db/models.js";
import {
  createMetricCategoryRow,
  createMetricLogRow,
  createMetricRow,
  createUserRow,
  createMetricSettingsRow,
  truncateAllTables,
  TEST_ORG_ID,
} from "../../helpers/db-fixtures.js";

const repo = new MetricReadRepoSequelize();

describe("MetricReadRepoSequelize (integration)", () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  // Developer note: happy-path coverage ensuring pagination/filter/total wiring behaves against real data.
  it("lists metrics with pagination, filter, and total count", async () => {
    const user = await createUserRow();
    const category = await createMetricCategoryRow(user.id);
    const otherCategory = await createMetricCategoryRow(user.id);

    const firstMetric = await createMetricRow({
      userId: user.id,
      categoryId: category.id,
      name: "Push Ups",
      createdAt: new Date("2024-01-02T00:00:00Z"),
    });
    await createMetricLogRow({ metricId: firstMetric.id });

    const secondMetric = await createMetricRow({
      userId: user.id,
      categoryId: category.id,
      name: "Pull Ups",
      createdAt: new Date("2024-01-01T00:00:00Z"),
    });
    await createMetricLogRow({ metricId: secondMetric.id });
    await createMetricRow({
      userId: user.id,
      categoryId: otherCategory.id,
      name: "Sleep",
    });

    const result = await repo.listMetrics({
      userId: user.id,
      organizationId: TEST_ORG_ID,
      limit: 1,
      sort: "-createdAt",
      filter: { categoryId: category.id },
      includeTotal: true,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe("Push Ups");
    expect(result.totalCount).toBe(2);
    expect(result.nextCursor).toBeDefined();
  });

  // Developer note: happy-path detail fetch with category/settings/log relationships wired.
  it("fetches detailed metric with category, settings, and logs included", async () => {
    const user = await createUserRow();
    const category = await createMetricCategoryRow(user.id);
    const metric = await createMetricRow({
      userId: user.id,
      categoryId: category.id,
      name: "Bench Press",
    });
    await createMetricSettingsRow({
      metricId: metric.id,
      goalEnabled: true,
      goalType: "cumulative",
      goalValue: 100,
    });
    await createMetricLogRow({
      metricId: metric.id,
      logValue: 42,
      loggedAt: new Date("2024-01-01T00:00:00Z"),
    });

    const detailed = await repo.findDetailedMetric({
      userId: user.id,
      organizationId: TEST_ORG_ID,
      metricId: metric.id,
      includes: ["category", "settings", "logs"],
      logsLimit: 5,
    });

    expect(detailed).not.toBeNull();
    expect(detailed?.id).toBe(metric.id);
    expect(detailed?.category?.id).toBe(category.id);
    expect(detailed?.settings?.goalEnabled).toBe(true);
    expect(detailed?.logs).toHaveLength(1);
    expect(detailed?.logs?.[0].logValue).toBe(42);
  });

  it("continues pagination when createdAt values are identical", async () => {
    const user = await createUserRow();
    const category = await createMetricCategoryRow(user.id);
    const baseTimestamp = new Date("2024-01-05T00:00:00Z");
    const ids = [
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
      "00000000-0000-0000-0000-000000000003",
    ];
    await createMetricRow({
      id: ids[0],
      userId: user.id,
      categoryId: category.id,
      name: "Metric A",
      createdAt: baseTimestamp,
      updatedAt: baseTimestamp,
    });
    await createMetricRow({
      id: ids[1],
      userId: user.id,
      categoryId: category.id,
      name: "Metric B",
      createdAt: baseTimestamp,
      updatedAt: baseTimestamp,
    });
    await createMetricRow({
      id: ids[2],
      userId: user.id,
      categoryId: category.id,
      name: "Metric C",
      createdAt: baseTimestamp,
      updatedAt: baseTimestamp,
    });

    const firstPage = await repo.listMetrics({
      userId: user.id,
      organizationId: TEST_ORG_ID,
      limit: 2,
      sort: "-createdAt",
    });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBeDefined();

    const secondPage = await repo.listMetrics({
      userId: user.id,
      organizationId: TEST_ORG_ID,
      limit: 2,
      sort: "-createdAt",
      after: firstPage.nextCursor,
    });
    expect(secondPage.items).toHaveLength(1);
    expect(
      ["Metric A", "Metric B", "Metric C"].includes(secondPage.items[0].name),
    ).toBe(true);
  });

  it("falls back gracefully when cursor cannot be decoded", async () => {
    const user = await createUserRow();
    const metric = await createMetricRow({
      userId: user.id,
      name: "Metric cursor test",
      createdAt: new Date("2024-02-01T00:00:00Z"),
    });

    const result = await repo.listMetrics({
      userId: user.id,
      organizationId: TEST_ORG_ID,
      limit: 1,
      sort: "-createdAt",
      after: "invalid-cursor",
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe(metric.id);
  });

  it("supports name query + filter combinations", async () => {
    const user = await createUserRow();
    await createMetricRow({
      userId: user.id,
      name: "Bench Press",
    });
    await createMetricRow({
      userId: user.id,
      name: "Deadlift",
    });

    const result = await repo.listMetrics({
      userId: user.id,
      organizationId: TEST_ORG_ID,
      limit: 10,
      sort: "-createdAt",
      q: "press",
      filter: { name: "press" },
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe("Bench Press");
  });

  it("sorts by name and log count when requested", async () => {
    const user = await createUserRow();
    const metricOne = await createMetricRow({
      userId: user.id,
      name: "Alpha",
    });
    const metricTwo = await createMetricRow({
      userId: user.id,
      name: "beta",
    });
    await createMetricLogRow({ metricId: metricTwo.id });

    const byName = await repo.listMetrics({
      userId: user.id,
      organizationId: TEST_ORG_ID,
      limit: 10,
      sort: "name",
    });
    expect(byName.items.map((m) => m.name)).toEqual(["Alpha", "beta"]);

    const byLogCount = await repo.listMetrics({
      userId: user.id,
      organizationId: TEST_ORG_ID,
      limit: 10,
      sort: "-logCount",
    });
    expect(byLogCount.items[0].id).toBe(metricTwo.id);
  });

  // Kit deterministic-query-ordering, D-02. This test used to insert three logs
  // back to back and rely on `createdAt` order, which ties within a millisecond
  // and failed CI once (#124, Fork Smoke run 36695083548). It now inserts the
  // earliest-logged value last, so ordering by insert time would return it first.
  it("returns the latest logs by loggedAt, not by insert order", async () => {
    const user = await createUserRow();
    const metric = await createMetricRow({
      userId: user.id,
      name: "Rowing",
    });
    await createMetricLogRow({
      metricId: metric.id,
      logValue: 30,
      loggedAt: new Date("2024-01-03T00:00:00Z"),
    });
    await createMetricLogRow({
      metricId: metric.id,
      logValue: 20,
      loggedAt: new Date("2024-01-02T00:00:00Z"),
    });
    // Backfilled: inserted last, logged first.
    await createMetricLogRow({
      metricId: metric.id,
      logValue: 10,
      loggedAt: new Date("2024-01-01T00:00:00Z"),
    });

    const detailed = await repo.findDetailedMetric({
      userId: user.id,
      organizationId: TEST_ORG_ID,
      metricId: metric.id,
      includes: ["logs"],
      logsLimit: 2,
    });

    expect(detailed?.logs).toHaveLength(2);
    expect((detailed?.logs ?? []).map((log) => log.logValue)).toEqual([30, 20]);
  });

  it("omits soft-deleted metrics from list results", async () => {
    const user = await createUserRow();
    await createMetricRow({
      userId: user.id,
      name: "Active Metric",
    });
    await createMetricRow({
      userId: user.id,
      name: "Deleted Metric",
      deletedAt: new Date(),
    });

    const result = await repo.listMetrics({
      userId: user.id,
      organizationId: TEST_ORG_ID,
      limit: 10,
      sort: "-createdAt",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe("Active Metric");
  });
});
