import { TrendRepoSequelize } from "@/features/analytics/infrastructure/persistence/TrendRepoSequelize.js";
import {
  createMetricLogRow,
  createMetricRow,
  createUserRow,
  truncateAllTables,
  TEST_ORG_ID,
} from "../../helpers/db-fixtures.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

const repo = new TrendRepoSequelize();

/**
 * Kit deterministic-query-ordering, D-02. A trend is about when a value was
 * logged, not when its row was inserted. Every log here is inserted "now", so
 * any query on `createdAt` puts them all at the same instant, inside the window.
 */
describe("TrendRepoSequelize (integration)", () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  it("orders and dates points by loggedAt, including backfilled logs", async () => {
    const user = await createUserRow();
    const metric = await createMetricRow({ userId: user.id, name: "Weight" });
    const recent = daysAgo(1);
    const backfilled = daysAgo(5);
    await createMetricLogRow({
      metricId: metric.id,
      logValue: 71,
      loggedAt: recent,
    });
    // Inserted after the recent one, logged before it.
    await createMetricLogRow({
      metricId: metric.id,
      logValue: 72,
      loggedAt: backfilled,
    });

    const points = await repo.findTrendPoints({
      metricId: metric.id,
      organizationId: TEST_ORG_ID,
      since: daysAgo(30),
    });

    expect(points).toEqual([
      { date: backfilled, value: 72 },
      { date: recent, value: 71 },
    ]);
  });

  it("excludes a log logged before the window, however recently inserted", async () => {
    const user = await createUserRow();
    const metric = await createMetricRow({ userId: user.id, name: "Weight" });
    await createMetricLogRow({
      metricId: metric.id,
      logValue: 80,
      loggedAt: daysAgo(40),
    });

    const points = await repo.findTrendPoints({
      metricId: metric.id,
      organizationId: TEST_ORG_ID,
      since: daysAgo(30),
    });

    expect(points).toEqual([]);
  });
});
