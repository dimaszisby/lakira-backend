import {
  fn,
  col,
  Op,
  type FindOptions,
  type Includeable,
  type WhereOptions,
} from "sequelize";
import { models } from "@/infrastructure/db/models.js";
import type { MetricLogAttributes } from "../models/metric-log.sequelize.js";
import type {
  MetricLogStatsPort,
  MetricLogStatsCriteria,
  MetricLogStats,
} from "../../../application/ports/MetricLogStatsPort.js";

// With `raw: true`, Postgres's AVG, MIN and MAX of a FLOAT column come back as numbers, null
// over no rows, and COUNT(*) as a bigint string.
type AggregateRow = {
  average: number | null;
  min: number | null;
  max: number | null;
  count: string | number;
};
const EMPTY_STATS: MetricLogStats = { average: 0, min: 0, max: 0 };

/**
 * The stats are one aggregate row, computed by the database (ADR-0079). They were computed in
 * JavaScript over every log in scope, and spreading 200,000 values into `Math.min` overflowed the
 * call stack (audit 2026-10-20 X20). The scoping is the tenant boundary and is unchanged: a named
 * metric by metric and organization (its ownership is checked first by the query), otherwise the
 * organization and an inner join to the caller's own metrics.
 */
export class MetricLogStatsRepoSequelize implements MetricLogStatsPort {
  async computeStats(
    criteria: MetricLogStatsCriteria,
  ): Promise<MetricLogStats> {
    const where: WhereOptions<MetricLogAttributes> = criteria.metricId
      ? { metricId: criteria.metricId, organizationId: criteria.organizationId }
      : { organizationId: criteria.organizationId };

    // Half-open, by when the value was measured (ADR-0052).
    if (criteria.from || criteria.to) {
      Object.assign(where, {
        loggedAt: {
          ...(criteria.from ? { [Op.gte]: criteria.from } : {}),
          ...(criteria.to ? { [Op.lt]: criteria.to } : {}),
        },
      });
    }

    const query: FindOptions<MetricLogAttributes> = {
      where,
      attributes: [
        [fn("AVG", col("log_value")), "average"],
        [fn("MIN", col("log_value")), "min"],
        [fn("MAX", col("log_value")), "max"],
        [fn("COUNT", col("MetricLog.id")), "count"],
      ],
      raw: true,
    };

    if (!criteria.metricId) {
      const metricInclude: Includeable = {
        model: models.Metric,
        as: "metric",
        attributes: [],
        required: true,
        where: {
          userId: criteria.userId,
          organizationId: criteria.organizationId,
        },
      };
      query.include = [metricInclude];
    }

    const row = (await models.MetricLog.findOne(
      query,
    )) as unknown as AggregateRow | null;
    if (!row || Number(row.count) === 0) return EMPTY_STATS;

    return {
      average: Number(row.average),
      min: Number(row.min),
      max: Number(row.max),
    };
  }
}
