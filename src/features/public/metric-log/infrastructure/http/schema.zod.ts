import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  zDateOptional,
  zLogType,
  zPositiveFloat,
  zUUID,
  zISODateTime,
  zStrictBooleanQuery,
} from "@/constants/zod/zod-rules.js";
import { z } from "zod";
import { ZodMessages } from "@/constants/zod/zod-messages.js";
import { MAX_DUMMY_METRIC_LOGS } from "../../application/use-cases/GenerateDummyMetricLogs.js";

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

const coerceNonNegativeNumber = z.preprocess((value) => {
  if (typeof value === "number") return value;

  if (Array.isArray(value)) {
    value = value[0];
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.length) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : value;
  }

  return value;
}, z.number().min(0));

const filterObject = z
  .object({
    logValue: coerceNonNegativeNumber.optional(),
    metricId: zUUID.optional(),
  })
  .partial()
  .strict();

const FilterSchema = z
  .object({
    ["filter[logValue]"]: coerceNonNegativeNumber.optional(),
    ["filter[metricId]"]: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      zUUID.optional(),
    ),
    filter: filterObject.optional(),
  })
  .strict();

export const metricLogParams = z.object({
  id: z.string().uuid({ message: ZodMessages.metricLog.invalidId }),
});

export const metricLogBody = z.object({
  metricId: zUUID,
  type: zLogType,
  logValue: zPositiveFloat,
  loggedAt: zISODateTime.optional(),
});

export const listMetricLogsQuery = z.object({
  metricId: zUUID.optional(),
  startDate: zISODateTime.optional(),
  endDate: zISODateTime.optional(),
  sortBy: z.string().optional(),
  order: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const listMetricsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["createdAt", "updatedAt", "logValue"]).default("createdAt"),
  sortOrder: z.enum(["ASC", "DESC"]).default("DESC"),
});

const listMetricCursorBase = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z
      .enum([
        "createdAt",
        "-createdAt",
        "updatedAt",
        "-updatedAt",
        "logValue",
        "-logValue",
        "loggedAt",
        "-loggedAt",
      ] as const)
      .default("-createdAt"),
    q: normalizedSearchParam,
    after: z
      .union([z.string(), z.undefined(), z.null()])
      .transform((value) =>
        typeof value === "string" && value.trim().length ? value : undefined,
      ),
    includeTotal: zStrictBooleanQuery.optional().default(false),
  })
  .strict();

export const listMetricQueryViaCursor = listMetricCursorBase
  .merge(FilterSchema)
  .transform((v) => {
    const logValue = v["filter[logValue]"] ?? v.filter?.logValue;
    const metricId = v["filter[metricId]"] ?? v.filter?.metricId;

    const filter: { logValue?: number; metricId?: string } = {};
    if (logValue !== undefined) filter.logValue = logValue;
    if (metricId) filter.metricId = metricId;

    return {
      limit: v.limit,
      sort: v.sort,
      q: v.q,
      after: v.after,
      includeTotal: v.includeTotal,
      filter: Object.keys(filter).length ? filter : undefined,
    };
  });

export const aggregatedStatsQuery = z.object({
  metricId: zUUID.optional(),
  startDate: zDateOptional,
  endDate: zDateOptional,
});

export const createMetricLogSchema = z.object({ body: metricLogBody });
export const updateMetricLogSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: metricLogBody.partial().extend({
    loggedAt: zISODateTime.optional(),
  }),
});

export const getMetricLogByIdSchema = z.object({
  params: metricLogParams,
  query: z.object({
    metricId: zUUID,
  }),
});

export const getAllMetricLogsSchema = z.object({ query: listMetricLogsQuery });
export const listMetricLogsViaCursorSchema = z.object({
  query: listMetricQueryViaCursor,
});
export const deleteMetricLogSchema = z.object({ params: metricLogParams });
export const getAggregatedStatsSchema = z.object({
  query: aggregatedStatsQuery,
});

export const generateDummyMetricLogsBody = z.object({
  count: z.coerce.number().int().min(1).max(MAX_DUMMY_METRIC_LOGS).default(50),
});

export const generateDummyMetricLogsSchema = z.object({
  params: z.object({ metricId: zUUID }),
  body: generateDummyMetricLogsBody,
});
