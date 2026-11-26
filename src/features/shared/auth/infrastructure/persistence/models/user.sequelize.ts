import { Model, DataTypes, Sequelize, Optional } from "sequelize";
import bcrypt from "bcrypt";
import { UserAttributesBase } from "@/types/db/user.types.js";
import type { DbModels } from "@/infrastructure/db/types.js";
import {
  initPasswordResetToken,
  associatePasswordResetToken,
  PasswordResetToken,
} from "./password-reset-token.sequelize.js";
import {
  initRefreshToken,
  associateRefreshToken,
  RefreshToken,
} from "./refresh-token.sequelize.js";
import {
  initEmailVerificationToken,
  associateEmailVerificationToken,
  EmailVerificationToken,
} from "./email-verification-token.sequelize.js";
import {
  initEmailChangeToken,
  associateEmailChangeToken,
  EmailChangeToken,
} from "./email-change-token.sequelize.js";
import {
  initOrganization,
  associateOrganization,
  Organization,
} from "./organization.sequelize.js";
import {
  initMembership,
  associateMembership,
  Membership,
} from "./membership.sequelize.js";
import {
  initOrganizationInvite,
  associateOrganizationInvite,
  OrganizationInvite,
} from "./organization-invite.sequelize.js";

const isBcryptHash = (value: unknown): value is string =>
  typeof value === "string" && /^\$2[aby]\$\d{2}\$/.test(value);

export interface UserAttributes extends UserAttributesBase {
  id?: string;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  deletedAt?: Date | null;
}

export type UserCreationAttributes = Optional<UserAttributes, "id">;

export interface UserInstance extends Model<UserAttributes>, UserAttributes {
  validPassword(password: string): Promise<boolean>;
}

export class User
  extends Model<UserAttributes, UserCreationAttributes>
  implements UserAttributes
{
  declare id: string;
  declare username: string;
  declare email: string;
  declare password: string;
  declare isPublicProfile: boolean;
  declare emailVerifiedAt?: Date | null;

  declare createdAt?: Date | null;
  declare updatedAt?: Date | null;
  declare deletedAt?: Date | null;

  static initModel(sequelize: Sequelize) {
    User.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        username: {
          type: DataTypes.STRING,
          unique: true,
          allowNull: false,
        },
        email: {
          type: DataTypes.STRING,
          unique: true,
          allowNull: false,
          validate: { isEmail: true },
        },
        password: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        isPublicProfile: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        emailVerifiedAt: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        deletedAt: {
          type: DataTypes.DATE,
          allowNull: true,
        },
      },
      {
        sequelize,
        modelName: "User",
        tableName: "users",
        paranoid: true,
        underscored: true,
        schema: "public",
        hooks: {
          beforeCreate: async (user: UserInstance) => {
            if (!user.password)
              throw new Error("Password is required for registration.");
            if (isBcryptHash(user.password)) return;
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(user.password, salt);
          },
          beforeUpdate: async (user: UserInstance) => {
            if (user.changed("password")) {
              if (!user.password)
                throw new Error("Password is required for update.");
              if (isBcryptHash(user.password)) return;
              const salt = await bcrypt.genSalt(10);
              user.password = await bcrypt.hash(user.password, salt);
            }
          },
        },
      },
    );

    return User;
  }

  static associate(models: DbModels) {
    User.hasMany(models.Metric, {
      as: "metrics",
      foreignKey: { name: "userId", field: "user_id", allowNull: false },
      onDelete: "CASCADE",
    });

    User.hasMany(models.MetricCategory, {
      as: "categories",
      foreignKey: { name: "userId", field: "user_id", allowNull: false },
      onDelete: "CASCADE",
    });

    User.hasMany(models.PasswordResetToken, {
      as: "passwordResetTokens",
      foreignKey: { name: "userId", field: "user_id", allowNull: false },
      onDelete: "CASCADE",
    });

    User.hasMany(models.RefreshToken, {
      as: "refreshTokens",
      foreignKey: { name: "userId", field: "user_id", allowNull: false },
      onDelete: "CASCADE",
    });

    User.hasMany(models.EmailVerificationToken, {
      as: "emailVerificationTokens",
      foreignKey: { name: "userId", field: "user_id", allowNull: false },
      onDelete: "CASCADE",
    });

    User.hasMany(models.EmailChangeToken, {
      as: "emailChangeTokens",
      foreignKey: { name: "userId", field: "user_id", allowNull: false },
      onDelete: "CASCADE",
    });

    User.hasMany(models.Membership, {
      as: "memberships",
      foreignKey: { name: "userId", field: "user_id", allowNull: false },
      onDelete: "CASCADE",
    });
  }

  async validPassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.password);
  }
}

export function initUser(sequelize: Sequelize) {
  return User.initModel(sequelize);
}
export function associateUser(models: DbModels) {
  User.associate(models);
}

export const registerAuthModels = (sequelize: Sequelize) => {
  initUser(sequelize);
  initPasswordResetToken(sequelize);
  initRefreshToken(sequelize);
  initEmailVerificationToken(sequelize);
  initEmailChangeToken(sequelize);
  initOrganization(sequelize);
  initMembership(sequelize);
  initOrganizationInvite(sequelize);
  return {
    User,
    PasswordResetToken,
    RefreshToken,
    EmailVerificationToken,
    EmailChangeToken,
    Organization,
    Membership,
    OrganizationInvite,
  };
};

export const associateAuthModels = (models: DbModels) => {
  associateUser(models);
  associatePasswordResetToken(models);
  associateRefreshToken(models);
  associateEmailVerificationToken(models);
  associateEmailChangeToken(models);
  associateOrganization(models);
  associateMembership(models);
  associateOrganizationInvite(models);
};
