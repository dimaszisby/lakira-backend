import { models } from "@/infrastructure/db/models.js";
import { InstanceError, Op, Sequelize, Transaction } from "sequelize";
import {
  CreateMetricDTO,
  MetricRepository,
} from "../../../domain/repositories/MetricRepository.js";
import { Metric } from "../../../domain/entities/Metric.js";
import type {} from "@/shared/domain/PersistenceTransaction.js";
import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";
import { MetricRow, toDomain } from "../mappers/MetricMapper.js";
import AppError from "@/utils/AppError.js";

export class MetricRepoSequelize implements MetricRepository {
  async existsByName(
    userId: string,
    organizationId: string,
    name: string,
  ): Promise<boolean> {
    const normalized = name.trim().toLowerCase();
    const count = await models.Metric.count({
      where: {
        userId,
        organizationId,
        [Op.and]: Sequelize.where(
          Sequelize.fn("lower", Sequelize.col("name")),
          normalized,
        ),
      },
    });
    return count > 0;
  }

  async categoryExists(
    userId: string,
    organizationId: string,
    categoryId: string,
  ): Promise<boolean> {
    const count = await models.MetricCategory.count({
      where: { userId, organizationId, id: categoryId },
    });
    return count > 0;
  }

  // Cross-org: intentionally unscoped — allows referencing public metrics from any org for cloning.
  async originalMetricExists(
    userId: string,
    metricId: string,
  ): Promise<boolean> {
    const count = await models.Metric.count({
      where: {
        id: metricId,
        [Op.or]: [{ isPublic: true }, { userId }],
      },
    });
    return count > 0;
  }

  async create(
    data: CreateMetricDTO,
    tx: PersistenceTransaction,
  ): Promise<Metric> {
    const transaction = tx as Transaction;
    const created = await models.Metric.create(
      {
        userId: data.userId,
        organizationId: data.organizationId,
        categoryId: data.categoryId ?? null,
        originalMetricId: data.originalMetricId ?? null,
        name: data.name,
        description: data.description ?? null,
        defaultUnit: data.defaultUnit,
        isPublic: data.isPublic,
      },
      { transaction },
    );

    await created.reload({ transaction });

    const row: MetricRow = {
      id: created.id,
      userId: created.userId,
      categoryId: created.categoryId,
      originalMetricId: created.originalMetricId,
      name: created.name,
      description: created.description,
      defaultUnit: created.defaultUnit,
      isPublic: created.isPublic,
      createdAt: created.createdAt!,
      updatedAt: created.updatedAt!,
      deletedAt: created.deletedAt ?? null,
    };

    return toDomain(row);
  }

  async findOwnedById(
    userId: string,
    organizationId: string,
    metricId: string,
  ): Promise<Metric> {
    const metric = await models.Metric.findOne({
      where: { id: metricId, userId, organizationId },
    });
    if (!metric) {
      throw new AppError("Metric not found", 404);
    }

    const row: MetricRow = {
      id: metric.id,
      userId: metric.userId,
      categoryId: metric.categoryId,
      originalMetricId: metric.originalMetricId,
      name: metric.name,
      description: metric.description,
      defaultUnit: metric.defaultUnit,
      isPublic: metric.isPublic,
      createdAt: metric.createdAt!,
      updatedAt: metric.updatedAt!,
      deletedAt: metric.deletedAt ?? null,
    };

    return toDomain(row);
  }

  async save(organizationId: string, metric: Metric): Promise<Metric> {
    const instance = await models.Metric.findOne({
      where: { id: metric.id, userId: metric.userId, organizationId },
    });
    if (!instance) throw new AppError("Metric not found", 404);

    const snapshot = metric.snapshot();
    await instance.update({
      name: snapshot.name,
      description: snapshot.description,
      defaultUnit: snapshot.defaultUnit,
      categoryId: snapshot.categoryId,
      originalMetricId: snapshot.originalMetricId ?? null,
      isPublic: snapshot.isPublic,
    });
    try {
      await instance.reload();
    } catch (error) {
      if (error instanceof InstanceError) {
        throw new AppError("Metric not found", 404);
      }
      throw error;
    }

    return toDomain({
      id: instance.id,
      userId: instance.userId,
      categoryId: instance.categoryId,
      originalMetricId: instance.originalMetricId,
      name: instance.name,
      description: instance.description,
      defaultUnit: instance.defaultUnit,
      isPublic: instance.isPublic,
      createdAt: instance.createdAt!,
      updatedAt: instance.updatedAt!,
      deletedAt: instance.deletedAt ?? null,
    });
  }

  async delete(organizationId: string, metric: Metric): Promise<void> {
    const instance = await models.Metric.findOne({
      where: { id: metric.id, userId: metric.userId, organizationId },
    });
    if (!instance) throw new AppError("Metric not found", 404);
    await instance.destroy();
  }
}
