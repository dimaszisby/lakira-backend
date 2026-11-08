import { Metric } from "../models/metric.sequelize.js";
import { MetricCategory } from "@/features/metric-category/infrastructure/persistence/models/metric-category.sequelize.js";
import {
  toMetricCategoryDomain,
  type MetricCategoryRow,
} from "@/features/metric-category/public.js";
import { MetricSettings } from "@/features/metric-settings/infrastructure/persistence/models/metric-settings.sequelize.js";
import { MetricLog } from "@/features/metric-log/infrastructure/persistence/models/metric-log.sequelize.js";
import {
  MetricDomain,
  MetricDomainExtended,
  MetricLibraryDomain,
  MetricLibraryCategoryInfoDomain,
} from "../../../domain/metric.domain.js";
import logger from "@/utils/logger.js";
import AppError from "@/utils/AppError.js";
import { toDomainMetricSettings } from "@/features/metric-settings/public.js";
import { toDomainMetricLog } from "@/features/metric-log/public.js";

const toCategoryRow = (
  category: Partial<MetricCategoryRow>,
): MetricCategoryRow => ({
  id: category.id ?? "",
  userId: category.userId ?? "",
  name: category.name ?? "",
  color: category.color ?? "#E897A3",
  icon: category.icon ?? "📁",
  createdAt: category.createdAt ? new Date(category.createdAt) : new Date(0),
  updatedAt: category.updatedAt
    ? new Date(category.updatedAt)
    : category.createdAt
      ? new Date(category.createdAt)
      : new Date(0),
  metricCount: Number(category.metricCount ?? 0),
});

const validateUserId = (userId: string | null | undefined) => {
  if (!userId) {
    logger.error("Metric object missing userId");
    throw new AppError(
      "Metric is missing the required userId. This indicates a data integrity issue.",
      500,
    );
  }
  return userId;
};

export const toDomainMetric = (metric: Metric): MetricDomain => {
  validateUserId(metric.userId);

  return {
    id: metric.id,
    userId: metric.userId,
    categoryId: metric.categoryId,
    originalMetricId: metric.originalMetricId,
    name: metric.name,
    description: metric.description,
    defaultUnit: metric.defaultUnit,
    isPublic: metric.isPublic,
    deletedAt: metric.deletedAt ?? null,
    createdAt: metric.createdAt!,
    updatedAt: metric.updatedAt!,
  };
};

/**
 * The `logCount` a list query computes. A Sequelize row holds a computed column
 * only in its dataValues, readable through `get`; as a property it is undefined,
 * so every metric listed with 0 (#251). A plain object carries it as a property.
 */
export const logCountOf = (row: object): number => {
  const value =
    typeof (row as { get?: unknown }).get === "function"
      ? (row as { get: (key: string) => unknown }).get("logCount")
      : (row as { logCount?: unknown }).logCount;
  return Number((value as number | string | undefined) ?? 0);
};

export const toDomainMetricLibrary = (
  metric: MetricWithAssociations & { logCount?: number | string },
): MetricLibraryDomain => {
  validateUserId(metric.userId);

  const rawCategory = metric.MetricCategory ?? metric.category ?? null;
  const categoryDomain = rawCategory ? toDomainCategoryInfo(rawCategory) : null;
  const logCount = logCountOf(metric);

  return {
    id: metric.id,
    name: metric.name,
    description: metric.description,
    defaultUnit: metric.defaultUnit,
    isPublic: metric.isPublic,
    category: categoryDomain,
    goalType: metric?.MetricSettings?.goalType ?? "Not Set",
    createdAt: metric.createdAt!,
    updatedAt: metric.updatedAt!,
    logCount,
  };
};

const toDomainCategoryInfo = (
  category: MetricCategory | MetricCategoryRow,
): MetricLibraryCategoryInfoDomain => {
  return {
    id: category.id,
    name: category.name,
    icon: category.icon,
    color: category.color,
  };
};

type MetricWithAssociations = Metric & {
  MetricCategory?: MetricCategory | MetricCategoryRow | null;
  category?: MetricCategory | MetricCategoryRow | null;
  MetricSettings?: MetricSettings | null;
  settings?: MetricSettings | null;
  MetricLogs?: MetricLog[] | null;
  logs?: MetricLog[] | null;
  logCount?: number | string;
};

export const toExtendedMetricDomain = (
  metric: MetricWithAssociations,
): MetricDomainExtended => {
  const domain = toDomainMetric(metric);

  const rawCategory = metric.MetricCategory ?? metric.category ?? null;
  const categoryDomain = rawCategory
    ? toMetricCategoryDomain(toCategoryRow(rawCategory))
    : null;

  const rawSettings = metric.MetricSettings ?? metric.settings ?? null;
  const settingsDomain = rawSettings
    ? toDomainMetricSettings(rawSettings)
    : null;

  const rawLogs = metric.MetricLogs ?? metric.logs ?? null;
  const logsDomain = rawLogs ? rawLogs.map(toDomainMetricLog) : null;

  return {
    ...domain,
    category: categoryDomain,
    settings: settingsDomain,
    logs: logsDomain,
  };
};
