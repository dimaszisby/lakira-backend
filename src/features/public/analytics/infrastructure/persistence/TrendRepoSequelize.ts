import { models } from "@/infrastructure/db/models.js";
import { Op } from "sequelize";
import type { MetricLog } from "@/features/metric-log/infrastructure/persistence/models/metric-log.sequelize.js";
import type {
  TrendRepository,
  TrendQueryCriteria,
  TrendPoint,
} from "../../application/ports/TrendRepository.js";

export class TrendRepoSequelize implements TrendRepository {
  async findTrendPoints(criteria: TrendQueryCriteria): Promise<TrendPoint[]> {
    const logs = await models.MetricLog.findAll({
      where: {
        metricId: criteria.metricId,
        organizationId: criteria.organizationId,
        loggedAt: { [Op.gte]: criteria.since },
      },
      // A trend is over when values were logged, so a backfilled log lands on its
      // own date. `id` breaks ties (kit deterministic-query-ordering, ADR-0052).
      order: [
        ["loggedAt", "ASC"],
        ["id", "ASC"],
      ],
      attributes: ["id", "loggedAt", "logValue"],
    });

    return logs.map(
      (log: MetricLog): TrendPoint => ({
        date: log.loggedAt,
        value: log.logValue,
      }),
    );
  }
}
