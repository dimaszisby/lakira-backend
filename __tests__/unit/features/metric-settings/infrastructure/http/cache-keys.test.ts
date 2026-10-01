import { describe, it, expect } from "@jest/globals";
import type { AuthRequest } from "@/types/request.context.js";
import { metricSettingsCursorCacheKey } from "@/features/metric-settings/infrastructure/http/cache-keys.js";

const USER = { id: "user-1", organizationId: "org-1" };
const METRIC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

// Nested, as Express's `qs` parser gives `?filter[isActive]=true`. Real schema,
// real key builder. Kit list-cache-key-filters, D-04: the key used to omit
// filter.isActive and q, both of which the repository applies.
const keyFor = (query: Record<string, unknown>) =>
  metricSettingsCursorCacheKey({
    user: USER,
    query,
    params: {},
  } as unknown as AuthRequest);

describe("metricSettingsCursorCacheKey", () => {
  it("gives different isActive filters different keys", () => {
    expect(keyFor({ filter: { isActive: "true" } })).not.toBe(
      keyFor({ filter: { isActive: "false" } }),
    );
  });

  it("gives different searches different keys", () => {
    expect(keyFor({ q: "goal" })).not.toBe(keyFor({ q: "alert" }));
  });

  it("gives the flat and nested spellings of one filter the same key", () => {
    expect(keyFor({ "filter[metricId]": METRIC })).toBe(
      keyFor({ filter: { metricId: METRIC } }),
    );
  });

  it("is org-scoped and on cache version 3", () => {
    const key = keyFor({ filter: { metricId: METRIC } });

    expect(key).toContain("cursor:metric-settings:v3:");
    expect(key).toContain(":org:org-1:");
    expect(key).toContain(`:fm:${METRIC}:`);
  });
});
