import { z } from "zod";
import {
  zUUID,
  zDateOptional,
  zGoalValue,
  zGoalValueRequired,
  zGoalType,
  zGoalTypeRequired,
  zAlertThresholds,
  zAlertThresholdsOptional,
  zDisplayOptions,
  zStrictBooleanQuery,
} from "@/constants/zod/zod-rules.js";
import { ZodMessages } from "@/constants/zod/zod-messages.js";
import {
  hasInvalidControlChars,
  hasUnpairedSurrogates,
} from "@/shared/utils/text-validation.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const settingsParams = z.object({ id: zUUID });

const timeFrameMixin = (data: {
  timeFrameEnabled?: boolean;
  startDate?: Date | null;
  deadlineDate?: Date | null;
}) =>
  data.timeFrameEnabled === true &&
  (!data.startDate ||
    !data.deadlineDate ||
    data.deadlineDate <= data.startDate);

const zDateOptionalNullable = zDateOptional
  .optional()
  .nullable()
  .openapi({
    type: ["string", "null"],
    format: "date-time",
    example: "2023-01-01T00:00:00Z",
  });

const settingsShared = z.object({
  metricId: zUUID,
  timeFrameEnabled: z.boolean().optional().default(false),
  startDate: zDateOptionalNullable,
  deadlineDate: zDateOptionalNullable,
  alertEnabled: z.boolean().optional().default(false),
  alertThresholds: zAlertThresholds.nullable(),
  displayOptions: zDisplayOptions,
});

const settingsUpdateShared = z
  .object({
    metricId: zUUID.optional(),
    timeFrameEnabled: z.boolean().optional(),
    startDate: zDateOptionalNullable,
    deadlineDate: zDateOptionalNullable,
    alertEnabled: z.boolean().optional(),
    alertThresholds: zAlertThresholdsOptional.nullable(),
    displayOptions: zDisplayOptions.optional(),
  })
  .strict();

const goalDisabledBody = settingsShared.extend({
  goalEnabled: z.literal(false).optional(),
  goalType: zGoalType.optional(),
  goalValue: zGoalValue.optional(),
});

const goalEnabledBody = settingsShared
  .extend({
    goalEnabled: z.literal(true),
    goalType: zGoalTypeRequired,
    goalValue: zGoalValueRequired,
  })
  .strict();

const rawSettingsBody = z.union([goalEnabledBody, goalDisabledBody]);

export const settingsBody = rawSettingsBody
  .superRefine((data, ctx) => {
    if (timeFrameMixin(data)) {
      if (!data.startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "startDate is required when timeFrameEnabled is true.",
          path: ["startDate"],
        });
      }
      if (!data.deadlineDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "deadlineDate is required when timeFrameEnabled is true.",
          path: ["deadlineDate"],
        });
      }
      if (
        data.startDate &&
        data.deadlineDate &&
        data.deadlineDate <= data.startDate
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "deadlineDate must be after startDate.",
          path: ["deadlineDate"],
        });
      }
    }
  })
  .transform((data) => ({
    ...data,
    goalEnabled: data.goalEnabled ?? false,
  }));

const updateGoalDisabledBody = settingsUpdateShared
  .extend({
    goalEnabled: z.literal(false).optional(),
    goalType: zGoalType.optional(),
    goalValue: zGoalValue.optional(),
  })
  .strict();

const updateGoalEnabledBody = settingsUpdateShared
  .extend({
    goalEnabled: z.literal(true),
    goalType: zGoalTypeRequired,
    goalValue: zGoalValueRequired,
  })
  .strict();

const updateSettingsBody = z.union([
  updateGoalEnabledBody,
  updateGoalDisabledBody,
]);

export const settingsBodyPartial = updateSettingsBody
  .superRefine((data, ctx) => {
    if (!Object.keys(data).length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one field to update.",
        path: [],
      });
      return;
    }
    const hasDateField =
      data.startDate !== undefined || data.deadlineDate !== undefined;
    const requiresDates =
      data.timeFrameEnabled === true ||
      (data.timeFrameEnabled === undefined && hasDateField);
    if (requiresDates) {
      if (!data.startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Include startDate when enabling time frame (timeFrameEnabled=true) in this request.",
          path: ["startDate"],
        });
      }
      if (!data.deadlineDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Include deadlineDate when enabling time frame (timeFrameEnabled=true) in this request.",
          path: ["deadlineDate"],
        });
      }
      if (
        data.startDate &&
        data.deadlineDate &&
        data.deadlineDate <= data.startDate
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "deadlineDate must be after startDate.",
          path: ["deadlineDate"],
        });
      }
    }
  })
  .openapi({
    minProperties: 1,
    description:
      "Updates must include at least one recognized field. When enabling time frames, include both startDate and deadlineDate.",
  });

const coerceBooleanString = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === "boolean") return value;
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
    return value;
  })
  .pipe(z.boolean());

const metricSettingsFilterObject = z
  .object({
    metricId: zUUID.optional(),
    isActive: coerceBooleanString.optional(),
  })
  .partial()
  .strict();

const MetricSettingsFilterSchema = z
  .object({
    ["filter[metricId]"]: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      zUUID.optional(),
    ),
    ["filter[isActive]"]: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      coerceBooleanString.optional(),
    ),
    filter: metricSettingsFilterObject.optional(),
  })
  .strict();

export const createMetricSettingsSchema = z.object({ body: settingsBody });
export const updateMetricSettingsSchema = z.object({
  params: settingsParams,
  body: settingsBodyPartial,
});

export const getMetricSettingsSchema = z.object({ params: settingsParams });
export const deleteMetricSettingsSchema = z.object({ params: settingsParams });

const metricSettingsCursorBase = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z
      .enum([
        "createdAt",
        "-createdAt",
        "updatedAt",
        "-updatedAt",
        "isActive",
        "-isActive",
      ] as const)
      .default("-createdAt"),
    q: z.preprocess(
      (v) => (typeof v === "string" ? v.trim() : v),
      z.string().min(1).optional(),
    ),
    after: z.string().optional(),
    includeTotal: zStrictBooleanQuery.optional().default(false),
  })
  .strict();

const listMetricSettingsViaCursorQuery = metricSettingsCursorBase
  .merge(MetricSettingsFilterSchema)
  .transform((value) => {
    const metricId = value["filter[metricId]"] ?? value.filter?.metricId;
    const isActive = value["filter[isActive]"] ?? value.filter?.isActive;

    const filter: { metricId?: string; isActive?: boolean } = {};
    if (metricId) filter.metricId = metricId;
    if (typeof isActive === "boolean") filter.isActive = isActive;

    return {
      limit: value.limit,
      sort: value.sort,
      q: value.q,
      after: value.after,
      includeTotal: value.includeTotal,
      filter: Object.keys(filter).length ? filter : undefined,
    };
  });

export const listMetricSettingsViaCursorSchema = z.object({
  query: listMetricSettingsViaCursorQuery,
});

const displayOptionTextPatch = z
  .string()
  .trim()
  .min(1, { message: ZodMessages.metricSettings.invalidDisplayOptions })
  .superRefine((value, ctx) => {
    if (hasInvalidControlChars(value) || hasUnpairedSurrogates(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: ZodMessages.metricSettings.invalidDisplayOptions,
      });
    }
  });

const displayOptionsPatch = z
  .object({
    showOnDashboard: z.boolean().optional(),
    priority: z.number().int().min(1).max(1000).optional(),
    chartType: displayOptionTextPatch.optional(),
    color: displayOptionTextPatch.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!Object.keys(value).length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one display option field to update.",
        path: [],
      });
    }
  });

export const updateDisplayOptionsSchema = z.object({
  params: settingsParams,
  body: z.object({
    displayOptions: displayOptionsPatch,
  }),
});

export const goalAchievementSchema = { params: settingsParams };
