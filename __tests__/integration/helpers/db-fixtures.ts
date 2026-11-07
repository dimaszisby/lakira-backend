import { randomUUID } from "crypto";
import type { Transaction } from "sequelize";
import sequelize from "@/config/db.js";
import { models } from "@/infrastructure/db/models.js";
import type { MetricDisplayOptions } from "@/types/db/metric-settings.types.js";
import { Metric } from "@/features/metric/domain/entities/Metric.js";

const uniqueSuffix = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const TEST_ORG_ID = "00000000-0000-4000-8000-000000000001";

export type UserOverrides = Partial<{
  id: string;
  email: string;
  username: string;
  password: string;
  isPublicProfile: boolean;
}>;

export async function createUserRow(overrides: UserOverrides = {}) {
  const userId = overrides.id ?? randomUUID();
  const user = await models.User.create({
    id: userId,
    email: overrides.email ?? `${uniqueSuffix()}@example.com`,
    username: overrides.username ?? `user-${uniqueSuffix()}`,
    password: overrides.password ?? "hash",
    isPublicProfile: overrides.isPublicProfile ?? true,
  });

  const orgExists = await models.Organization.findByPk(TEST_ORG_ID);
  if (!orgExists) {
    await models.Organization.create({
      id: TEST_ORG_ID,
      name: "Test Organization",
      slug: `test-org-${uniqueSuffix()}`,
    });
  }

  const membershipExists = await models.Membership.findOne({
    where: { userId, organizationId: TEST_ORG_ID },
  });
  if (!membershipExists) {
    await models.Membership.create({
      userId,
      organizationId: TEST_ORG_ID,
      role: "owner",
      status: "active",
      joinedAt: new Date(),
    });
  }

  return user;
}

export type MetricCategoryOverrides = Partial<{
  id: string;
  name: string;
  color: string;
  icon: string;
}>;

export async function createMetricCategoryRow(
  userId: string,
  overrides: MetricCategoryOverrides = {},
) {
  return models.MetricCategory.create({
    id: overrides.id ?? randomUUID(),
    userId,
    organizationId: TEST_ORG_ID,
    name: overrides.name ?? `Category-${uniqueSuffix()}`,
    color: overrides.color ?? "#E897A3",
    icon: overrides.icon ?? "🔥",
  });
}

type MetricDomainOverrides = Partial<{
  id: string;
  userId: string;
  name: string;
  defaultUnit: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  categoryId: string | null;
  originalMetricId: string | null;
  description: string | null;
  deletedAt: Date | null;
}>;

export const buildMetricDomain = (overrides: MetricDomainOverrides = {}) =>
  Metric.fromProps({
    id: overrides.id ?? randomUUID(),
    userId: overrides.userId ?? randomUUID(),
    name: overrides.name ?? `Metric-${uniqueSuffix()}`,
    defaultUnit: overrides.defaultUnit ?? "units",
    isPublic: overrides.isPublic ?? true,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
    categoryId: overrides.categoryId ?? null,
    originalMetricId: overrides.originalMetricId ?? null,
    description: overrides.description ?? "desc",
    deletedAt: overrides.deletedAt ?? null,
  });

export async function runInTransaction<T>(
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const tx = await sequelize.transaction();
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

export async function truncateAllTables() {
  const qi = sequelize.getQueryInterface();
  const tables = [
    "metric_logs",
    "metric_settings",
    "metrics",
    "metric_categories",
    "memberships",
    "organizations",
    "users",
  ];
  for (const table of tables) {
    await qi.bulkDelete(table, {});
  }
}

export type MetricRowOverrides = Partial<{
  id: string;
  userId: string;
  categoryId: string | null;
  name: string;
  defaultUnit: string;
  description: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}>;

export async function createMetricRow(data: MetricRowOverrides = {}) {
  return models.Metric.create({
    id: data.id ?? randomUUID(),
    userId: data.userId ?? randomUUID(),
    organizationId: TEST_ORG_ID,
    categoryId: typeof data.categoryId === "undefined" ? null : data.categoryId,
    name: data.name ?? `Metric-${uniqueSuffix()}`,
    defaultUnit: data.defaultUnit ?? "units",
    description: data.description ?? "desc",
    isPublic: data.isPublic ?? true,
    createdAt: data.createdAt ?? new Date(),
    updatedAt: data.updatedAt ?? new Date(),
    deletedAt:
      typeof data.deletedAt === "undefined" ? null : (data.deletedAt ?? null),
  });
}

export type MetricSettingsRowOverrides = Partial<{
  id: string;
  metricId: string;
  goalEnabled: boolean;
  goalType: "cumulative" | "incremental" | null;
  goalValue: number | null;
  timeFrameEnabled: boolean;
  startDate: Date | null;
  deadlineDate: Date | null;
  alertEnabled: boolean;
  alertThresholds: number | null;
  isActive: boolean;
  displayOptions: MetricDisplayOptions;
}>;

export async function createMetricSettingsRow(
  overrides: MetricSettingsRowOverrides = {},
) {
  return models.MetricSettings.create({
    id: overrides.id ?? randomUUID(),
    metricId: overrides.metricId!,
    organizationId: TEST_ORG_ID,
    isActive: overrides.isActive ?? true,
    goalEnabled: overrides.goalEnabled ?? false,
    goalType: overrides.goalType ?? null,
    goalValue: overrides.goalValue ?? null,
    timeFrameEnabled: overrides.timeFrameEnabled ?? false,
    startDate: overrides.startDate ?? null,
    deadlineDate: overrides.deadlineDate ?? null,
    alertEnabled: overrides.alertEnabled ?? false,
    alertThresholds: overrides.alertThresholds ?? null,
    isAchieved: false,
    displayOptions: overrides.displayOptions ?? {
      showOnDashboard: true,
      priority: 1,
      chartType: "line",
      color: "#E897A3",
    },
  });
}

export type MetricLogRowOverrides = Partial<{
  id: string;
  metricId: string;
  logValue: number;
  type: "manual" | "automatic";
  loggedAt: Date;
}>;

// metric_logs is unique on (metric_id, logged_at) at millisecond precision. Defaulting
// every row to `new Date()` let two back-to-back calls for one metric collide on a fast
// runner. This default is strictly increasing within the test process instead.
let lastDefaultLoggedAt = 0;
const nextDefaultLoggedAt = () => {
  lastDefaultLoggedAt = Math.max(Date.now(), lastDefaultLoggedAt + 1);
  return new Date(lastDefaultLoggedAt);
};

export async function createMetricLogRow(
  overrides: MetricLogRowOverrides = {},
) {
  return models.MetricLog.create({
    id: overrides.id ?? randomUUID(),
    metricId: overrides.metricId ?? randomUUID(),
    organizationId: TEST_ORG_ID,
    logValue: overrides.logValue ?? 1,
    type: overrides.type ?? "manual",
    loggedAt: overrides.loggedAt ?? nextDefaultLoggedAt(),
  });
}

type CreatedUser = Awaited<ReturnType<typeof createUserRow>>;
type CreatedCategory = Awaited<ReturnType<typeof createMetricCategoryRow>>;

export async function createUserWithCategory(
  userOverrides: UserOverrides = {},
  categoryOverrides: MetricCategoryOverrides = {},
) {
  const user = await createUserRow(userOverrides);
  const category = await createMetricCategoryRow(user.id, categoryOverrides);
  return { user, category };
}

type SeedMetricWithLogsOptions = {
  user?: CreatedUser;
  userOverrides?: UserOverrides;
  categoryOverrides?: MetricCategoryOverrides;
  metricOverrides?: MetricRowOverrides;
  logs?: MetricLogRowOverrides[];
};

export async function seedMetricWithLogs(
  options: SeedMetricWithLogsOptions = {},
) {
  const user = options.user ?? (await createUserRow(options.userOverrides));
  const category = options.categoryOverrides
    ? await createMetricCategoryRow(user.id, options.categoryOverrides)
    : null;

  const metricOverrides = options.metricOverrides ?? {};
  const metricPayload: MetricRowOverrides = {
    ...metricOverrides,
    userId: user.id,
  };

  const hasCategoryOverride =
    metricOverrides &&
    Object.prototype.hasOwnProperty.call(metricOverrides, "categoryId");

  if (!hasCategoryOverride && category) {
    metricPayload.categoryId = category.id;
  }

  const metric = await createMetricRow(metricPayload);

  const logs = [];
  for (const logOverrides of options.logs ?? []) {
    logs.push(
      await createMetricLogRow({
        metricId: metric.id,
        ...logOverrides,
      }),
    );
  }

  return { user, metric, logs, category };
}

type SeedDashboardMetricOptions = SeedMetricWithLogsOptions & {
  settingsOverrides?: MetricSettingsRowOverrides;
};

export async function seedDashboardMetric(
  options: SeedDashboardMetricOptions = {},
) {
  const seed = await seedMetricWithLogs(options);
  const settings = await createMetricSettingsRow({
    metricId: seed.metric.id,
    ...options.settingsOverrides,
  });
  return { ...seed, settings };
}

type DashboardMetricSeed = {
  metricOverrides?: MetricRowOverrides;
  settingsOverrides?: MetricSettingsRowOverrides;
  logs?: MetricLogRowOverrides[];
  categoryOverrides?: MetricCategoryOverrides;
};

type SeedDashboardWithMetricsOptions = {
  userOverrides?: UserOverrides;
  metrics?: DashboardMetricSeed[];
};

export async function seedDashboardWithMetrics(
  options: SeedDashboardWithMetricsOptions = {},
) {
  const user = await createUserRow(options.userOverrides);
  const metricsToSeed = options.metrics ?? [
    {
      metricOverrides: { name: "DashboardMetricA" },
      logs: [
        {
          logValue: 10,
          loggedAt: new Date("2025-05-01T00:00:00Z"),
        },
        {
          logValue: 15,
          loggedAt: new Date("2025-05-02T00:00:00Z"),
        },
      ],
    },
    {
      metricOverrides: { name: "DashboardMetricB" },
      logs: [
        {
          logValue: 20,
          loggedAt: new Date("2025-05-03T00:00:00Z"),
        },
      ],
      settingsOverrides: {
        displayOptions: {
          showOnDashboard: true,
          priority: 2,
          chartType: "bar",
          color: "#333333",
        },
      },
    },
  ];

  const metrics = [];
  for (const spec of metricsToSeed) {
    metrics.push(
      await seedDashboardMetric({
        user,
        metricOverrides: spec.metricOverrides,
        settingsOverrides: spec.settingsOverrides,
        logs: spec.logs,
        categoryOverrides: spec.categoryOverrides,
      }),
    );
  }

  return { user, metrics };
}
