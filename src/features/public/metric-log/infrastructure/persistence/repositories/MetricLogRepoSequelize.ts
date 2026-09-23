import { Op, Transaction } from "sequelize";
import { models } from "@/infrastructure/db/models.js";
import AppError from "@/utils/AppError.js";
import type { PersistenceTransaction } from "@/shared/application/ports/MessageIdempotencyPort.js";
import {
  CreateMetricLogDTO,
  MetricLogRepository,
} from "../../../domain/repositories/MetricLogRepository.js";
import { MetricLog } from "../../../domain/entities/MetricLog.js";
import { MetricLogRow, toDomain } from "../mappers/MetricLogMapper.js";
import type { MetricLog as MetricLogModel } from "../models/metric-log.sequelize.js";

function toRow(model: MetricLogModel): MetricLogRow {
  return {
    id: model.id,
    metricId: model.metricId,
    logValue: model.logValue,
    type: model.type as "manual" | "automatic",
    loggedAt: model.loggedAt!,
    createdAt: model.createdAt!,
    updatedAt: model.updatedAt!,
  };
}

export class MetricLogRepoSequelize implements MetricLogRepository {
  async existsAtTimestamp(
    organizationId: string,
    metricId: string,
    loggedAt: Date,
    excludeLogId?: string,
  ): Promise<boolean> {
    const where: {
      organizationId: string;
      metricId: string;
      loggedAt: Date;
      id?: Record<typeof Op.ne, string>;
    } = { organizationId, metricId, loggedAt };
    if (excludeLogId) {
      where.id = { [Op.ne]: excludeLogId };
    }

    const count = await models.MetricLog.count({
      where,
    });
    return count > 0;
  }

  async create(
    data: CreateMetricLogDTO,
    tx?: PersistenceTransaction,
  ): Promise<MetricLog> {
    const transaction = tx as Transaction | undefined;
    const created = await models.MetricLog.create(
      {
        metricId: data.metricId,
        organizationId: data.organizationId,
        logValue: data.logValue,
        type: data.type,
        loggedAt: data.loggedAt,
      },
      { transaction },
    );

    await created.reload({ transaction });
    return toDomain(toRow(created));
  }

  async findById(
    userId: string,
    organizationId: string,
    logId: string,
  ): Promise<MetricLog | null> {
    const log = await models.MetricLog.findOne({
      where: { id: logId, organizationId },
      include: [
        {
          model: models.Metric,
          as: "metric",
          attributes: ["userId"],
          required: true,
          where: { userId, organizationId },
        },
      ],
    });

    if (!log) return null;
    return toDomain(toRow(log));
  }

  async save(organizationId: string, log: MetricLog): Promise<MetricLog> {
    const [affectedCount, rows] = await models.MetricLog.update(
      { logValue: log.logValue, type: log.type, loggedAt: log.loggedAt },
      { where: { id: log.id, organizationId }, returning: true },
    );
    if (affectedCount === 0) throw new AppError("Log not found", 404);
    return toDomain(toRow(rows[0]));
  }

  async delete(organizationId: string, log: MetricLog): Promise<void> {
    await models.MetricLog.destroy({
      where: { id: log.id, organizationId },
    });
  }
}
