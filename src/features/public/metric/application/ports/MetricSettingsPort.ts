import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";

export interface MetricSettingsPort {
  createDefault(
    metricId: string,
    organizationId: string,
    tx?: PersistenceTransaction,
  ): Promise<void>;
}
