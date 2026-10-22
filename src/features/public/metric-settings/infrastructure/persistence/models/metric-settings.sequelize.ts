import {
  Model,
  DataTypes,
  Sequelize,
  Optional,
  BelongsToGetAssociationMixin,
  NonAttribute,
} from "sequelize";
import {
  MetricDisplayOptions,
  MetricSettingsAttributesBase,
} from "@/types/db/metric-settings.types.js";
import type { Metric } from "@/features/metric/infrastructure/persistence/models/metric.sequelize.js";
import type { DbModels } from "@/infrastructure/db/types.js";

export interface MetricSettingsAttributes extends MetricSettingsAttributesBase {
  id: string;
  metricId: string;
  organizationId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type MetricSettingsCreationAttributes = Optional<
  MetricSettingsAttributes,
  "id"
>;

export class MetricSettings
  extends Model<MetricSettingsAttributes, MetricSettingsCreationAttributes>
  implements MetricSettingsAttributes
{
  declare id: string;
  declare metricId: string;
  declare organizationId: string;
  declare isActive: boolean;

  declare goalEnabled: boolean;
  declare goalType: "cumulative" | "incremental" | null;
  declare goalValue: number | null;

  declare timeFrameEnabled: boolean;
  declare startDate: Date | null;
  declare deadlineDate: Date | null;

  declare alertEnabled: boolean;
  declare alertThresholds: number | null;

  declare isAchieved: boolean;

  declare displayOptions: MetricDisplayOptions;
  declare createdAt?: Date;
  declare updatedAt?: Date;

  declare metric?: NonAttribute<Metric>;
  declare getMetric: BelongsToGetAssociationMixin<Metric>;

  static initModel(sequelize: Sequelize) {
    MetricSettings.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        metricId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "metrics",
            key: "id",
          },
        },
        organizationId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "organizations",
            key: "id",
          },
        },
        goalEnabled: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        goalType: {
          type: DataTypes.ENUM("cumulative", "incremental"),
          allowNull: true,
        },
        goalValue: {
          type: DataTypes.FLOAT,
          allowNull: true,
          validate: {
            isValidValue(value: number | null) {
              if (value !== null && value <= 0) {
                throw new Error("Goal value must be greater than 0.");
              }
            },
          },
        },
        timeFrameEnabled: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        startDate: {
          type: DataTypes.DATEONLY,
          allowNull: true,
        },
        deadlineDate: {
          type: DataTypes.DATEONLY,
          allowNull: true,
          validate: {
            isAfterStart(this: { startDate: string | null }, value: unknown) {
              if (this.startDate && value) {
                const startDate = new Date(this.startDate);
                const deadline = new Date(value as string);
                if (deadline <= startDate) {
                  throw new Error(
                    "Deadline date must be after the start date.",
                  );
                }
              }
            },
          },
        },
        alertEnabled: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        alertThresholds: {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: 80,
          validate: {
            isInRange(value: number) {
              if (value !== null && (value < 0 || value > 100)) {
                throw new Error("alertThresholds must be between 0 and 100.");
              }
            },
          },
        },
        isAchieved: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        isActive: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        displayOptions: {
          type: DataTypes.JSONB,
          defaultValue: {
            showOnDashboard: true,
            priority: 1,
            chartType: "line",
            color: "#E897A3",
          },
        },
      },
      {
        sequelize,
        modelName: "MetricSettings",
        tableName: "metric_settings",
        underscored: true,
        timestamps: true,
        hooks: {
          beforeUpdate: async (metricSettings: MetricSettings) => {
            const changed = metricSettings.changed();

            if (
              Array.isArray(changed) &&
              changed.includes("goalEnabled") &&
              !metricSettings.goalEnabled
            ) {
              metricSettings.goalType = null;
              metricSettings.goalValue = null;
              metricSettings.startDate = null;
              metricSettings.deadlineDate = null;
            }

            if (
              Array.isArray(changed) &&
              changed?.includes("timeFrameEnabled") &&
              !metricSettings.timeFrameEnabled
            ) {
              metricSettings.startDate = null;
              metricSettings.deadlineDate = null;
            }

            if (
              Array.isArray(changed) &&
              changed?.includes("alertEnabled") &&
              !metricSettings.alertEnabled
            ) {
              metricSettings.alertThresholds = null;
            }
          },
        },
      },
    );

    return MetricSettings;
  }

  static associate(models: DbModels) {
    MetricSettings.belongsTo(models.Metric, {
      as: "metric",
      foreignKey: { name: "metricId", field: "metric_id", allowNull: false },
      onDelete: "CASCADE",
    });

    MetricSettings.belongsTo(models.Organization, {
      as: "organization",
      foreignKey: {
        name: "organizationId",
        field: "organization_id",
        allowNull: false,
      },
      onDelete: "RESTRICT",
    });
  }

  public toJSON(): Record<string, unknown> {
    const attributes = this.get();
    return {
      ...attributes,
      createdAt: attributes.createdAt
        ? new Date(attributes.createdAt).toISOString()
        : null,
      updatedAt: attributes.updatedAt
        ? new Date(attributes.updatedAt).toISOString()
        : null,
    };
  }
}

export function initMetricSettings(sequelize: Sequelize) {
  return MetricSettings.initModel(sequelize);
}
export function associateMetricSettings(models: DbModels) {
  MetricSettings.associate(models);
}

export const registerMetricSettingsModels = (sequelize: Sequelize) => {
  initMetricSettings(sequelize);
  return { MetricSettings };
};

export const associateMetricSettingsModels = (models: DbModels) => {
  associateMetricSettings(models);
};
