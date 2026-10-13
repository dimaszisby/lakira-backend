import { models } from "@/infrastructure/db/models.js";
import { Transaction } from "sequelize";
import { MetricSettingsPort } from "../../../application/ports/MetricSettingsPort.js";
import type {} from "@/shared/domain/PersistenceTransaction.js";
import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";

export class MetricSettingsPortSequelize implements MetricSettingsPort {
  async createDefault(
    metricId: string,
    organizationId: string,
    tx: PersistenceTransaction,
  ): Promise<void> {
    const transaction = tx as Transaction;
    await models.MetricSettings.create(
      {
        metricId,
        organizationId,
        goalEnabled: false,
        goalType: null,
        goalValue: null,
        timeFrameEnabled: false,
        startDate: null,
        deadlineDate: null,
        alertEnabled: false,
        alertThresholds: 80,
        isAchieved: false,
        isActive: true,
        displayOptions: {
          showOnDashboard: true,
          priority: 1,
          chartType: "line",
          color: "#E897A3",
        },
      },
      { transaction },
    );
  }
}
