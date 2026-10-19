import { describe, it, expect, jest } from "@jest/globals";
import { ListCategories } from "@/features/metric-category/application/queries/ListCategories.js";
import type { CachePort } from "@/features/metric-category/application/ports/CachePort.js";
import type { MetricCategoryRepository } from "@/features/metric-category/domain/repositories/MetricCategoryRepository.js";
import type {
  ListQuery,
  ListResult,
} from "@/features/metric-category/domain/types.js";
import { MetricCategory } from "@/features/metric-category/domain/entities/MetricCategory.js";

// After kit list-cache-key-filters (D-02) this is the only cache layer on
// GET /metric-categories; the router-level one keyed on raw req.query and
// ignored the name filter. This guards that the remaining layer keys on it.
// It passes on the code before that change too: this layer was always right.
class MapCache implements CachePort {
  store = new Map<string, unknown>();
  isEnabled = () => true;
  get = async (key: string) => this.store.get(key) ?? null;
  set = async (key: string, value: unknown) => {
    this.store.set(key, value);
  };
  delete = async (key: string) => {
    this.store.delete(key);
  };
  delByPattern = async () => {};
}

const CREATED = new Date("2026-10-17T08:00:00.000Z");
const UPDATED = new Date("2026-10-18T09:30:00.000Z");

const category = (name: string) =>
  MetricCategory.fromProps({
    id: `cat-${name}`,
    userId: "user-1",
    name,
    color: "#E897A3",
    icon: "x",
    createdAt: CREATED,
    updatedAt: UPDATED,
    deletedAt: null,
    metricCount: 3,
  });

const pageFor = (name: string): ListResult<MetricCategory> => ({
  items: [category(name)],
  sort: "-createdAt",
  limit: 20,
});

/** Stores what Redis stores, a JSON string (category-list-cache-dates). */
class JsonCache extends MapCache {
  get = async (key: string) => {
    const value = this.store.get(key) as string | undefined;
    return value === undefined ? null : JSON.parse(value);
  };
  set = async (key: string, value: unknown) => {
    this.store.set(key, JSON.stringify(value));
  };
}

const query = (name?: string): ListQuery => ({
  userId: "user-1",
  organizationId: "org-1",
  limit: 20,
  sort: "-createdAt",
  filter: name ? { name } : undefined,
});

describe("ListCategories cache", () => {
  it("does not serve one name filter's page for another", async () => {
    const cache = new MapCache();
    const list = jest.fn(async (q: ListQuery) =>
      pageFor(q.filter?.name ?? "all"),
    );
    const useCase = new ListCategories(
      { list } as unknown as MetricCategoryRepository,
      cache,
    );

    const run = await useCase.execute(query("run"));
    const swim = await useCase.execute(query("swim"));

    expect(run.items[0]).toMatchObject({ name: "run" });
    expect(swim.items[0]).toMatchObject({ name: "swim" });
    expect(cache.store.size).toBe(2);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("serves a repeated filter from the cache", async () => {
    const cache = new MapCache();
    const list = jest.fn(async (q: ListQuery) =>
      pageFor(q.filter?.name ?? "all"),
    );
    const useCase = new ListCategories(
      { list } as unknown as MetricCategoryRepository,
      cache,
    );

    await useCase.execute(query("run"));
    await useCase.execute(query("run"));

    expect(list).toHaveBeenCalledTimes(1);
  });

  // category-list-cache-dates D-01: a hit was the entity's JSON, with no
  // getters, and the mapper threw on createdAt.
  it("rebuilds entities, with their dates, from what Redis returns", async () => {
    const cache = new JsonCache();
    const list = jest.fn(async () => pageFor("run"));
    const useCase = new ListCategories(
      { list } as unknown as MetricCategoryRepository,
      cache,
    );

    await useCase.execute(query());
    const hit = await useCase.execute(query());

    expect(list).toHaveBeenCalledTimes(1);
    const [item] = hit.items;
    expect(item).toBeInstanceOf(MetricCategory);
    expect(item.createdAt).toEqual(CREATED);
    expect(item.updatedAt).toEqual(UPDATED);
    expect(item.deletedAt).toBeNull();
    expect(item).toMatchObject({ id: "cat-run", name: "run", metricCount: 3 });
    expect(hit.sort).toBe("-createdAt");
  });

  it.each([
    ["an entity's own JSON", { items: [{ props: { id: "x" } }] }],
    ["a date that does not parse", { items: [{ createdAt: "soon" }] }],
    ["no items", { sort: "-createdAt" }],
  ])("treats a cached entry holding %s as a miss", async (_label, entry) => {
    const cache = new JsonCache();
    const list = jest.fn(async () => pageFor("run"));
    const useCase = new ListCategories(
      { list } as unknown as MetricCategoryRepository,
      cache,
    );
    await useCase.execute(query());
    const [key] = [...cache.store.keys()];
    cache.store.set(key, JSON.stringify(entry));

    const page = await useCase.execute(query());

    expect(list).toHaveBeenCalledTimes(2);
    expect(page.items[0].name).toBe("run");
  });
});
