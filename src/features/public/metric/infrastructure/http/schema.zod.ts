import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  zUUID,
  zMetricName,
  zMetricCategoryId,
  zMetricDescription,
  zMetricDefaultUnit,
  zMetricIsPublic,
  zMetricOriginalId,
  zStrictBooleanQuery,
} from "@/constants/zod/zod-rules.js";
import { ZodMessages } from "@/constants/zod/zod-messages.js";

extendZodWithOpenApi(z);

const normalizedSearchParam = z
  .union([z.string(), z.undefined(), z.null()])
  .optional()
  .transform((value) => {
    if (typeof value !== "string") return undefined;
    return value.trim();
  })
  .refine(
    (value) => value === undefined || value.length > 0,
    ZodMessages.common.searchQueryMin,
  );

const filterObject = z
  .object({
    name: normalizedSearchParam,
    categoryId: zUUID.optional(),
  })
  .partial()
  .strict();

const FilterSchema = z
  .object({
    ["filter[name]"]: normalizedSearchParam.optional(),
    ["filter[categoryId]"]: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      zUUID.optional(),
    ),
    filter: filterObject.optional(),
  })
  .strict();

/** ===== Base pieces ===== */
export const metricParams = z.object({ id: zUUID });

export const metricBody = z.object({
  categoryId: zMetricCategoryId.optional(),
  originalMetricId: zMetricOriginalId.optional(),
  name: zMetricName,
  description: zMetricDescription.optional(),
  defaultUnit: zMetricDefaultUnit,
  isPublic: zMetricIsPublic,
});

const metricBodyUpdate = metricBody.extend({
  isPublic: z.boolean().optional(),
});

export const metricBodyPartial = metricBodyUpdate
  .partial()
  .strict()
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one field to update.",
        path: [],
      });
    }
  })
  .openapi({ minProperties: 1, additionalProperties: false });

export const listMetricsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z
    .enum([
      "createdAt",
      "updatedAt",
      "name",
      "logCount",
      "defaultUnit",
      "isPublic",
    ])
    .default("createdAt"),
  sortOrder: z.enum(["ASC", "DESC"]).default("DESC"),
});

const listMetricQueryRaw = z
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
        "logCount",
        "-logCount",
      ] as const)
      .default("-createdAt"),
    q: normalizedSearchParam,
    after: z
      .union([z.string(), z.undefined(), z.null()])
      .optional()
      .transform((value) => {
        if (typeof value !== "string") return undefined;
        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
      }),
    includeTotal: zStrictBooleanQuery.optional().default(false),
  })
  .merge(FilterSchema)
  .strict();

export const listMetricQueryViaCursor = listMetricQueryRaw.transform((v) => {
  const name = v["filter[name]"] ?? v.filter?.name;
  const categoryId = v["filter[categoryId]"] ?? v.filter?.categoryId;

  const filter: { name?: string; categoryId?: string } = {};
  if (name) filter.name = name;
  if (categoryId) filter.categoryId = categoryId;

  return {
    limit: v.limit,
    sort: v.sort,
    q: v.q,
    after: v.after,
    includeTotal: v.includeTotal,
    filter: Object.keys(filter).length ? filter : undefined,
  };
});

export const listMetricQueryDocSchema = listMetricQueryRaw;

const allowedIncludeTokens = new Set(["settings", "category", "logs"]);
const includeCsvPattern =
  "^(settings|category|logs)(,(settings|category|logs))*$";
const csvIncludes = z
  .string()
  .superRefine((value, ctx) => {
    const tokens = value
      .split(",")
      .map((token) => token.trim())
      .filter((token) => token.length > 0);

    if (!tokens.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "include must be 'flat' | 'full' or a CSV of: settings,category,logs",
      });
      return;
    }

    const invalid = tokens.filter((token) => !allowedIncludeTokens.has(token));
    if (invalid.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "include must be 'flat' | 'full' or a CSV of: settings,category,logs",
      });
    }
  })
  .openapi({
    example: "settings,category",
    pattern: includeCsvPattern,
  });

export const metricDetailQuery = z.object({
  include: z
    .union([z.enum(["flat", "full"]), csvIncludes])
    .optional()
    .default("flat"),
  logsLimit: z.coerce.number().int().min(1).max(200).optional().default(20),
});

/** ===== Schema Bags ===== */
export const createMetricSchema = z.object({ body: metricBody });
export const updateMetricSchema = z.object({
  params: metricParams,
  body: metricBodyPartial,
});
export const getMetricSchema = z.object({
  params: metricParams,
  query: metricDetailQuery,
});
export const deleteMetricSchema = z.object({ params: metricParams });
export const getAllMetricsSchema = z.object({ query: listMetricsQuery });
export const getAllMetricsViaCursorSchema = z.object({
  query: listMetricQueryViaCursor,
});

export const generateDummyMetricsBody = z.object({
  count: z.coerce.number().int().min(1).max(1000).default(50),
});
export const generateDummyMetricsSchema = z.object({
  body: generateDummyMetricsBody,
});

/** ===== Types ===== */
export type CreateMetricInput = z.infer<typeof metricBody>;
export type UpdateMetricInput = z.infer<typeof metricBodyPartial>;
export type GetMetricParams = z.infer<typeof metricParams>;
export type GetMetricDetailQuery = z.infer<typeof metricDetailQuery>;
export type ListMetricsQuery = z.infer<typeof listMetricsQuery>;
