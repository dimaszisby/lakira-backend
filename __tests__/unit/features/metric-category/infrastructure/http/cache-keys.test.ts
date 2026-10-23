import { describe, it, expect, jest } from "@jest/globals";
import type { AuthRequest } from "@/types/request.context.js";
import { categoryCacheKey } from "@/features/metric-category/infrastructure/http/cache-keys.js";
import { UpdateCategory } from "@/features/metric-category/application/use-cases/UpdateCategory.js";
import { DeleteCategory } from "@/features/metric-category/application/use-cases/DeleteCategory.js";
import { MetricCategory } from "@/features/metric-category/domain/entities/MetricCategory.js";

// Kit api-tooling-residuals, D-03 (audit X11/X21, register row B-90). The route
// cached `category:<org>:<user>:<id>` and both writes deleted
// `category:<user>:<id>`, so an updated or deleted category was served from the
// cache for its 600 s.
const USER = { id: "user-1", organizationId: "org-1" };
const MEMBERSHIP = { id: "membership-1", role: "owner" };
const CATEGORY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const request = (overrides: Record<string, unknown>) =>
  ({
    user: USER,
    organizationId: USER.organizationId,
    membership: MEMBERSHIP,
    params: { id: CATEGORY },
    query: {},
    ...overrides,
  }) as unknown as AuthRequest;

// A Redis pattern's `*` against a key, as SCAN MATCH reads it.
const matches = (pattern: string, key: string) =>
  new RegExp(
    `^${pattern
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*")}$`,
  ).test(key);

const makeDeps = () => {
  const category = MetricCategory.fromProps({
    id: CATEGORY,
    userId: USER.id,
    name: "Wellness",
    color: "#fff000",
    icon: "x",
    createdAt: new Date(),
    updatedAt: new Date(),
    metricCount: 0,
    deletedAt: null,
  });
  const repo = {
    findById: jest.fn(async () => category),
    existsByName: jest.fn(async () => false),
    update: jest.fn(async () => category),
    delete: jest.fn(async () => undefined),
  };
  const deleted: string[] = [];
  const cache = {
    isEnabled: () => true,
    get: jest.fn(async () => null),
    set: jest.fn(async () => undefined),
    delete: jest.fn(async (key: string) => {
      deleted.push(key);
    }),
    delByPattern: jest.fn(async (pattern: string) => {
      deleted.push(pattern);
    }),
  };
  return { repo, cache, deleted };
};

describe("categoryCacheKey", () => {
  it("throws for a request with no organization", () => {
    expect(() =>
      categoryCacheKey({
        user: USER,
        params: { id: CATEGORY },
        query: {},
      } as unknown as AuthRequest),
    ).toThrow("User not authenticated");
  });

  it("is built from the validated id, not the raw one", () => {
    const key = categoryCacheKey(
      request({
        params: { id: OTHER },
        validated: { params: { id: CATEGORY } },
      }),
    );
    expect(key).toContain(CATEGORY);
    expect(key).not.toContain(OTHER);
  });
});

describe("a category write clears the key its GET writes", () => {
  const routeKey = () => categoryCacheKey(request({}));

  it("on update", async () => {
    const { repo, cache, deleted } = makeDeps();
    await new UpdateCategory(repo as never, cache as never).execute({
      userId: USER.id,
      organizationId: USER.organizationId,
      categoryId: CATEGORY,
      color: "#000000",
    });
    expect(deleted.some((pattern) => matches(pattern, routeKey()))).toBe(true);
  });

  it("on delete", async () => {
    const { repo, cache, deleted } = makeDeps();
    await new DeleteCategory(repo as never, cache as never).execute(
      USER.id,
      USER.organizationId,
      CATEGORY,
    );
    expect(deleted.some((pattern) => matches(pattern, routeKey()))).toBe(true);
  });
});
