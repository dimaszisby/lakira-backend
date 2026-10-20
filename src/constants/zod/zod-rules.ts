import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { ZodMessages } from "@/constants/zod/zod-messages.js"; // centralized error messages
import {
  METRIC_DESCRIPTION_RULE,
  METRIC_LOG_VALUE_RULE,
  METRIC_NAME_RULE,
  METRIC_UNIT_RULE,
} from "@/shared/constants/metric-constraints.js";
import {
  getUnicodeLength,
  hasInvalidControlChars,
  hasUnpairedSurrogates,
} from "@/shared/utils/text-validation.js";

extendZodWithOpenApi(z);

/**
 * Reusable Zod Field Validations
 * - These base validators can be composed into full schemas
 */

// Reuse base rules
const UUID_PATTERN =
  "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$";
const UUID_REGEX = new RegExp(UUID_PATTERN);

export const zUUID = z
  .string()
  .uuid({ message: ZodMessages.common.invalidUUID })
  .regex(UUID_REGEX, { message: ZodMessages.common.invalidUUID })
  .openapi({ format: "uuid", pattern: UUID_PATTERN });
export const zDateOptional = z
  .preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.coerce.date().optional(),
  )
  .refine((date) => date === undefined || !isNaN(date.getTime()), {
    message: ZodMessages.common.invalidDate,
  })
  .openapi({
    type: "string",
    format: "date-time",
    example: "2023-01-01T00:00:00Z",
  });
export const zISODateTime = z.string().datetime({ offset: true });
export const zISODate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const zISOTime = z.string().regex(/^\d{2}:\d{2}:\d{2}$/);

/**
 * export const zMetricCategoryId = zUUID.optional().nullable();
 */
export const zUsername = z
  .string()
  .min(3, { message: ZodMessages.user.usernameMin });
export const zEmail = z
  .string()
  .email({ message: ZodMessages.user.emailInvalid });
export const zPassword = z
  .string()
  .min(6, { message: ZodMessages.user.passwordMin });
export const zPasswordConfirmation = z
  .string()
  .min(6, { message: ZodMessages.user.passwordConfirmMin });
export const zPublicProfile = z.boolean().optional();

/**
 * * Metric Category
 */
export const zMetricCategoryName = z
  .string()
  .min(1, { message: ZodMessages.metricCategory.nameRequired });
export const zMetricCategoryColor = z
  .string()
  .min(1, { message: ZodMessages.metricCategory.colorRequired });
export const zMetricCategoryIcon = z
  .string()
  .min(1, { message: ZodMessages.metricCategory.iconRequired });
export const zMetricCategoryDeletedAt = zDateOptional.optional().nullable();

/**
 * * Metric
 */
const CONTROL_CHARS_PATTERN_SOURCE = "^[^\\u0000-\\u001F\\u007F]*$";
const CONTROL_CHARS_WITH_NEWLINES_PATTERN_SOURCE =
  "^[^\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]*$";

const exceedsUnicodeLength = (value: string, max: number) =>
  getUnicodeLength(value) > max;
const fallsBelowUnicodeLength = (value: string, min: number) =>
  getUnicodeLength(value) < min;
export const zMetricName = z
  .string()
  .superRefine((value, ctx) => {
    if (hasInvalidControlChars(value) || hasUnpairedSurrogates(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: ZodMessages.metric.invalidCharacters,
      });
    }
  })
  .transform((value) => value.trim())
  .superRefine((value, ctx) => {
    if (fallsBelowUnicodeLength(value, METRIC_NAME_RULE.min)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: ZodMessages.metric.nameRequired,
      });
    }
    if (exceedsUnicodeLength(value, METRIC_NAME_RULE.max)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: ZodMessages.metric.nameTooLong,
      });
    }
  })
  .openapi({
    pattern: CONTROL_CHARS_PATTERN_SOURCE,
    minLength: METRIC_NAME_RULE.min,
    maxLength: METRIC_NAME_RULE.max,
  });
export const zMetricCategoryId = z
  .string()
  .uuid({ message: ZodMessages.metric.invalidCategoryId })
  .regex(UUID_REGEX, { message: ZodMessages.metric.invalidCategoryId })
  .nullable()
  .optional();
export const zMetricOriginalId = z
  .string()
  .uuid({ message: ZodMessages.metric.invalidOriginalMetricId })
  .regex(UUID_REGEX, { message: ZodMessages.metric.invalidOriginalMetricId })
  .nullable()
  .optional();
export const zMetricDescription = z
  .string()
  .refine(
    (value) => !exceedsUnicodeLength(value, METRIC_DESCRIPTION_RULE.max),
    { message: ZodMessages.metric.descriptionTooLong },
  )
  .refine(
    (value) =>
      !hasInvalidControlChars(value, true) && !hasUnpairedSurrogates(value),
    {
      message: ZodMessages.metric.invalidCharacters,
    },
  )
  .openapi({
    pattern: CONTROL_CHARS_WITH_NEWLINES_PATTERN_SOURCE,
    maxLength: METRIC_DESCRIPTION_RULE.max,
  });
export const zMetricDefaultUnit = z
  .string()
  .superRefine((value, ctx) => {
    if (hasInvalidControlChars(value) || hasUnpairedSurrogates(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: ZodMessages.metric.invalidCharacters,
      });
    }
  })
  .transform((value) => value.trim())
  .superRefine((value, ctx) => {
    if (fallsBelowUnicodeLength(value, METRIC_UNIT_RULE.min)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: ZodMessages.metric.unitRequired,
      });
    }
    if (exceedsUnicodeLength(value, METRIC_UNIT_RULE.max)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: ZodMessages.metric.unitTooLong,
      });
    }
  })
  .openapi({
    pattern: CONTROL_CHARS_PATTERN_SOURCE,
    minLength: METRIC_UNIT_RULE.min,
    maxLength: METRIC_UNIT_RULE.max,
  });
export const zMetricIsPublic = z.boolean().optional().default(false);
export const zMetricDeletedAt = z.date().optional();

/**
 * * Metric Settings
 */
export const zGoalEnabled = z.boolean().optional().default(false);
const goalTypeEnum = z.enum(["cumulative", "incremental"]);
const goalTypeNullable = z.union([goalTypeEnum, z.null()]);
export const zGoalTypeRequired = goalTypeEnum;
export const zGoalType = goalTypeNullable.optional();
const goalValueSchema = z
  .number()
  .positive(ZodMessages.metricSettings.goalValuePositive);
export const zGoalValueRequired = goalValueSchema;
export const zGoalValue = goalValueSchema.optional().nullable();
export const zTimeFrameEnabled = z.boolean().optional().default(false);
export const zStartDate = zDateOptional.optional().nullable();
export const zDeadlineDate = zDateOptional.optional().nullable();
export const zAlertEnabled = z.boolean().optional().default(false);
export const zAlertThresholds = z
  .number()
  .int({ message: ZodMessages.metricSettings.invalidAlertThreshold })
  .min(0, { message: ZodMessages.metricSettings.alertThresholdMin })
  .max(100, { message: ZodMessages.metricSettings.alertThresholdMax })
  .optional()
  .default(80);
export const zAlertThresholdsOptional = z
  .number()
  .int({ message: ZodMessages.metricSettings.invalidAlertThreshold })
  .min(0, { message: ZodMessages.metricSettings.alertThresholdMin })
  .max(100, { message: ZodMessages.metricSettings.alertThresholdMax })
  .optional();
const zDisplayOptionText = z
  .string()
  .superRefine((value, ctx) => {
    if (hasInvalidControlChars(value) || hasUnpairedSurrogates(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: ZodMessages.metricSettings.invalidDisplayOptions,
      });
    }
  })
  .openapi({ pattern: CONTROL_CHARS_PATTERN_SOURCE });
export const zDisplayOptions = z
  .object({
    showOnDashboard: z.boolean().optional().default(true),
    priority: z.number().int().min(1).max(1000).optional().default(1),
    chartType: zDisplayOptionText.optional().default("line"),
    color: zDisplayOptionText.optional().default("#E897A3"),
  })
  .optional()
  .default({
    showOnDashboard: true,
    priority: 1,
    chartType: "line",
    color: "#E897A3",
  });

/**
 * * * Metric Log
 */
export const zPositiveFloat = z
  .number({ required_error: ZodMessages.metricLog.logValueRequired })
  .finite({ message: ZodMessages.metricLog.logValueFinite })
  .min(METRIC_LOG_VALUE_RULE.min, {
    message: ZodMessages.metricLog.logValueNonNegative,
  })
  .max(METRIC_LOG_VALUE_RULE.max, {
    message: ZodMessages.metricLog.logValueTooLarge,
  });

export const zLogType = z.enum(["manual", "automatic"], {
  required_error: ZodMessages.metricLog.logTypeInvalid,
});

/**
 * A query-string boolean: `true` or `false`, in any case, around any spaces. Anything else
 * is refused, never read as true. `z.coerce.boolean()` is `Boolean(value)`, so `"false"`
 * and `"0"` meant true on the metric-settings list (kit query-values-mean-what-they-say,
 * D-02). Every list's `includeTotal` uses this one.
 */
export const zStrictBooleanQuery = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === "boolean") return value;
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
    return value;
  })
  .pipe(z.boolean());
