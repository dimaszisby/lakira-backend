import AppError from "./AppError.js";
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "@/shared/domain/errors/DomainError.js";
import { models } from "@/infrastructure/db/models.js";

import type { Metric } from "@/features/metric/infrastructure/persistence/models/metric.sequelize.js";
import type { MetricCategory } from "@/features/metric-category/infrastructure/persistence/models/metric-category.sequelize.js";
import type { MetricSettings } from "@/features/metric-settings/infrastructure/persistence/models/metric-settings.sequelize.js";
import type { MetricLog } from "@/features/metric-log/infrastructure/persistence/models/metric-log.sequelize.js";

/**
 * * Utility function to validate if a metric exists and owned by the requesting user
 * @param userId - The ID of the user who owns the metric
 * @param metricId - The ID of the metric
 * @throws {DomainError} If the metric does not exist or is not the user's. An
 *   application port reaches this, so it speaks the application's errors
 *   (application-errors D-03).
 */
export const validateMetricAccess = async (
  userId: string,
  organizationId: string,
  metricId: string,
): Promise<Metric> => {
  if (!userId) {
    throw new UnauthorizedError("User not authenticated");
  }

  const metric = await models.Metric.findOne({
    where: { id: metricId, organizationId },
    attributes: ["id", "userId", "organizationId"],
  });

  if (!metric) {
    throw new NotFoundError("Metric not found");
  }

  if (metric.userId !== userId) {
    throw new ForbiddenError("Unauthorized access to metric");
  }

  return metric;
};

/**
 * * Utility function to validate if a metric category exists and owned by the requesting user
 * @param userId - The ID of the user who owns the metric
 * @param categoryId - The ID of the metric category
 * @throws {AppError} If metric does not exist
 */
export const validateMetricCategoryAccess = async (
  userId: string,
  organizationId: string,
  categoryId: string,
): Promise<MetricCategory> => {
  const metricCategory = await models.MetricCategory.findOne({
    where: { id: categoryId, organizationId },
    attributes: ["id", "userId", "organizationId"],
  });
  if (!metricCategory) {
    throw new AppError("Metric Category not found", 404);
  }
  if (metricCategory.userId !== userId) {
    throw new AppError("Unauthorized access to metric category", 403);
  }
  return metricCategory;
};

/**
 * * Helpers for finding owned entities
 * Includes: Metric, Category, Settings, and Log
 */

/**
 * * Metric
 * Helper function to find a metric owned by the user
 * @param userId - The ID of the user who owns the metric
 * @param metricId - The ID of the metric
 * @returns metric sequelize instance
 */
export const findOwnedMetric = async (
  userId: string,
  organizationId: string,
  metricId: string,
): Promise<Metric> => {
  await validateMetricAccess(userId, organizationId, metricId);

  const metric = await models.Metric.findOne({
    where: { id: metricId, userId, organizationId },
  });
  if (!metric) throw new AppError("Metric not found", 404);

  return metric;
};

/**
 * * Metric Category
 * Helper function to find a metric category owned by the user
 * @param userId - The ID of the usr who owns the metric category
 * @param categoryId - The ID of the metric category
 * @returns category sequelize instance
 */
export const findOwnedCategory = async (
  userId: string,
  organizationId: string,
  categoryId: string,
): Promise<MetricCategory> => {
  await validateMetricCategoryAccess(userId, organizationId, categoryId);

  const category = await models.MetricCategory.findOne({
    where: { id: categoryId, userId, organizationId },
  });
  if (!category) throw new AppError("Category not found", 404);

  return category;
};

/**
 * * Metric Settings
 * Helper function to find a metric settings owned by the user
 * @param userId - The ID of the user who owns the metric
 * @param metricId - The ID of the metric
 * @param settingsId - the ID of the settings
 * @returns metric settings sequelize instance
 */
export const findOwnedMetricSettings = async (
  userId: string,
  organizationId: string,
  settingsId: string,
): Promise<MetricSettings> => {
  const settings = await models.MetricSettings.findOne({
    where: { id: settingsId, organizationId },
    include: [
      {
        model: models.Metric,
        as: "metric",
        attributes: ["id", "userId", "isPublic"],
        where: { userId, organizationId },
      },
    ],
  });
  if (!settings) throw new AppError("Metric Settings not found", 404);

  return settings;
};

/**
 * * Metric Log
 * Helper function to find a metric log owned by the user
 * @param userId - The ID of the user who owns the metric
 * @param metricId - The ID of the metric
 * @param logId - the ID of the log
 * @returns metric log sequelize instance
 */
export const findOwnedMetricLog = async (
  userId: string,
  organizationId: string,
  logId: string,
): Promise<MetricLog> => {
  const log = await models.MetricLog.findOne({
    where: { id: logId, organizationId },
    include: [
      {
        model: models.Metric,
        as: "metric",
        attributes: ["id", "userId", "isPublic"],
        where: { userId, organizationId },
      },
    ],
  });
  if (!log) throw new AppError("Metric Log not found", 404);

  return log;
};
