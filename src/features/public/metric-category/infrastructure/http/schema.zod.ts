import { z } from "zod";
import { ZodMessages } from "@/constants/zod/zod-messages.js";
import {
  zMetricCategoryName,
  zMetricCategoryColor,
  zMetricCategoryIcon,
  zStrictBooleanQuery,
} from "@/constants/zod/zod-rules.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

const normalizedSearchParam = z
  .union([z.string(), z.undefined(), z.null()])
  .transform((value) => {
    if (typeof value !== "string") return undefined;
    return value.trim();
  })
  .refine(
    (value) => value === undefined || value.length > 0,
    ZodMessages.common.searchQueryMin,
  );

// * Base
export const metricCategoryBody = z.object({
  name: zMetricCategoryName,
  color: zMetricCategoryColor,
  icon: zMetricCategoryIcon,
});

export const metricCategoryParams = z.object({
  id: z.string().uuid({ message: ZodMessages.metricCategory.invalidId }),
});

const filterObject = z
  .object({
    name: normalizedSearchParam,
  })
  .partial()
  .strict();

export const listCategoriesQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z
      .enum([
        "createdAt",
        "-createdAt",
        "updatedAt",
        "-updatedAt",
        "name",
        "-name",
        "metricCount",
        "-metricCount",
      ] as const)
      .default("-createdAt"),
    q: normalizedSearchParam,
    ["filter[name]"]: normalizedSearchParam.optional(),
    filter: filterObject.optional(),
    after: z
      .union([z.string(), z.undefined(), z.null()])
      .transform((value) =>
        typeof value === "string" && value.trim().length ? value : undefined,
      ),
    includeTotal: zStrictBooleanQuery.optional().default(false),
  })
  .strict()
  .transform((raw) => {
    const filterName = raw["filter[name]"] ?? raw.filter?.name;
    return {
      limit: raw.limit,
      sort: raw.sort,
      q: raw.q,
      filterName,
      after: raw.after,
      includeTotal: raw.includeTotal,
    };
  });

// * Schema Implementations
export const createMetricCategorySchema = z.object({
  body: metricCategoryBody,
});
export const updateMetricCategorySchema = z.object({
  params: metricCategoryParams,
  body: metricCategoryBody.partial(),
});
export const getMetricCategorySchema = z.object({
  params: metricCategoryParams,
});
export const deleteMetricCategorySchema = z.object({
  params: metricCategoryParams,
});
export const getAllMetricCategoriesSchema = z.object({
  query: listCategoriesQuery,
});

/**
 * * ===== Schemas for Testing Purposes =====
 */

export const createMetricCategoryDummyBody = z.object({
  // id: z.string().uuid({ message: ZodMessages.metricCategory.invalidId }),
  count: z.number().int().min(1).max(1000).default(5), // Default to 5, max 1000
});

export const generateDummyMetricCategoriesSchema = z.object({
  body: createMetricCategoryDummyBody,
});
