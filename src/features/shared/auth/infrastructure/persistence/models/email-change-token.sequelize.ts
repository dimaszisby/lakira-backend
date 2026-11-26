import { Model, DataTypes, Sequelize, Optional } from "sequelize";
import type { DbModels } from "@/infrastructure/db/types.js";

export interface EmailChangeTokenAttributes {
  id: string;
  userId: string;
  newEmail: string;
  oldEmail: string;
  /** Null until the job mints the token (credential-changes D-05). */
  tokenHash: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type EmailChangeTokenCreationAttributes = Optional<
  EmailChangeTokenAttributes,
  "id" | "tokenHash" | "usedAt"
>;

export class EmailChangeToken
  extends Model<EmailChangeTokenAttributes, EmailChangeTokenCreationAttributes>
  implements EmailChangeTokenAttributes
{
  declare id: string;
  declare userId: string;
  declare newEmail: string;
  declare oldEmail: string;
  declare tokenHash: string | null;
  declare expiresAt: Date;
  declare usedAt: Date | null;
  declare createdAt?: Date;
  declare updatedAt?: Date;

  static initModel(sequelize: Sequelize) {
    EmailChangeToken.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        userId: {
          type: DataTypes.UUID,
          allowNull: false,
        },
        newEmail: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        oldEmail: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        tokenHash: {
          type: DataTypes.STRING(64),
          allowNull: true,
          unique: true,
        },
        expiresAt: {
          type: DataTypes.DATE,
          allowNull: false,
        },
        usedAt: {
          type: DataTypes.DATE,
          allowNull: true,
        },
      },
      {
        sequelize,
        modelName: "EmailChangeToken",
        tableName: "email_change_tokens",
        underscored: true,
        schema: "public",
      },
    );

    return EmailChangeToken;
  }

  static associate(models: DbModels) {
    EmailChangeToken.belongsTo(models.User, {
      as: "user",
      foreignKey: { name: "userId", field: "user_id", allowNull: false },
      onDelete: "CASCADE",
    });
  }
}

export function initEmailChangeToken(sequelize: Sequelize) {
  return EmailChangeToken.initModel(sequelize);
}

export function associateEmailChangeToken(models: DbModels) {
  EmailChangeToken.associate(models);
}
