import { describe, it, expect } from "@jest/globals";
import type { AuthRequest } from "@/types/request.context.js";
import {
  metricDetailCacheKey,
  metricsCursorCacheKey,
} from "@/features/metric/infrastructure/http/cache-keys.js";
import { metricEntryPattern } from "@/features/metric/application/cache.constants.js";

const USER = { id: "user-1", organizationId: "org-1" };
// What authMiddleware sets beside the user; a cursor key asserts all three
// (architecture-boundaries D-03).
const MEMBERSHIP = { id: "membership-1", role: "owner" };
const CATEGORY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CATEGORY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// The shape Express's `qs` parser gives `?filter[name]=run`: nested, never a
// flat "filter[name]" key. The old unit test fed the flat key, which is how
// R2 (docs/internal/todos/2026-09-29-todo-list-cache-key-nested-filters.md)
// shipped with a green test. Real schema, real key builder, no mocks.
const keyFor = (query: Record<string, unknown>) =>
  metricsCursorCacheKey({
    user: USER,
    organizationId: USER.organizationId,
    membership: MEMBERSHIP,
    query,
    params: {},
  } as unknown as AuthRequest);

describe("metricsCursorCacheKey", () => {
  // architecture-boundaries D-03: no key without a tenant, so never `org:_`.
  // cacheMiddleware catches the throw and skips the cache.
  it("throws for a request with no organization", () => {
    expect(() =>
      metricsCursorCacheKey({
        user: USER,
        query: {},
        params: {},
      } as unknown as AuthRequest),
    ).toThrow("User not authenticated");
  });

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

  it("is org-scoped and on cache version 4", () => {
    const key = keyFor({ filter: { name: "run" } });

    expect(key).toContain("cursor:metrics:v4:");
    expect(key).toContain(":org:org-1:");
    expect(key).toContain(":fn:run:");
  });
});

// Kit api-tooling-residuals, D-03 (audit X11/X21). The key read raw `req.params` and
// `req.query`, and spelled itself apart from the pattern its invalidation deletes.
describe("metricDetailCacheKey", () => {
  const METRIC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const OTHER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const detailKey = (overrides: Record<string, unknown>) =>
    metricDetailCacheKey({
      user: USER,
      organizationId: USER.organizationId,
      membership: MEMBERSHIP,
      params: { id: METRIC },
      query: {},
      ...overrides,
    } as unknown as AuthRequest);

  it("throws for a request with no organization", () => {
    expect(() =>
      metricDetailCacheKey({
        user: USER,
        params: { id: METRIC },
        query: {},
      } as unknown as AuthRequest),
    ).toThrow("User not authenticated");
  });

  it("is built from the validated values, not the raw ones", () => {
    const key = detailKey({
      params: { id: OTHER },
      query: { logsLimit: "999" },
      validated: {
        params: { id: METRIC },
        query: { include: "logs", logsLimit: 5 },
      },
    });
    expect(key).toContain(METRIC);
    expect(key).not.toContain(OTHER);
    expect(key).toContain(":inc:logs:ll:5");
  });

  it("gives `full` and every include named the same key", () => {
    expect(detailKey({ query: { include: "full" } })).toBe(
      detailKey({ query: { include: "settings, logs,category" } }),
    );
  });

  it("is matched by the pattern a metric write deletes", () => {
    const pattern = metricEntryPattern(USER.organizationId, USER.id, METRIC);
    const key = detailKey({ query: { include: "logs", logsLimit: "7" } });
    expect(key.startsWith(pattern.slice(0, -1))).toBe(true);
    expect(pattern.endsWith(":*")).toBe(true);
  });
});
