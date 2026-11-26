import { Op, Transaction } from "sequelize";
import { models } from "@/infrastructure/db/models.js";
import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";
import { AuthUser } from "../../domain/entities/AuthUser.js";
import {
  CreateUserDTO,
  UserRepository,
} from "../../domain/repositories/UserRepository.js";
import type { User } from "./models/user.sequelize.js";

const toDomain = (row: User): AuthUser =>
  AuthUser.fromPersistence({
    id: row.id,
    email: row.email,
    username: row.username,
    passwordHash: row.password,
    isPublicProfile: row.isPublicProfile ?? !!row.isPublicProfile,
    emailVerifiedAt: row.emailVerifiedAt ?? null,
    createdAt: row.createdAt ?? new Date(0),
    updatedAt: row.updatedAt ?? new Date(0),
    deletedAt: row.deletedAt ?? null,
  });

export class UserRepositorySequelize implements UserRepository {
  async existsByEmail(
    email: string,
    tx?: PersistenceTransaction,
  ): Promise<boolean> {
    const count = await models.User.count({
      where: { email },
      transaction: tx as Transaction | undefined,
    });
    return count > 0;
  }

  async existsByUsername(username: string): Promise<boolean> {
    const count = await models.User.count({ where: { username } });
    return count > 0;
  }

  async findById(
    id: string,
    tx?: PersistenceTransaction,
  ): Promise<AuthUser | null> {
    const user = await models.User.findByPk(id, {
      transaction: tx as Transaction | undefined,
    });
    return user ? toDomain(user) : null;
  }

  async findByIds(ids: string[]): Promise<AuthUser[]> {
    if (ids.length === 0) return [];
    const rows = await models.User.findAll({
      where: { id: { [Op.in]: ids } },
    });
    return rows.map(toDomain);
  }

  async findByEmail(email: string): Promise<AuthUser | null> {
    const user = await models.User.findOne({ where: { email } });
    return user ? toDomain(user) : null;
  }

  async create(
    data: CreateUserDTO,
    tx?: PersistenceTransaction,
  ): Promise<AuthUser> {
    const transaction = tx as Transaction | undefined;
    const created = await models.User.create(
      {
        email: data.email,
        username: data.username,
        password: data.passwordHash,
        isPublicProfile: data.isPublicProfile,
      },
      { transaction },
    );
    await created.reload({ transaction });
    return toDomain(created);
  }

  async save(user: AuthUser, tx?: PersistenceTransaction): Promise<AuthUser> {
    const transaction = tx as Transaction | undefined;
    const row = await models.User.findByPk(user.id, { transaction });
    if (!row) throw new Error("User not found");
    // Only what the use case changed: a field it merely read may have been
    // changed since by another request, and writing it would undo that
    // (credential-changes D-11).
    const changes: Partial<
      Pick<
        User,
        | "email"
        | "username"
        | "password"
        | "isPublicProfile"
        | "emailVerifiedAt"
      >
    > = {};
    for (const field of user.changedFields) {
      if (field === "email") changes.email = user.email;
      if (field === "username") changes.username = user.username;
      if (field === "passwordHash") changes.password = user.passwordHash;
      if (field === "isPublicProfile")
        changes.isPublicProfile = user.isPublicProfile;
      if (field === "emailVerifiedAt")
        changes.emailVerifiedAt = user.emailVerifiedAt;
    }
    if (Object.keys(changes).length > 0) {
      await row.update(changes, { transaction });
    }
    await row.reload({ transaction });
    return toDomain(row);
  }
}
