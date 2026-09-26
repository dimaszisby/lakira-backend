import { z } from "zod";
import { registerSchema } from "./openapi-config.js";
import {
  metricBody,
  metricBodyPartial,
  metricDetailQuery,
  generateDummyMetricsBody,
} from "@/features/metric/infrastructure/http/schema.zod.js";
import {
  metricCategoryBody,
  createMetricCategoryDummyBody,
} from "@/features/metric-category/infrastructure/http/schema.zod.js";
import {
  settingsBody,
  settingsBodyPartial,
} from "@/features/metric-settings/infrastructure/http/schema.zod.js";
import {
  metricLogBody,
  generateDummyMetricLogsBody,
} from "@/features/metric-log/infrastructure/http/schema.zod.js";

// Common Schemas
const EMAIL_PATTERN = "^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$";
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const TZ_REGEX = /^([A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+|UTC)$/;
const UUID_PATTERN =
  "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$";
const UUID_REGEX = new RegExp(UUID_PATTERN);
const CONTROL_CHARS_PATTERN = "^[^\\u0000-\\u001F\\u007F]*$";
const CONTROL_CHARS_REGEX = new RegExp(CONTROL_CHARS_PATTERN);
const NON_WHITESPACE_PATTERN = "^.*\\S.*$";
const NON_WHITESPACE_REGEX = /^.*\S.*$/;

const emailSchema = (example: string) =>
  z
    .string()
    .email()
    .regex(EMAIL_REGEX, { message: "Invalid email address" })
    .openapi({ example, format: "email", pattern: EMAIL_PATTERN });

export const UuidSchema = registerSchema(
  "Uuid",
  z.string().uuid().regex(UUID_REGEX).openapi({
    description: "A UUID identifier",
    example: "123e4567-e89b-42d3-a456-426614174000",
    pattern: UUID_PATTERN,
  }),
);

export const RateLimitErrorSchema = registerSchema(
  "RateLimitError",
  z.object({
    status: z.number().openapi({ example: 429 }),
    message: z
      .string()
      .openapi({ example: "Too many requests, please try again later." }),
  }),
);

export const SuccessResponseSchema = registerSchema(
  "SuccessResponse",
  z.object({
    status: z.string().openapi({ example: "success" }),
    message: z.string().optional().openapi({ example: "Operation successful" }),
    data: z.any().optional().openapi({ description: "Response data" }),
  }),
);

export const successEnvelope = <T extends z.ZodTypeAny>(schema: T) =>
  SuccessResponseSchema.extend({
    data: schema.optional(),
  });

const queryParamMetadata = (
  name: string,
  description: string,
  required = false,
) => ({
  param: {
    name,
    in: "query" as const,
    required,
    description,
  },
});

const deepObjectParamMetadata = (
  name: string,
  description: string,
  required = false,
) => ({
  param: {
    name,
    in: "query" as const,
    required,
    description,
    style: "deepObject" as const,
    explode: true,
  },
});

const DEFAULT_TZ = "Asia/Jakarta";

const isValidTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const validateAbsoluteRange = (
  start: string | undefined,
  end: string | undefined,
  ctx: z.RefinementCtx,
) => {
  if (start && !end) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["end"],
      message: "Provide end when start is supplied.",
    });
  }
  if (!start && end) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["start"],
      message: "Provide start when end is supplied.",
    });
  }
  if (start && end) {
    const startValue = Date.parse(start);
    const endValue = Date.parse(end);
    if (Number.isNaN(startValue)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["start"],
        message: "Invalid start ISO timestamp",
      });
    }
    if (Number.isNaN(endValue)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end"],
        message: "Invalid end ISO timestamp",
      });
    }
    if (
      !Number.isNaN(startValue) &&
      !Number.isNaN(endValue) &&
      endValue <= startValue
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end"],
        message: "end must be after start",
      });
    }
  }
};

export const MetricIdQuerySchema = z.object({
  metricId: UuidSchema.optional().openapi(
    queryParamMetadata(
      "metricId",
      "Optional metric identifier to scope the request",
    ),
  ),
});

export const MetricIdRequiredQuerySchema = z.object({
  metricId: UuidSchema.openapi(
    queryParamMetadata(
      "metricId",
      "Metric identifier required for ownership validation",
      true,
    ),
  ),
});

const cursorLimitParam = queryParamMetadata(
  "limit",
  "Maximum number of records to return (1-100)",
);

const cursorSortParam = (
  name = "sort",
  description = "Sort field (prefix with - for DESC)",
) => queryParamMetadata(name, description);

const cursorAfterParam = queryParamMetadata(
  "after",
  "Opaque cursor returned from the previous page",
);

const cursorIncludeTotalParam = queryParamMetadata(
  "includeTotal",
  "Set to true to include totalCount in the response",
);

const cursorSearchParam = queryParamMetadata(
  "q",
  "Optional free-text search term (trimmed; must be at least 1 character).",
);
const cursorSearchSchema = z
  .string()
  .min(1)
  .regex(NON_WHITESPACE_REGEX)
  .openapi({
    ...cursorSearchParam,
    pattern: NON_WHITESPACE_PATTERN,
  });
const nonWhitespaceSearchFieldSchema = z
  .string()
  .min(1)
  .regex(NON_WHITESPACE_REGEX)
  .openapi({ pattern: NON_WHITESPACE_PATTERN });

export const MetricCursorQueryParamsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().openapi(cursorLimitParam),
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
    .optional()
    .openapi(cursorSortParam()),
  q: cursorSearchSchema.optional(),
  after: z.string().optional().openapi(cursorAfterParam),
  includeTotal: z.boolean().optional().openapi(cursorIncludeTotalParam),
  filter: z
    .object({
      name: nonWhitespaceSearchFieldSchema.optional(),
      categoryId: UuidSchema.optional(),
    })
    .partial()
    .optional()
    .openapi(
      deepObjectParamMetadata(
        "filter",
        "Filter metrics by name and/or categoryId (deepObject).",
      ),
    ),
});

export const MetricCategoryCursorQueryParamsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().openapi(cursorLimitParam),
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
    .optional()
    .openapi(cursorSortParam()),
  q: cursorSearchSchema.optional(),
  after: z.string().optional().openapi(cursorAfterParam),
  includeTotal: z.boolean().optional().openapi(cursorIncludeTotalParam),
  filter: z
    .object({
      name: nonWhitespaceSearchFieldSchema.optional(),
    })
    .partial()
    .optional()
    .openapi(
      deepObjectParamMetadata(
        "filter",
        "Filter categories by name (deepObject).",
      ),
    ),
});

export const MetricLogCursorQueryParamsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().openapi(cursorLimitParam),
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
    .optional()
    .openapi(cursorSortParam()),
  q: z
    .string()
    .min(1)
    .regex(NON_WHITESPACE_REGEX)
    .optional()
    .openapi({
      ...queryParamMetadata(
        "q",
        "Optional search term applied to log notes/metadata",
      ),
      pattern: NON_WHITESPACE_PATTERN,
    }),
  after: z.string().optional().openapi(cursorAfterParam),
  includeTotal: z.boolean().optional().openapi(cursorIncludeTotalParam),
  filter: z
    .object({
      metricId: UuidSchema.optional(),
      logValue: z.number().min(0).optional(),
    })
    .partial()
    .optional()
    .openapi(
      deepObjectParamMetadata(
        "filter",
        "Filter logs by metricId and/or logValue (deepObject).",
      ),
    ),
});

export const MetricSettingsCursorQueryParamsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().openapi(cursorLimitParam),
  sort: z
    .enum([
      "createdAt",
      "-createdAt",
      "updatedAt",
      "-updatedAt",
      "isActive",
      "-isActive",
    ] as const)
    .optional()
    .openapi(cursorSortParam()),
  q: cursorSearchSchema.optional(),
  after: z.string().optional().openapi(cursorAfterParam),
  includeTotal: z.boolean().optional().openapi(cursorIncludeTotalParam),
  filter: z
    .object({
      metricId: UuidSchema.optional(),
      isActive: z.boolean().optional(),
    })
    .partial()
    .optional()
    .openapi(
      deepObjectParamMetadata(
        "filter",
        "Filter settings by metricId and/or isActive (deepObject).",
      ),
    ),
});

// Auth Schemas
export const UserSchema = registerSchema(
  "User",
  z.object({
    id: UuidSchema,
    username: z.string().openapi({ example: "testuser" }),
    email: z.string().email().openapi({ example: "test@example.com" }),
    isPublicProfile: z.boolean().openapi({ example: true }),
    emailVerifiedAt: z.string().datetime().nullable().openapi({
      example: null,
      description:
        "ISO 8601 timestamp when email was verified, or null if unverified",
    }),
    createdAt: z
      .string()
      .datetime()
      .openapi({ example: "2023-01-01T12:00:00Z" }),
    updatedAt: z
      .string()
      .datetime()
      .openapi({ example: "2023-01-01T12:00:00Z" }),
  }),
);

export const UserResponseSchema = registerSchema(
  "UserResponse",
  successEnvelope(UserSchema),
);

export const UpdateUserResponseSchema = registerSchema(
  "UpdateUserResponse",
  successEnvelope(
    z.object({
      user: UserSchema,
    }),
  ),
);

export const LoginRequestSchema = registerSchema(
  "LoginRequest",
  z.object({
    email: emailSchema("user@example.com"),
    password: z.string().min(6).openapi({ example: "password123" }),
  }),
);

const AuthTokenPayloadSchema = z.object({
  token: z.string().openapi({
    example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  }),
  user: UserSchema,
});

export const LoginResponseSchema = registerSchema(
  "LoginResponse",
  successEnvelope(AuthTokenPayloadSchema),
);

const RefreshTokenPayloadSchema = z.object({
  token: z.string().openapi({
    example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  }),
});

export const RefreshResponseSchema = registerSchema(
  "RefreshResponse",
  successEnvelope(RefreshTokenPayloadSchema),
);

export const SwitchOrgRequestSchema = registerSchema(
  "SwitchOrgRequest",
  z.object({
    organizationId: z.string().uuid().regex(UUID_REGEX).openapi({
      description: "Target organization ID to switch to",
      example: "123e4567-e89b-42d3-a456-426614174000",
      pattern: UUID_PATTERN,
    }),
  }),
);

export const CreateInviteRequestSchema = registerSchema(
  "CreateInviteRequest",
  z.object({
    email: emailSchema("invitee@example.com"),
    role: z.enum(["admin", "member"]).openapi({ example: "member" }),
  }),
);

export const AcceptInviteRequestSchema = registerSchema(
  "AcceptInviteRequest",
  z.object({
    token: z.string().min(1).openapi({
      example: "dGVzdC1pbnZpdGUtdG9rZW4",
    }),
  }),
);

export const ChangeMemberRoleRequestSchema = registerSchema(
  "ChangeMemberRoleRequest",
  z.object({
    role: z.enum(["admin", "member"]).openapi({ example: "admin" }),
  }),
);

export const MemberSchema = registerSchema(
  "Member",
  z.object({
    membershipId: UuidSchema,
    userId: UuidSchema,
    username: z.string().openapi({ example: "johndoe" }),
    email: z.string().email().openapi({ example: "john@example.com" }),
    role: z.enum(["owner", "admin", "member"]).openapi({ example: "member" }),
    status: z
      .enum(["active", "invited", "removed"])
      .openapi({ example: "active" }),
    joinedAt: z
      .string()
      .datetime()
      .openapi({ example: "2025-01-15T09:30:00Z" }),
  }),
);

export const MemberListResponseSchema = registerSchema(
  "MemberListResponse",
  successEnvelope(
    z.object({
      members: z.array(MemberSchema),
    }),
  ),
);

export const UserOrganizationSchema = registerSchema(
  "UserOrganization",
  z.object({
    organizationId: UuidSchema,
    name: z.string().openapi({ example: "Acme" }),
    slug: z.string().openapi({ example: "acme" }),
    role: z.enum(["owner", "admin", "member"]).openapi({ example: "owner" }),
    joinedAt: z
      .string()
      .datetime()
      .openapi({ example: "2025-01-15T09:30:00Z" }),
    isCurrent: z.boolean().openapi({
      description:
        "True for the organization the presented access token is scoped to.",
      example: true,
    }),
  }),
);

export const UserOrganizationListResponseSchema = registerSchema(
  "UserOrganizationListResponse",
  successEnvelope(
    z.object({
      organizations: z.array(UserOrganizationSchema),
    }),
  ),
);

export const RegisterRequestSchema = registerSchema(
  "RegisterRequest",
  z
    .object({
      username: z.string().min(3).openapi({ example: "newuser" }),
      email: emailSchema("newuser@example.com"),
      password: z.string().min(6).openapi({ example: "newpassword123" }),
      passwordConfirmation: z
        .string()
        .min(6)
        .openapi({ example: "newpassword123" }),
      isPublicProfile: z.boolean().optional().openapi({ example: true }),
    })
    .refine((data) => data.password === data.passwordConfirmation, {
      message: "Passwords do not match",
      path: ["passwordConfirmation"],
    }),
);

export const UpdateUserRequestSchema = registerSchema(
  "UpdateUserRequest",
  z.object({
    username: z.string().min(3).optional().openapi({ example: "updateduser" }),
    email: emailSchema("updated@example.com").optional(),
    password: z
      .string()
      .min(6)
      .optional()
      .openapi({ example: "updatedpassword" }),
    isPublicProfile: z.boolean().optional().openapi({ example: false }),
  }),
);

export const ForgotPasswordRequestSchema = registerSchema(
  "ForgotPasswordRequest",
  z.object({
    email: emailSchema("user@example.com"),
  }),
);

export const ResetPasswordRequestSchema = registerSchema(
  "ResetPasswordRequest",
  z
    .object({
      token: z.string().min(1).openapi({
        example: "AbCdEf0123456789AbCdEf0123456789AbCdEf01",
      }),
      password: z.string().min(6).openapi({ example: "BrandNewPass123!" }),
      passwordConfirmation: z
        .string()
        .min(6)
        .openapi({ example: "BrandNewPass123!" }),
    })
    .refine((data) => data.password === data.passwordConfirmation, {
      message: "Passwords do not match",
      path: ["passwordConfirmation"],
    }),
);

export const VerifyEmailRequestSchema = registerSchema(
  "VerifyEmailRequest",
  z.object({
    token: z.string().min(1).openapi({
      example: "AbCdEf0123456789AbCdEf0123456789AbCdEf01",
    }),
  }),
);

// Metric Category Schemas
export const MetricCategorySchema = registerSchema(
  "MetricCategory",
  z.object({
    id: UuidSchema,
    name: z.string().openapi({ example: "Fitness" }),
    color: z.string().openapi({ example: "#FF5733" }),
    icon: z.string().openapi({ example: "🏃" }),
    userId: UuidSchema,
    metricCount: z.number().openapi({ example: 4 }),
    createdAt: z
      .string()
      .datetime()
      .openapi({ example: "2023-01-01T12:00:00Z" }),
    updatedAt: z
      .string()
      .datetime()
      .openapi({ example: "2023-01-01T12:00:00Z" }),
  }),
);

export const CreateMetricCategoryRequestSchema = registerSchema(
  "CreateMetricCategoryRequest",
  metricCategoryBody.openapi({
    example: { name: "New Category", color: "#123456", icon: "✨" },
  }),
);

export const UpdateMetricCategoryRequestSchema = registerSchema(
  "UpdateMetricCategoryRequest",
  metricCategoryBody.partial().openapi({
    example: { name: "Updated Category", color: "#654321" },
  }),
);

const CursorMetaSchema = {
  nextCursor: z.string().nullable().openapi({
    example: "eyJpZCI6IjEyMyJ9",
    description: "Opaque cursor for the next page",
  }),
  sort: z.string().openapi({
    example: "-createdAt",
    description: "Sort applied to the collection",
  }),
  limit: z
    .number()
    .int()
    .openapi({ example: 20, description: "Page size used in the request" }),
  q: z
    .string()
    .optional()
    .openapi({ example: "sleep", description: "Search term applied, if any" }),
  filter: z
    .record(z.any())
    .optional()
    .openapi({ description: "Normalized filters applied to the query" }),
  totalCount: z.number().optional().openapi({
    example: 120,
    description:
      "Total number of records (present only when includeTotal=true)",
  }),
};

const MetricPreviewCategorySchema = z.object({
  id: UuidSchema,
  name: z.string().openapi({ example: "Health" }),
  icon: z.string().openapi({ example: "❤️" }),
  color: z.string().openapi({ example: "#FF0000" }),
});

export const MetricPreviewSchema = registerSchema(
  "MetricPreview",
  z.object({
    id: UuidSchema,
    name: z.string().openapi({ example: "Sleep Hours" }),
    description: z
      .string()
      .nullable()
      .openapi({ example: "Hours slept per day" }),
    defaultUnit: z.string().openapi({ example: "hours" }),
    isPublic: z.boolean().openapi({ example: false }),
    goalType: z.string().openapi({ example: "Not Set" }),
    logCount: z.number().openapi({ example: 42 }),
    category: MetricPreviewCategorySchema.nullable(),
  }),
);

export const MetricCursorResponseSchema = registerSchema(
  "MetricCursorResponse",
  z.object({
    items: z.array(MetricPreviewSchema),
    ...CursorMetaSchema,
  }),
);

export const MetricDetailQueryParamsSchema = metricDetailQuery;

export const MetricCategoryCursorResponseSchema = registerSchema(
  "MetricCategoryCursorResponse",
  z.object({
    items: z.array(MetricCategorySchema),
    ...CursorMetaSchema,
  }),
);

// Metric Schemas
const NullableUuidField = z.string().uuid().nullable().openapi({
  description: "A UUID identifier or null when unset",
  example: null,
});

export const MetricSchema = registerSchema(
  "Metric",
  z.object({
    id: UuidSchema,
    userId: UuidSchema,
    originalMetricId: NullableUuidField.optional(),
    categoryId: NullableUuidField.optional(),
    name: z.string().openapi({ example: "Daily Steps" }),
    description: z
      .string()
      .optional()
      .nullable()
      .openapi({ example: "Number of steps walked per day" }),
    defaultUnit: z.string().openapi({ example: "steps" }),
    isPublic: z.boolean().openapi({ example: false }),
    createdAt: z
      .string()
      .datetime()
      .openapi({ example: "2023-01-01T12:00:00Z" }),
    updatedAt: z
      .string()
      .datetime()
      .openapi({ example: "2023-01-01T12:00:00Z" }),
  }),
);

export const CreateMetricRequestSchema = registerSchema(
  "CreateMetricRequest",
  metricBody,
);

export const UpdateMetricRequestSchema = registerSchema(
  "UpdateMetricRequest",
  metricBodyPartial,
);

// Metric Log Schemas
export const MetricLogSchema = registerSchema(
  "MetricLog",
  z.object({
    id: UuidSchema,
    metricId: UuidSchema,
    type: z.enum(["manual", "automatic"]).openapi({ example: "manual" }),
    logValue: z.number().min(0).openapi({ example: 10000 }),
    loggedAt: z
      .string()
      .datetime()
      .openapi({ example: "2023-01-01T12:00:00Z" }),
    createdAt: z
      .string()
      .datetime()
      .openapi({ example: "2023-01-01T12:00:00Z" }),
    updatedAt: z
      .string()
      .datetime()
      .openapi({ example: "2023-01-01T12:00:00Z" }),
  }),
);

export const CreateMetricLogRequestSchema = registerSchema(
  "CreateMetricLogRequest",
  metricLogBody.openapi({
    example: {
      metricId: "55555555-eeee-4eee-8eee-000000000005",
      logValue: 5000,
      type: "manual",
      loggedAt: "2023-01-01T10:00:00Z",
    },
  }),
);

export const UpdateMetricLogRequestSchema = registerSchema(
  "UpdateMetricLogRequest",
  metricLogBody.partial().openapi({
    example: {
      logValue: 12000,
      type: "manual",
      loggedAt: "2023-01-01T13:00:00Z",
    },
  }),
);

export const MetricLogStatsResponseSchema = registerSchema(
  "MetricLogStatsResponse",
  z.object({
    average: z.number().openapi({ example: 80 }),
    min: z.number().openapi({ example: 10 }),
    max: z.number().openapi({ example: 150 }),
  }),
);

export const MetricLogCursorResponseSchema = registerSchema(
  "MetricLogCursorResponse",
  z.object({
    items: z.array(MetricLogSchema),
    ...CursorMetaSchema,
  }),
);

export const GenerateDummyMetricLogsRequestSchema = registerSchema(
  "GenerateDummyMetricLogsRequest",
  generateDummyMetricLogsBody.openapi({
    example: {
      count: 50,
    },
  }),
);

export const GenerateDummyMetricsRequestSchema = registerSchema(
  "GenerateDummyMetricsRequest",
  generateDummyMetricsBody.openapi({
    example: {
      count: 50,
    },
  }),
);

export const GenerateDummyMetricCategoriesRequestSchema = registerSchema(
  "GenerateDummyMetricCategoriesRequest",
  createMetricCategoryDummyBody.openapi({
    example: {
      count: 5,
    },
  }),
);

export const GenerateDummyMetricLogsResponseSchema = registerSchema(
  "GenerateDummyMetricLogsResponse",
  z.object({
    jobId: z.string().uuid().openapi({
      example: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      description:
        "UUID identifying the async job. Poll for completion or observe worker logs.",
    }),
  }),
);

// Metric Settings Schemas
export const MetricDisplayOptionsSchema = z.object({
  showOnDashboard: z.boolean().openapi({ example: true }),
  priority: z.number().int().min(1).max(1000).openapi({ example: 1 }),
  chartType: z
    .string()
    .regex(CONTROL_CHARS_REGEX)
    .openapi({ example: "line", pattern: CONTROL_CHARS_PATTERN }),
  color: z
    .string()
    .regex(CONTROL_CHARS_REGEX)
    .openapi({ example: "#E897A3", pattern: CONTROL_CHARS_PATTERN }),
});

const MetricSettingsGoalTypeSchema = z.union([
  z.enum(["cumulative", "incremental"]),
  z.null(),
]);

export const MetricSettingsSchema = registerSchema(
  "MetricSettings",
  z.object({
    id: UuidSchema,
    metricId: UuidSchema,
    isActive: z.boolean().openapi({ example: true }),
    goalEnabled: z.boolean().openapi({ example: true }),
    goalType: MetricSettingsGoalTypeSchema.openapi({ example: "cumulative" }),
    goalValue: z.number().nullable().openapi({ example: 10000 }),
    timeFrameEnabled: z.boolean().openapi({ example: false }),
    startDate: z
      .string()
      .datetime()
      .nullable()
      .openapi({ example: "2023-01-01T00:00:00Z" }),
    deadlineDate: z
      .string()
      .datetime()
      .nullable()
      .openapi({ example: "2023-02-01T00:00:00Z" }),
    alertEnabled: z.boolean().openapi({ example: false }),
    alertThresholds: z.number().nullable().openapi({ example: 80 }),
    isAchieved: z.boolean().openapi({ example: false }),
    displayOptions: MetricDisplayOptionsSchema,
    createdAt: z
      .string()
      .datetime()
      .openapi({ example: "2023-01-01T12:00:00Z" }),
    updatedAt: z
      .string()
      .datetime()
      .openapi({ example: "2023-01-01T12:00:00Z" }),
  }),
);

const MetricCategoryOrNullSchema = MetricCategorySchema.or(
  z.null().openapi({
    description: "Null when the metric does not belong to a category",
    example: null,
  }),
);

const MetricSettingsOrNullSchema = MetricSettingsSchema.or(
  z.null().openapi({
    description: "Null when metric settings have not been configured",
    example: null,
  }),
);

export const CreateMetricSettingsRequestSchema = registerSchema(
  "CreateMetricSettingsRequest",
  settingsBody.openapi({
    example: {
      metricId: "55555555-eeee-4eee-8eee-000000000005",
      goalEnabled: true,
      goalType: "cumulative",
      goalValue: 100,
      timeFrameEnabled: false,
      displayOptions: {
        showOnDashboard: true,
        priority: 1,
        chartType: "line",
        color: "#E897A3",
      },
    },
  }),
);

export const UpdateMetricSettingsRequestSchema = registerSchema(
  "UpdateMetricSettingsRequest",
  settingsBodyPartial.openapi({
    example: {
      goalEnabled: true,
      goalType: "incremental",
      goalValue: 25,
      timeFrameEnabled: true,
      startDate: "2024-01-01T00:00:00Z",
      deadlineDate: "2024-02-01T00:00:00Z",
    },
  }),
);

const displayOptionPatchTextSchema = z
  .string()
  .min(1)
  .regex(CONTROL_CHARS_REGEX)
  .openapi({ pattern: CONTROL_CHARS_PATTERN });

const MetricDisplayOptionsPatchSchema = z
  .object({
    showOnDashboard: z.boolean().optional(),
    priority: z.number().int().min(1).max(1000).optional(),
    chartType: displayOptionPatchTextSchema.optional(),
    color: displayOptionPatchTextSchema.optional(),
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
  })
  .openapi({
    minProperties: 1,
    example: {
      showOnDashboard: true,
      priority: 2,
      chartType: "bar",
      color: "#00FFAA",
    },
  });

export const UpdateDisplayOptionsRequestSchema = registerSchema(
  "UpdateDisplayOptionsRequest",
  z.object({
    displayOptions: MetricDisplayOptionsPatchSchema,
  }),
);

export const MetricSettingsCursorResponseSchema = registerSchema(
  "MetricSettingsCursorResponse",
  z.object({
    items: z.array(MetricSettingsSchema),
    ...CursorMetaSchema,
  }),
);

export const MetricDetailResponseSchema = registerSchema(
  "MetricDetailResponse",
  MetricSchema.extend({
    category: MetricCategoryOrNullSchema,
    settings: MetricSettingsOrNullSchema,
    logs: z.array(MetricLogSchema).or(
      z.null().openapi({
        description: "Null when no recent logs are available",
        example: null,
      }),
    ),
  }),
);

// Trend Schemas
export const TrendDataPointSchema = registerSchema(
  "TrendDataPoint",
  z.object({
    date: z.string().openapi({ example: "2023-01-01" }),
    value: z.number().openapi({ example: 7500 }),
  }),
);

export const TrendResponseSchema = registerSchema(
  "TrendResponse",
  z.array(TrendDataPointSchema),
);

// Analytics Schemas
const VisualizationSeriesSchema = z.object({
  bucketStartISO: z
    .string()
    .datetime()
    .openapi({ example: "2023-01-01T00:00:00Z" }),
  value: z.number().nullable().openapi({ example: 42.5 }),
});

const VisualizationStatsSchema = z.object({
  average: z.number().nullable().openapi({ example: 35.1 }),
  min: z.number().nullable().openapi({ example: 5 }),
  max: z.number().nullable().openapi({ example: 80 }),
  count: z.number().openapi({ example: 120 }),
});

const VisualizationMetaSchema = z.object({
  metricId: UuidSchema,
  unit: z.string().openapi({ example: "steps" }),
  bucket: z.string().openapi({ example: "1d" }),
  tz: z.string().openapi({ example: "Asia/Jakarta" }),
  range: z.object({
    startISO: z.string().datetime(),
    endISO: z.string().datetime(),
  }),
});

export const VisualizationResponseSchema = registerSchema(
  "VisualizationResponse",
  z.object({
    series: z.array(VisualizationSeriesSchema),
    stats: VisualizationStatsSchema,
    meta: VisualizationMetaSchema,
  }),
);

const DashboardVisualizationItemSchema = z.object({
  metricId: UuidSchema,
  name: z.string().openapi({ example: "Sleep" }),
  unit: z.string().openapi({ example: "hours" }),
  category_name: z.string().nullable().openapi({ example: "Wellness" }),
  category_icon: z.string().nullable().openapi({ example: "😴" }),
  category_color: z.string().nullable().openapi({ example: "#663399" }),
  priority: z.number().nullable().openapi({ example: 1 }),
  series: z.array(VisualizationSeriesSchema),
  stats: VisualizationStatsSchema,
});

export const DashboardVisualizationResponseSchema = registerSchema(
  "DashboardVisualizationResponse",
  z.object({
    items: z.array(DashboardVisualizationItemSchema),
    meta: z.object({
      bucket: z.string().openapi({ example: "1d" }),
      tz: z.string().openapi({ example: "Asia/Jakarta" }),
      range: z.object({
        startISO: z.string().datetime(),
        endISO: z.string().datetime(),
      }),
      count: z.number().openapi({ example: 5 }),
    }),
  }),
);

const BucketEnumSchema = z.enum(["1h", "1d", "1w", "1m", "1y"]);
const FillEnumSchema = z.enum(["none", "zero", "nan"]);
const RelativeLastWindowSchema = z
  .string()
  .regex(/^[1-9][0-9]*(h|d|w|m|y)$/, "Use format like 7d, 30d, 12m, 1y")
  .optional();

const VisualizationQueryRawSchema = z
  .object({
    bucket: BucketEnumSchema.default("1d").openapi({
      param: {
        name: "bucket",
        in: "query",
        required: false,
        description: "Aggregation bucket size (defaults to 1d when omitted).",
      },
    }),
    tz: z
      .string()
      .min(1)
      .regex(TZ_REGEX, { message: "Invalid IANA time zone" })
      .default(DEFAULT_TZ)
      .refine((value) => isValidTimeZone(value), {
        message: "Invalid IANA time zone",
      })
      .openapi({
        param: {
          name: "tz",
          in: "query",
          required: false,
          description:
            "IANA timezone (defaults to Asia/Jakarta when omitted). Leave the parameter out rather than sending an empty string.",
        },
      }),
    fill: FillEnumSchema.default("none").openapi({
      param: {
        name: "fill",
        in: "query",
        required: false,
        description: "Missing bucket fill strategy",
      },
    }),
    start: z
      .string()
      .datetime()
      .optional()
      .openapi({
        param: {
          name: "start",
          in: "query",
          required: false,
          description:
            "Absolute start ISO timestamp. Must be paired with `end` when supplied; sending only one side of the range is invalid.",
        },
      }),
    end: z
      .string()
      .datetime()
      .optional()
      .openapi({
        param: {
          name: "end",
          in: "query",
          required: false,
          description:
            "Absolute end ISO timestamp. Must be paired with `start` (and occur after it).",
        },
      }),
    last: RelativeLastWindowSchema.openapi({
      param: {
        name: "last",
        in: "query",
        required: false,
        description:
          "Relative range such as 7d or 12m (defaults to 30d; minimum is 1). Provide either this parameter or both `start` and `end`, not both; large windows may be rejected based on the bucket size.",
      },
    }),
  })
  .strict();

const VisualizationBaseQuerySchema = VisualizationQueryRawSchema.superRefine(
  ({ start, end }, ctx) => {
    validateAbsoluteRange(start, end, ctx);
  },
);

export const VisualizationQueryParamsSchema = VisualizationBaseQuerySchema;

export const DashboardVisualizationQueryParamsSchema =
  VisualizationQueryRawSchema.extend({
    limit: z
      .number()
      .int()
      .min(1)
      .max(48)
      .optional()
      .openapi({
        param: {
          name: "limit",
          in: "query",
          required: false,
          description: "Maximum number of metrics to include",
        },
      }),
  })
    .strict()
    .superRefine(({ start, end }, ctx) => {
      validateAbsoluteRange(start, end, ctx);
    });
