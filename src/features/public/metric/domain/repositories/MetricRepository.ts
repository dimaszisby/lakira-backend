import { Metric } from "../entities/Metric.js";
import type {} from "@/shared/domain/PersistenceTransaction.js";
import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";

export type CreateMetricDTO = {
  userId: string;
  organizationId: string;
  categoryId?: string | null;
  originalMetricId?: string | null;
  name: string;
  description?: string | null;
  defaultUnit: string;
  isPublic: boolean;
};

export interface MetricRepository {
  existsByName(
    userId: string,
    organizationId: string,
    name: string,
  ): Promise<boolean>;
  categoryExists(
    userId: string,
    organizationId: string,
    categoryId: string,
  ): Promise<boolean>;
  // Cross-org: intentionally unscoped — allows referencing public metrics from any org for cloning.
  originalMetricExists(userId: string, metricId: string): Promise<boolean>;
  create(data: CreateMetricDTO, tx: PersistenceTransaction): Promise<Metric>;
  findOwnedById(
    userId: string,
    organizationId: string,
    metricId: string,
  ): Promise<Metric>;
  save(organizationId: string, metric: Metric): Promise<Metric>;
  delete(organizationId: string, metric: Metric): Promise<void>;
}
