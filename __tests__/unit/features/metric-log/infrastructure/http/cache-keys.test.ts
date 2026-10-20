import { describe, it, expect } from "@jest/globals";
import type { AuthRequest } from "@/types/request.context.js";
import {
  metricLogCacheKey,
  metricLogsCursorCacheKey,
} from "@/features/metric-log/infrastructure/http/cache-keys.js";

/**
 * Kit query-values-mean-what-they-say. Real schema, real key builder, no mocks: the
 * metric-log list key was hand-built from raw `req.query` with `.js` sentinels (D-04;
 * audit S12, R13), and the single-log key left out the metric (D-05; audit T5).
 */
const USER = { id: "user-1", organizationId: "org-1" };
const METRIC_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const METRIC_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LOG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const listKey = (query: Record<string, unknown>) =>
  metricLogsCursorCacheKey({
    user: USER,
    query,
    params: {},
  } as unknown as AuthRequest);

const logKey = (metricId: string) =>
  metricLogCacheKey({
    user: USER,
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
