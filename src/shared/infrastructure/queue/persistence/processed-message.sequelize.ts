import { Model, DataTypes, Sequelize, Optional } from "sequelize";

/**
 * ADR-0007 dedup record. Shared queue infrastructure, owned by no feature.
 *
 * Mirrors 20260420000000-create-processed-messages plus the nullable organization_id
 * added by 20260510000005. The table has no created_at/updated_at, so timestamps must
 * stay off despite the global default in db.ts.
 */
export interface ProcessedMessageAttributes {
  messageId: string;
  queue: string;
  organizationId: string | null;
  processedAt: Date;
}

export type ProcessedMessageCreationAttributes = Optional<
  ProcessedMessageAttributes,
  "organizationId" | "processedAt"
>;

export class ProcessedMessage
  extends Model<ProcessedMessageAttributes, ProcessedMessageCreationAttributes>
  implements ProcessedMessageAttributes
{
  declare messageId: string;
  declare queue: string;
  declare organizationId: string | null;
  declare processedAt: Date;

  static initModel(sequelize: Sequelize) {
    ProcessedMessage.init(
      {
        messageId: {
          type: DataTypes.STRING(36),
          primaryKey: true,
          allowNull: false,
        },
        queue: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        organizationId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "organizations",
            key: "id",
          },
        },
        processedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("NOW()"),
        },
      },
      {
        sequelize,
        modelName: "ProcessedMessage",
        tableName: "processed_messages",
        underscored: true,
        timestamps: false,
        schema: "public",
      },
    );

    return ProcessedMessage;
  }
}

export const registerProcessedMessageModels = (sequelize: Sequelize) => {
  ProcessedMessage.initModel(sequelize);
  return { ProcessedMessage };
};
