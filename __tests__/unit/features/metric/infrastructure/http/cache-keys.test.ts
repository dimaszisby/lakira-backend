import { describe, it, expect } from "@jest/globals";
import type { AuthRequest } from "@/types/request.context.js";
import { metricsCursorCacheKey } from "@/features/metric/infrastructure/http/cache-keys.js";

const USER = { id: "user-1", organizationId: "org-1" };
const CATEGORY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CATEGORY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// The shape Express's `qs` parser gives `?filter[name]=run`: nested, never a
// flat "filter[name]" key. The old unit test fed the flat key, which is how
// R2 (docs/internal/todos/2026-09-29-todo-list-cache-key-nested-filters.md)
// shipped with a green test. Real schema, real key builder, no mocks.
const keyFor = (query: Record<string, unknown>) =>
  metricsCursorCacheKey({
    user: USER,
    query,
    params: {},
  } as unknown as AuthRequest);

describe("metricsCursorCacheKey", () => {
  it("gives different name filters different keys", () => {
    expect(keyFor({ filter: { name: "run" } })).not.toBe(
      keyFor({ filter: { name: "swim" } }),
    );
  });

  it("gives different category filters different keys", () => {
    expect(keyFor({ filter: { categoryId: CATEGORY_A } })).not.toBe(
      keyFor({ filter: { categoryId: CATEGORY_B } }),
    );
  });

  it("gives the flat and nested spellings of one filter the same key", () => {
    expect(keyFor({ "filter[name]": "run" })).toBe(
      keyFor({ filter: { name: "run" } }),
    );
  });

  it("is org-scoped and on cache version 3", () => {
    const key = keyFor({ filter: { name: "run" } });

    expect(key).toContain("cursor:metrics:v3:");
    expect(key).toContain(":org:org-1:");
    expect(key).toContain(":fn:run:");
  });
});
