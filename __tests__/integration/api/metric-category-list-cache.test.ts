import {
  authHeader,
  createCategory,
  createTestUser,
} from "../helpers/test-utils.js";
import { appWith } from "../helpers/app-with.js";
import { buildMetricCategoryFeature } from "@/features/metric-category/feature.js";
import type { CachePort } from "@/features/metric-category/application/ports/CachePort.js";

/**
 * Kit category-list-cache-dates. Redis is off in tests, so the list cache never
 * ran here. This cache stores what Redis stores, a JSON string, so a hit returns
 * what a real hit returns. The frontend saw every repeat of a list answer 500.
 */
class JsonCache implements CachePort {
  store = new Map<string, string>();
  isEnabled = () => true;
  get = async <T>(key: string): Promise<T | null> => {
    const value = this.store.get(key);
    return value === undefined ? null : (JSON.parse(value) as T);
  };
  set = async <T>(key: string, value: T) => {
    this.store.set(key, JSON.stringify(value));
  };
  delete = async (key: string) => {
    this.store.delete(key);
  };
  /** Redis glob, `*` only, which is all the feature's patterns use. */
  delByPattern = async (pattern: string) => {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
    for (const key of [...this.store.keys()]) {
      if (re.test(key)) this.store.delete(key);
    }
  };
}

// The query the frontend's categories page sends.
const FRONTEND_QUERY = "?limit=50&sort=-createdAt&includeTotal=true";

describe("GET /metric-categories through the list cache", () => {
  let token: string;
  let cache: JsonCache;
  // An app of this test's own, whose category feature holds the cache.
  let app: ReturnType<typeof appWith>;

  const list = (query = FRONTEND_QUERY) =>
    app
      .get(`/api/v1/metric-categories${query}`)
      .set("Authorization", authHeader(token));

  // Through this app, so its cache is the one the create invalidates.
  const createThroughCache = (name: string) =>
    app
      .post("/api/v1/metric-categories")
      .set("Authorization", authHeader(token))
      .send({ name, color: "#D9D9D9", icon: "x" });

  beforeEach(async () => {
    cache = new JsonCache();
    app = appWith({ metricCategory: buildMetricCategoryFeature({ cache }) });
    ({ token } = await createTestUser());
  });

  // AC-1 and AC-2.
  it.each([
    ["the frontend's query", FRONTEND_QUERY],
    ["the default query", ""],
  ])(
    "answers a repeat of %s with the same 200, from the cache",
    async (_label, query) => {
      await createCategory(token);

      const first = await list(query);
      expect(first.status).toBe(200);
      expect(cache.store.size).toBe(1);

      const second = await list(query);
      expect(second.status).toBe(200);
      expect(second.body).toEqual(first.body);
      expect(second.body.data.items[0].createdAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T/,
      );
    },
  );

  // AC-3: an entry left by the code before the fix.
  it("treats an entry in another shape as a miss", async () => {
    await createCategory(token);
    await list();
    const [key] = [...cache.store.keys()];
    cache.store.set(
      key,
      JSON.stringify({
        items: [{ props: { id: "x", createdAt: "2026-10-17T00:00:00Z" } }],
        sort: "-createdAt",
        limit: 50,
      }),
    );

    const res = await list();

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].id).not.toBe("x");
  });

  // AC-4.
  it("shows a category created after the list was cached", async () => {
    await createCategory(token);
    expect((await list()).body.data.items).toHaveLength(1);

    expect((await createThroughCache("Second")).status).toBe(201);
    const res = await list();

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.totalCount).toBe(2);
  });
});
