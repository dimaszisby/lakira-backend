import { describe, it, expect, jest } from "@jest/globals";
import { ListCategories } from "@/features/metric-category/application/queries/ListCategories.js";
import type { CachePort } from "@/features/metric-category/application/ports/CachePort.js";
import type { MetricCategoryRepository } from "@/features/metric-category/domain/repositories/MetricCategoryRepository.js";
import type {
  ListQuery,
  ListResult,
} from "@/features/metric-category/domain/types.js";
import type { MetricCategory } from "@/features/metric-category/domain/entities/MetricCategory.js";

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

const pageFor = (name: string): ListResult<MetricCategory> => ({
  items: [{ name } as unknown as MetricCategory],
  sort: "-createdAt",
  limit: 20,
});

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
});
