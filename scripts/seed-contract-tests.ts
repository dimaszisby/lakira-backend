import fs from "node:fs/promises";
import path from "node:path";
import type { Transaction } from "sequelize";
import { sequelize, models } from "@/infrastructure/db/models.js";
import { tokenGenerator } from "@/utils/token-generator.js";
import logger from "./logger.js";

const OUTPUT_PATH = path.resolve(process.cwd(), "tmp/contract-seed.json");

const SEED_IDS = {
  primaryUser: "11111111-aaaa-4aaa-8aaa-000000000001",
  secondaryUser: "22222222-bbbb-4bbb-8bbb-000000000002",
  primaryOrg: "00000000-0000-4000-8000-000000000010",
  secondaryOrg: "00000000-0000-4000-8000-000000000020",
  primaryMembership: "00000000-0000-4000-8000-000000000011",
  secondaryMembership: "00000000-0000-4000-8000-000000000021",
  revenueCategory: "33333333-cccc-4ccc-8ccc-000000000003",
  productivityCategory: "44444444-dddd-4ddd-8ddd-000000000004",
  revenueMetric: "55555555-eeee-4eee-8eee-000000000005",
  productivityMetric: "66666666-ffff-4fff-8fff-000000000006",
  revenueMetricSettings: "77777777-aaaa-4aaa-8aaa-000000000007",
  productivityMetricSettings: "88888888-bbbb-4bbb-8bbb-000000000008",
  revenueLogLatest: "99999999-cccc-4ccc-8ccc-000000000009",
  revenueLogOldest: "99999999-cccc-4ccc-8ccc-00000000000a",
  productivityLogLatest: "aaaaaaa1-dddd-4ddd-8ddd-00000000000b",
  productivityLogOldest: "aaaaaaa1-dddd-4ddd-8ddd-00000000000c",
  deletableCategory: "aaaaaaaa-aaaa-4aaa-8aaa-000000000010",
  deletableMetric1: "bbbbbbbb-bbbb-4bbb-8bbb-000000000011",
  deletableMetric2: "bbbbbbbb-bbbb-4bbb-8bbb-000000000012",
  deletableMetric3: "bbbbbbbb-bbbb-4bbb-8bbb-000000000019",
  deletableMetric4: "bbbbbbbb-bbbb-4bbb-8bbb-00000000001a",
  deletableMetricSettings1: "cccccccc-cccc-4ccc-8ccc-000000000013",
  deletableMetricSettings2: "cccccccc-cccc-4ccc-8ccc-000000000014",
  deletableMetricSettings3: "cccccccc-cccc-4ccc-8ccc-00000000001b",
  deletableMetricSettings4: "cccccccc-cccc-4ccc-8ccc-00000000001c",
  deletableLog1: "dddddddd-dddd-4ddd-8ddd-000000000015",
  deletableLog2: "dddddddd-dddd-4ddd-8ddd-000000000016",
  deletableLog3: "dddddddd-dddd-4ddd-8ddd-00000000001d",
  deletableLog4: "dddddddd-dddd-4ddd-8ddd-00000000001e",
  deletableLog5: "dddddddd-dddd-4ddd-8ddd-00000000001f",
  deletableLog6: "dddddddd-dddd-4ddd-8ddd-000000000020",
  settingsFreeMetric1: "eeeeeeee-eeee-4eee-8eee-000000000017",
  settingsFreeMetric2: "eeeeeeee-eeee-4eee-8eee-000000000018",
  settingsFreeMetric3: "eeeeeeee-eeee-4eee-8eee-000000000021",
  settingsFreeMetric4: "eeeeeeee-eeee-4eee-8eee-000000000022",
  settingsFreeMetric5: "eeeeeeee-eeee-4eee-8eee-000000000023",
  settingsFreeMetric6: "eeeeeeee-eeee-4eee-8eee-000000000024",
} as const;

const DELETE_ONLY_METRIC_IDS = [
  "bbbbbbbb-bbbb-4bbb-8bbb-000000000025",
  "bbbbbbbb-bbbb-4bbb-8bbb-000000000026",
  "bbbbbbbb-bbbb-4bbb-8bbb-000000000027",
  "bbbbbbbb-bbbb-4bbb-8bbb-000000000028",
];

const EXTRA_DELETABLE_CATEGORY_IDS = Array.from(
  { length: 120 },
  (_, index) =>
    `aaaaaaaa-aaaa-4aaa-8aaa-${String(30 + index).padStart(12, "0")}`,
);

const EXTRA_DELETABLE_SETTINGS_METRIC_IDS = Array.from(
  { length: 24 },
  (_, index) =>
    `bbbbbbbb-bbbb-4bbb-8bbb-${String(30 + index).padStart(12, "0")}`,
);

const EXTRA_DELETABLE_SETTINGS_IDS = Array.from(
  { length: 24 },
  (_, index) =>
    `cccccccc-cccc-4ccc-8ccc-${String(30 + index).padStart(12, "0")}`,
);

const EXTRA_DELETABLE_LOG_IDS = Array.from(
  { length: 120 },
  (_, index) =>
    `dddddddd-dddd-4ddd-8ddd-${String(100 + index).padStart(12, "0")}`,
);

const EXTRA_SETTINGS_FREE_METRIC_IDS = Array.from(
  { length: 600 },
  (_, index) =>
    `eeeeeeee-eeee-4eee-8eee-${String(25 + index).padStart(12, "0")}`,
);

// Non-owner members of the primary org, for the membership routes (fuzz-organization-routes
// kit). Index 0 is the fixed PATCH target; the rest are consumed one per DELETE.
const MEMBER_USER_IDS = Array.from(
  { length: 41 },
  (_, index) =>
    `f1f1f1f1-f1f1-4f1f-8f1f-${String(1 + index).padStart(12, "0")}`,
);

const MEMBER_MEMBERSHIP_IDS = Array.from(
  { length: 41 },
  (_, index) =>
    `f2f2f2f2-f2f2-4f2f-8f2f-${String(1 + index).padStart(12, "0")}`,
);

const BASE_DATES = {
  oldest: new Date("2024-12-15T00:00:00.000Z"),
  mid: new Date("2024-12-22T00:00:00.000Z"),
  latest: new Date("2025-01-05T00:00:00.000Z"),
};

async function clearTables(transaction: Transaction) {
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
    await qi.bulkDelete(table, {}, { transaction });
  }
}

async function seedData(transaction: Transaction) {
  const now = new Date();

  const primaryUser = await models.User.create(
    {
      id: SEED_IDS.primaryUser,
      email: "contract-primary@lakira.dev",
      username: "contract_primary",
      password: "ContractPrimary!123",
      isPublicProfile: true,
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  const secondaryUser = await models.User.create(
    {
      id: SEED_IDS.secondaryUser,
      email: "contract-secondary@lakira.dev",
      username: "contract_secondary",
      password: "ContractSecondary!123",
      isPublicProfile: true,
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  await models.Organization.create(
    {
      id: SEED_IDS.primaryOrg,
      name: "Primary Org",
      slug: "primary-org",
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  await models.Organization.create(
    {
      id: SEED_IDS.secondaryOrg,
      name: "Secondary Org",
      slug: "secondary-org",
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  await models.Membership.create(
    {
      id: SEED_IDS.primaryMembership,
      userId: primaryUser.id,
      organizationId: SEED_IDS.primaryOrg,
      role: "owner",
      status: "active",
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  await models.Membership.create(
    {
      id: SEED_IDS.secondaryMembership,
      userId: secondaryUser.id,
      organizationId: SEED_IDS.secondaryOrg,
      role: "owner",
      status: "active",
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  for (const [index, userId] of MEMBER_USER_IDS.entries()) {
    await models.User.create(
      {
        id: userId,
        email: `contract-member-${index}@lakira.dev`,
        username: `contract_member_${index}`,
        password: "ContractMember!123",
        isPublicProfile: false,
        createdAt: now,
        updatedAt: now,
      },
      { transaction },
    );
    await models.Membership.create(
      {
        id: MEMBER_MEMBERSHIP_IDS[index],
        userId,
        organizationId: SEED_IDS.primaryOrg,
        role: "member",
        status: "active",
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      { transaction },
    );
  }

  const revenueCategory = await models.MetricCategory.create(
    {
      id: SEED_IDS.revenueCategory,
      userId: primaryUser.id,
      organizationId: SEED_IDS.primaryOrg,
      name: "Revenue",
      color: "#F59E0B",
      icon: "💰",
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  const productivityCategory = await models.MetricCategory.create(
    {
      id: SEED_IDS.productivityCategory,
      userId: primaryUser.id,
      organizationId: SEED_IDS.primaryOrg,
      name: "Productivity",
      color: "#6366F1",
      icon: "⚙️",
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  const deletableCategory = await models.MetricCategory.create(
    {
      id: SEED_IDS.deletableCategory,
      userId: primaryUser.id,
      organizationId: SEED_IDS.primaryOrg,
      name: "Deletable",
      color: "#10B981",
      icon: "🧪",
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  const extraDeletableCategories = [];
  for (const [index, id] of EXTRA_DELETABLE_CATEGORY_IDS.entries()) {
    extraDeletableCategories.push(
      await models.MetricCategory.create(
        {
          id,
          userId: primaryUser.id,
          organizationId: SEED_IDS.primaryOrg,
          name: `Deletable Extra ${index + 1}`,
          color: "#10B981",
          icon: "🧪",
          createdAt: now,
          updatedAt: now,
        },
        { transaction },
      ),
    );
  }

  const revenueMetric = await models.Metric.create(
    {
      id: SEED_IDS.revenueMetric,
      userId: primaryUser.id,
      organizationId: SEED_IDS.primaryOrg,
      categoryId: revenueCategory.id,
      name: "Monthly Recurring Revenue",
      defaultUnit: "USD",
      description: "MRR pulled from finance dashboard",
      isPublic: true,
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  const deletableMetric1 = await models.Metric.create(
    {
      id: SEED_IDS.deletableMetric1,
      userId: primaryUser.id,
      organizationId: SEED_IDS.primaryOrg,
      categoryId: deletableCategory.id,
      name: "Delete Pool Metric 1",
      defaultUnit: "count",
      description: "Used for contract delete tests",
      isPublic: false,
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  const deletableMetric2 = await models.Metric.create(
    {
      id: SEED_IDS.deletableMetric2,
      userId: primaryUser.id,
      organizationId: SEED_IDS.primaryOrg,
      categoryId: deletableCategory.id,
      name: "Delete Pool Metric 2",
      defaultUnit: "count",
      description: "Used for contract delete tests",
      isPublic: false,
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  const deletableMetric3 = await models.Metric.create(
    {
      id: SEED_IDS.deletableMetric3,
      userId: primaryUser.id,
      organizationId: SEED_IDS.primaryOrg,
      categoryId: deletableCategory.id,
      name: "Delete Pool Metric 3",
      defaultUnit: "count",
      description: "Used for contract delete tests",
      isPublic: false,
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  const deletableMetric4 = await models.Metric.create(
    {
      id: SEED_IDS.deletableMetric4,
      userId: primaryUser.id,
      organizationId: SEED_IDS.primaryOrg,
      categoryId: deletableCategory.id,
      name: "Delete Pool Metric 4",
      defaultUnit: "count",
      description: "Used for contract delete tests",
      isPublic: false,
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  const deleteOnlyMetrics = [];
  for (const [index, id] of DELETE_ONLY_METRIC_IDS.entries()) {
    deleteOnlyMetrics.push(
      await models.Metric.create(
        {
          id,
          userId: primaryUser.id,
          organizationId: SEED_IDS.primaryOrg,
          categoryId: deletableCategory.id,
          name: `Delete Only Metric ${index + 1}`,
          defaultUnit: "count",
          description: "Used for contract delete tests",
          isPublic: false,
          createdAt: now,
          updatedAt: now,
        },
        { transaction },
      ),
    );
  }

  const extraDeletableSettingMetrics = [];
  for (const [index, id] of EXTRA_DELETABLE_SETTINGS_METRIC_IDS.entries()) {
    extraDeletableSettingMetrics.push(
      await models.Metric.create(
        {
          id,
          userId: primaryUser.id,
          organizationId: SEED_IDS.primaryOrg,
          categoryId: deletableCategory.id,
          name: `Delete Settings Metric ${index + 1}`,
          defaultUnit: "count",
          description: "Used for contract settings delete tests",
          isPublic: false,
          createdAt: now,
          updatedAt: now,
        },
        { transaction },
      ),
    );
  }

  const settingsFreeMetric1 = await models.Metric.create(
    {
      id: SEED_IDS.settingsFreeMetric1,
      userId: primaryUser.id,
      organizationId: SEED_IDS.primaryOrg,
      categoryId: deletableCategory.id,
      name: "Settings Pool Metric 1",
      defaultUnit: "count",
      description: "Used for contract settings create tests",
      isPublic: false,
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  const settingsFreeMetric2 = await models.Metric.create(
    {
      id: SEED_IDS.settingsFreeMetric2,
      userId: primaryUser.id,
      organizationId: SEED_IDS.primaryOrg,
      categoryId: deletableCategory.id,
      name: "Settings Pool Metric 2",
      defaultUnit: "count",
      description: "Used for contract settings create tests",
      isPublic: false,
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  const settingsFreeMetric3 = await models.Metric.create(
    {
      id: SEED_IDS.settingsFreeMetric3,
      userId: primaryUser.id,
      organizationId: SEED_IDS.primaryOrg,
      categoryId: deletableCategory.id,
      name: "Settings Pool Metric 3",
      defaultUnit: "count",
      description: "Used for contract settings create tests",
      isPublic: false,
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  const settingsFreeMetric4 = await models.Metric.create(
    {
      id: SEED_IDS.settingsFreeMetric4,
      userId: primaryUser.id,
      organizationId: SEED_IDS.primaryOrg,
      categoryId: deletableCategory.id,
      name: "Settings Pool Metric 4",
      defaultUnit: "count",
      description: "Used for contract settings create tests",
      isPublic: false,
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  const settingsFreeMetric5 = await models.Metric.create(
    {
      id: SEED_IDS.settingsFreeMetric5,
      userId: primaryUser.id,
      organizationId: SEED_IDS.primaryOrg,
      categoryId: deletableCategory.id,
      name: "Settings Pool Metric 5",
      defaultUnit: "count",
      description: "Used for contract settings create tests",
      isPublic: false,
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  const settingsFreeMetric6 = await models.Metric.create(
    {
      id: SEED_IDS.settingsFreeMetric6,
      userId: primaryUser.id,
      organizationId: SEED_IDS.primaryOrg,
      categoryId: deletableCategory.id,
      name: "Settings Pool Metric 6",
      defaultUnit: "count",
      description: "Used for contract settings create tests",
      isPublic: false,
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  const extraSettingsFreeMetrics = [];
  for (const [index, id] of EXTRA_SETTINGS_FREE_METRIC_IDS.entries()) {
    extraSettingsFreeMetrics.push(
      await models.Metric.create(
        {
          id,
          userId: primaryUser.id,
          organizationId: SEED_IDS.primaryOrg,
          categoryId: deletableCategory.id,
          name: `Settings Pool Metric ${index + 7}`,
          defaultUnit: "count",
          description: "Used for contract settings create tests",
          isPublic: false,
          createdAt: now,
          updatedAt: now,
        },
        { transaction },
      ),
    );
  }

  const productivityMetric = await models.Metric.create(
    {
      id: SEED_IDS.productivityMetric,
      userId: primaryUser.id,
      organizationId: SEED_IDS.primaryOrg,
      categoryId: productivityCategory.id,
      name: "Daily Active Builders",
      defaultUnit: "count",
      description: "Number of active makers per day",
      isPublic: true,
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  const revenueMetricSettings = await models.MetricSettings.create(
    {
      id: SEED_IDS.revenueMetricSettings,
      metricId: revenueMetric.id,
      organizationId: SEED_IDS.primaryOrg,
      goalEnabled: true,
      goalType: "cumulative",
      goalValue: 150000,
      timeFrameEnabled: true,
      startDate: new Date("2024-12-01"),
      deadlineDate: new Date("2025-03-31"),
      alertEnabled: true,
      alertThresholds: 80,
      displayOptions: {
        showOnDashboard: true,
        priority: 1,
        chartType: "area",
        color: "#F59E0B",
      },
      isAchieved: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  const productivityMetricSettings = await models.MetricSettings.create(
    {
      id: SEED_IDS.productivityMetricSettings,
      metricId: productivityMetric.id,
      organizationId: SEED_IDS.primaryOrg,
      goalEnabled: false,
      goalType: null,
      goalValue: null,
      timeFrameEnabled: false,
      startDate: null,
      deadlineDate: null,
      alertEnabled: false,
      alertThresholds: null,
      displayOptions: {
        showOnDashboard: true,
        priority: 2,
        chartType: "line",
        color: "#6366F1",
      },
      isAchieved: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  const deletableMetricSettings1 = await models.MetricSettings.create(
    {
      id: SEED_IDS.deletableMetricSettings1,
      metricId: deletableMetric1.id,
      organizationId: SEED_IDS.primaryOrg,
      goalEnabled: false,
      goalType: null,
      goalValue: null,
      timeFrameEnabled: false,
      startDate: null,
      deadlineDate: null,
      alertEnabled: false,
      alertThresholds: null,
      displayOptions: {
        showOnDashboard: false,
        priority: 10,
        chartType: "line",
        color: "#10B981",
      },
      isAchieved: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  const deletableMetricSettings2 = await models.MetricSettings.create(
    {
      id: SEED_IDS.deletableMetricSettings2,
      metricId: deletableMetric2.id,
      organizationId: SEED_IDS.primaryOrg,
      goalEnabled: false,
      goalType: null,
      goalValue: null,
      timeFrameEnabled: false,
      startDate: null,
      deadlineDate: null,
      alertEnabled: false,
      alertThresholds: null,
      displayOptions: {
        showOnDashboard: false,
        priority: 11,
        chartType: "line",
        color: "#10B981",
      },
      isAchieved: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  const deletableMetricSettings3 = await models.MetricSettings.create(
    {
      id: SEED_IDS.deletableMetricSettings3,
      metricId: deletableMetric3.id,
      organizationId: SEED_IDS.primaryOrg,
      goalEnabled: false,
      goalType: null,
      goalValue: null,
      timeFrameEnabled: false,
      startDate: null,
      deadlineDate: null,
      alertEnabled: false,
      alertThresholds: null,
      displayOptions: {
        showOnDashboard: false,
        priority: 12,
        chartType: "line",
        color: "#10B981",
      },
      isAchieved: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  const deletableMetricSettings4 = await models.MetricSettings.create(
    {
      id: SEED_IDS.deletableMetricSettings4,
      metricId: deletableMetric4.id,
      organizationId: SEED_IDS.primaryOrg,
      goalEnabled: false,
      goalType: null,
      goalValue: null,
      timeFrameEnabled: false,
      startDate: null,
      deadlineDate: null,
      alertEnabled: false,
      alertThresholds: null,
      displayOptions: {
        showOnDashboard: false,
        priority: 13,
        chartType: "line",
        color: "#10B981",
      },
      isAchieved: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    { transaction },
  );

  const extraDeletableSettings = [];
  for (const [index, id] of EXTRA_DELETABLE_SETTINGS_IDS.entries()) {
    const metric = extraDeletableSettingMetrics[index];
    if (!metric) continue;
    extraDeletableSettings.push(
      await models.MetricSettings.create(
        {
          id,
          metricId: metric.id,
          organizationId: SEED_IDS.primaryOrg,
          goalEnabled: false,
          goalType: null,
          goalValue: null,
          timeFrameEnabled: false,
          startDate: null,
          deadlineDate: null,
          alertEnabled: false,
          alertThresholds: null,
          displayOptions: {
            showOnDashboard: false,
            priority: 20 + index,
            chartType: "line",
            color: "#10B981",
          },
          isAchieved: false,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        { transaction },
      ),
    );
  }

  const revenueLogs = await models.MetricLog.bulkCreate(
    [
      {
        id: SEED_IDS.revenueLogOldest,
        metricId: revenueMetric.id,
        organizationId: SEED_IDS.primaryOrg,
        logValue: 120000,
        type: "manual",
        loggedAt: BASE_DATES.oldest,
        createdAt: BASE_DATES.oldest,
        updatedAt: BASE_DATES.oldest,
      },
      {
        id: SEED_IDS.revenueLogLatest,
        metricId: revenueMetric.id,
        organizationId: SEED_IDS.primaryOrg,
        logValue: 132500,
        type: "manual",
        loggedAt: BASE_DATES.latest,
        createdAt: BASE_DATES.latest,
        updatedAt: BASE_DATES.latest,
      },
    ],
    { transaction },
  );

  type SeedMetricLogEntry = {
    id: string;
    metricId: string;
    organizationId: string;
    logValue: number;
    type: "manual" | "automatic";
    loggedAt: Date;
    createdAt: Date;
    updatedAt: Date;
  };

  const deletableLogEntries: SeedMetricLogEntry[] = [
    {
      id: SEED_IDS.deletableLog1,
      metricId: deletableMetric1.id,
      organizationId: SEED_IDS.primaryOrg,
      logValue: 10,
      type: "manual",
      loggedAt: BASE_DATES.mid,
      createdAt: BASE_DATES.mid,
      updatedAt: BASE_DATES.mid,
    },
    {
      id: SEED_IDS.deletableLog2,
      metricId: deletableMetric2.id,
      organizationId: SEED_IDS.primaryOrg,
      logValue: 20,
      type: "manual",
      loggedAt: BASE_DATES.mid,
      createdAt: BASE_DATES.mid,
      updatedAt: BASE_DATES.mid,
    },
    {
      id: SEED_IDS.deletableLog3,
      metricId: deletableMetric1.id,
      organizationId: SEED_IDS.primaryOrg,
      logValue: 30,
      type: "manual",
      loggedAt: BASE_DATES.latest,
      createdAt: BASE_DATES.latest,
      updatedAt: BASE_DATES.latest,
    },
    {
      id: SEED_IDS.deletableLog4,
      metricId: deletableMetric2.id,
      organizationId: SEED_IDS.primaryOrg,
      logValue: 40,
      type: "manual",
      loggedAt: BASE_DATES.latest,
      createdAt: BASE_DATES.latest,
      updatedAt: BASE_DATES.latest,
    },
    {
      id: SEED_IDS.deletableLog5,
      metricId: deletableMetric3.id,
      organizationId: SEED_IDS.primaryOrg,
      logValue: 50,
      type: "manual",
      loggedAt: BASE_DATES.mid,
      createdAt: BASE_DATES.mid,
      updatedAt: BASE_DATES.mid,
    },
    {
      id: SEED_IDS.deletableLog6,
      metricId: deletableMetric4.id,
      organizationId: SEED_IDS.primaryOrg,
      logValue: 60,
      type: "manual",
      loggedAt: BASE_DATES.mid,
      createdAt: BASE_DATES.mid,
      updatedAt: BASE_DATES.mid,
    },
  ];

  const deletableLogMetrics = [
    deletableMetric1,
    deletableMetric2,
    deletableMetric3,
    deletableMetric4,
  ];
  for (const [index, id] of EXTRA_DELETABLE_LOG_IDS.entries()) {
    const metric = deletableLogMetrics[index % deletableLogMetrics.length];
    if (!metric) continue;
    const loggedAt = new Date(
      BASE_DATES.oldest.getTime() + (index + 1) * 60 * 1000,
    );
    deletableLogEntries.push({
      id,
      metricId: metric.id,
      organizationId: SEED_IDS.primaryOrg,
      logValue: 100 + index,
      type: "manual",
      loggedAt,
      createdAt: loggedAt,
      updatedAt: loggedAt,
    });
  }

  const deletableLogs = await models.MetricLog.bulkCreate(deletableLogEntries, {
    transaction,
  });

  const productivityLogs = await models.MetricLog.bulkCreate(
    [
      {
        id: SEED_IDS.productivityLogOldest,
        metricId: productivityMetric.id,
        organizationId: SEED_IDS.primaryOrg,
        logValue: 65,
        type: "manual",
        loggedAt: BASE_DATES.oldest,
        createdAt: BASE_DATES.oldest,
        updatedAt: BASE_DATES.oldest,
      },
      {
        id: SEED_IDS.productivityLogLatest,
        metricId: productivityMetric.id,
        organizationId: SEED_IDS.primaryOrg,
        logValue: 92,
        type: "manual",
        loggedAt: BASE_DATES.latest,
        createdAt: BASE_DATES.latest,
        updatedAt: BASE_DATES.latest,
      },
    ],
    { transaction },
  );

  return {
    primaryUser,
    secondaryUser,
    revenueCategory,
    productivityCategory,
    revenueMetric,
    productivityMetric,
    deletableCategory,
    extraDeletableCategories,
    deletableMetric1,
    deletableMetric2,
    deletableMetric3,
    deletableMetric4,
    deleteOnlyMetrics,
    extraDeletableSettingMetrics,
    settingsFreeMetric1,
    settingsFreeMetric2,
    settingsFreeMetric3,
    settingsFreeMetric4,
    settingsFreeMetric5,
    settingsFreeMetric6,
    extraSettingsFreeMetrics,
    revenueMetricSettings,
    productivityMetricSettings,
    deletableMetricSettings1,
    deletableMetricSettings2,
    deletableMetricSettings3,
    deletableMetricSettings4,
    extraDeletableSettings,
    revenueLogs,
    deletableLogs,
    productivityLogs,
  };
}

async function writeSeedOutput(payload: Record<string, unknown>) {
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2));
}

async function main() {
  logger.info("[seed-contract-tests] Resetting contract-test fixtures…");

  const result = await sequelize.transaction(async (transaction) => {
    await clearTables(transaction);
    return seedData(transaction);
  });

  const primaryToken = tokenGenerator({
    id: result.primaryUser.id,
    email: result.primaryUser.email,
    organizationId: SEED_IDS.primaryOrg,
  });
  const secondaryToken = tokenGenerator({
    id: result.secondaryUser.id,
    email: result.secondaryUser.email,
    organizationId: SEED_IDS.secondaryOrg,
  });

  const output = {
    generatedAt: new Date().toISOString(),
    primaryUser: {
      id: result.primaryUser.id,
      // The organization the token is scoped to; the hook uses it for /organizations/{id}/...
      organizationId: SEED_IDS.primaryOrg,
      email: result.primaryUser.email,
      username: result.primaryUser.username,
      password: "ContractPrimary!123",
      token: primaryToken,
    },
    secondaryUser: {
      id: result.secondaryUser.id,
      email: result.secondaryUser.email,
      username: result.secondaryUser.username,
      password: "ContractSecondary!123",
      token: secondaryToken,
    },
    categories: {
      revenue: {
        id: result.revenueCategory.id,
        name: result.revenueCategory.name,
        color: result.revenueCategory.color,
        icon: result.revenueCategory.icon,
      },
      productivity: {
        id: result.productivityCategory.id,
        name: result.productivityCategory.name,
        color: result.productivityCategory.color,
        icon: result.productivityCategory.icon,
      },
    },
    metrics: {
      revenue: {
        id: result.revenueMetric.id,
        settingsId: result.revenueMetricSettings.id,
        latestLogId: result.revenueLogs[1]?.id ?? null,
        latestValue: result.revenueLogs[1]?.logValue ?? null,
      },
      productivity: {
        id: result.productivityMetric.id,
        settingsId: result.productivityMetricSettings.id,
        latestLogId: result.productivityLogs[1]?.id ?? null,
        latestValue: result.productivityLogs[1]?.logValue ?? null,
      },
    },
    deletable: {
      categoryIds: [
        result.deletableCategory.id,
        ...result.extraDeletableCategories.map((category) => category.id),
      ],
      metricIds: result.deleteOnlyMetrics.map((metric) => metric.id),
      metricIdsWithoutSettings: [
        result.settingsFreeMetric1.id,
        result.settingsFreeMetric2.id,
        result.settingsFreeMetric3.id,
        result.settingsFreeMetric4.id,
        result.settingsFreeMetric5.id,
        result.settingsFreeMetric6.id,
        ...result.extraSettingsFreeMetrics.map((metric) => metric.id),
      ],
      metricSettingsIds: [
        result.deletableMetricSettings1.id,
        result.deletableMetricSettings2.id,
        result.deletableMetricSettings3.id,
        result.deletableMetricSettings4.id,
        ...result.extraDeletableSettings.map((settings) => settings.id),
      ],
      metricLogIds: result.deletableLogs
        .map((log) => log?.id ?? null)
        .filter(Boolean),
      membershipIds: MEMBER_MEMBERSHIP_IDS.slice(1),
    },
    // A non-owner membership in the primary org that PATCH may re-role repeatedly.
    patchMembershipId: MEMBER_MEMBERSHIP_IDS[0],
  };

  await writeSeedOutput(output);

  logger.info(
    `[seed-contract-tests] Completed. Output written to ${OUTPUT_PATH}`,
  );
}

main()
  .catch((error) => {
    logger.error("[seed-contract-tests] Failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
