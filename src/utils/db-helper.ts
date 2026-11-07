import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "@/shared/domain/errors/DomainError.js";
import { models } from "@/infrastructure/db/models.js";

import type { Metric } from "@/features/metric/infrastructure/persistence/models/metric.sequelize.js";

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
