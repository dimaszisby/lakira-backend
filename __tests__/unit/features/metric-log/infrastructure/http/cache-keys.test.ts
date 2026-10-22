import { describe, it, expect } from "@jest/globals";
import type { AuthRequest } from "@/types/request.context.js";
import {
  metricLogCacheKey,
  metricLogStatsCacheKey,
  metricLogsCursorCacheKey,
} from "@/features/metric-log/infrastructure/http/cache-keys.js";

/**
 * Kit query-values-mean-what-they-say. Real schema, real key builder, no mocks: the
 * metric-log list key was hand-built from raw `req.query` with `.js` sentinels (D-04;
 * audit S12, R13), and the single-log key left out the metric (D-05; audit T5).
 */
const USER = { id: "user-1", organizationId: "org-1" };
// What authMiddleware sets beside the user; a cursor key asserts all three
// (architecture-boundaries D-03).
const MEMBERSHIP = { id: "membership-1", role: "owner" };
const METRIC_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const METRIC_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LOG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const listKey = (query: Record<string, unknown>) =>
  metricLogsCursorCacheKey({
    user: USER,
    organizationId: USER.organizationId,
    membership: MEMBERSHIP,
    query,
    params: {},
  } as unknown as AuthRequest);

const logKey = (metricId: string) =>
  metricLogCacheKey({
    user: USER,
    organizationId: USER.organizationId,
    membership: MEMBERSHIP,
    query: { metricId },
    params: { id: LOG },
  } as unknown as AuthRequest);

describe("metricLogsCursorCacheKey", () => {
  it("gives the flat and nested spellings of one filter the same key", () => {
    expect(listKey({ "filter[metricId]": METRIC_A })).toBe(
      listKey({ filter: { metricId: METRIC_A } }),
    );
  });

  it.each([
    ["metric", { filter: { metricId: METRIC_B } }],
    ["log value", { filter: { metricId: METRIC_A, logValue: "3" } }],
    ["search", { filter: { metricId: METRIC_A }, q: "morning" }],
    ["page size", { filter: { metricId: METRIC_A }, limit: "50" }],
    ["sort", { filter: { metricId: METRIC_A }, sort: "-logValue" }],
    ["total", { filter: { metricId: METRIC_A }, includeTotal: "true" }],
  ])("changes with the %s the repository applies", (_field, query) => {
    expect(listKey(query)).not.toBe(
      listKey({ filter: { metricId: METRIC_A } }),
    );
  });

  it("carries no codemod sentinel and is on cache version 4", () => {
    const key = listKey({});
    expect(key).not.toContain(".js");
    expect(key.startsWith("cursor:metric-logs:v4:user-1:org:org-1:")).toBe(
      true,
    );
  });

  it("keeps the metric segment the invalidation pattern looks for", () => {
    expect(listKey({ filter: { metricId: METRIC_A } })).toContain(
      `:fm:${METRIC_A}`,
    );
  });
});

describe("metricLogCacheKey", () => {
  // A 200 for the log under its own metric was replayed for another metric, which the
  // handler answers 404.
  it("names the metric the log was asked for under", () => {
    expect(logKey(METRIC_A)).not.toBe(logKey(METRIC_B));
    expect(logKey(METRIC_A)).toBe(`log:org-1:user-1:${LOG}:m:${METRIC_A}`);
  });
});

// Kit metric-log-stats-in-sql D-03: the stats key was built from raw `req.query` and left the
// range out, so a ranged request was answered from the all-time entry (audit X11, X20).
const statsKey = (query: Record<string, unknown>) =>
  metricLogStatsCacheKey({
    user: USER,
    organizationId: USER.organizationId,
    membership: MEMBERSHIP,
    query,
    params: {},
  } as unknown as AuthRequest);

describe("metricLogStatsCacheKey", () => {
  const START = "2025-01-01T00:00:00Z";
  const END = "2025-02-01T00:00:00Z";

  it("names the metric, or all, and an open range by the empty sentinel", () => {
    expect(statsKey({ metricId: METRIC_A })).toBe(
      `logStats:org-1:user-1:m:${METRIC_A}:s:_:e:_`,
    );
    expect(statsKey({})).toBe("logStats:org-1:user-1:m:all:s:_:e:_");
  });

  it("names each bound in epoch milliseconds", () => {
    expect(statsKey({ startDate: START, endDate: END })).toBe(
      `logStats:org-1:user-1:m:all:s:${Date.parse(START)}:e:${Date.parse(END)}`,
    );
  });

  it("gives two spellings of one instant the same key", () => {
    expect(statsKey({ startDate: "2025-01-01T07:00:00+07:00" })).toBe(
      statsKey({ startDate: START }),
    );
  });

  it.each([
    ["start", { startDate: START }],
    ["end", { endDate: END }],
    ["metric", { metricId: METRIC_B }],
  ])("changes with the %s", (_field, query) => {
    expect(statsKey(query)).not.toBe(statsKey({}));
  });
});
