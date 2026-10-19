import { MetricCategoryRepository } from "../../domain/repositories/MetricCategoryRepository.js";
import { ListQuery, ListResult } from "../../domain/types.js";
import { CachePort } from "../ports/CachePort.js";
import { MetricCategory } from "../../domain/entities/MetricCategory.js";
import { buildCursorCacheKey } from "@/shared/cache/keys.js";
import {
  METRIC_CATEGORY_CURSOR_FEATURE,
  METRIC_CATEGORY_CURSOR_VERSION,
} from "../cache.constants.js";

/** A category as the cache stores it: plain fields, dates as ISO strings. */
type CachedCategory = {
  id: string;
  userId: string;
  name: string;
  color: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  metricCount: number;
};

type CachedPage = Omit<ListResult<MetricCategory>, "items"> & {
  items: CachedCategory[];
};

export class ListCategories {
  constructor(
    private repo: MetricCategoryRepository,
    private cache: CachePort,
  ) {}

  async execute(q: ListQuery): Promise<ListResult<MetricCategory>> {
    const key = buildCursorCacheKey({
      feature: METRIC_CATEGORY_CURSOR_FEATURE,
      version: METRIC_CATEGORY_CURSOR_VERSION,
      userId: q.userId,
      organizationId: q.organizationId,
      segments: [
        ["l", q.limit],
        ["s", q.sort],
        ["q", q.q ?? ""],
        ["fn", q.filter?.name ?? ""],
        ["after", q.after ?? ""],
        ["it", q.includeTotal ?? false],
      ],
    });
    if (this.cache.isEnabled()) {
      const cached = fromCache(await this.cache.get(key));
      if (cached) return cached;
    }
    const page = await this.repo.list(q);
    if (this.cache.isEnabled()) await this.cache.set(key, toCache(page), 300);
    return page;
  }
}

// An entity keeps its fields in a private `props` and serializes as that, so
// the cache holds a snapshot and a hit is rebuilt into entities
// (category-list-cache-dates D-01).
const toCache = (page: ListResult<MetricCategory>): CachedPage => ({
  ...page,
  items: page.items.map((c) => ({
    id: c.id,
    userId: c.userId,
    name: c.name,
    color: c.color,
    icon: c.icon,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
    metricCount: c.metricCount,
  })),
});

/** Anything that is not a snapshot is a miss; the next read overwrites it. */
const fromCache = (value: unknown): ListResult<MetricCategory> | null => {
  const page = value as Partial<CachedPage> | null;
  if (!page || !Array.isArray(page.items)) return null;
  if (!page.items.every(isCachedCategory)) return null;
  return {
    ...(page as CachedPage),
    items: page.items.map((c) =>
      MetricCategory.fromProps({
        ...c,
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.updatedAt),
        deletedAt: c.deletedAt ? new Date(c.deletedAt) : null,
      }),
    ),
  };
};

const isDateString = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));

const isCachedCategory = (value: unknown): value is CachedCategory => {
  const c = value as Partial<CachedCategory> | null;
  return (
    !!c &&
    typeof c.id === "string" &&
    typeof c.userId === "string" &&
    typeof c.name === "string" &&
    typeof c.color === "string" &&
    typeof c.icon === "string" &&
    isDateString(c.createdAt) &&
    isDateString(c.updatedAt) &&
    (c.deletedAt === null || isDateString(c.deletedAt)) &&
    typeof c.metricCount === "number"
  );
};
