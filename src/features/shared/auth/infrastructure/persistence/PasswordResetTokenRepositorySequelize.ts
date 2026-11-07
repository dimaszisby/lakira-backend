import { Op, Transaction } from "sequelize";
import { models } from "@/infrastructure/db/models.js";
import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";
import { PasswordResetToken } from "../../domain/entities/PasswordResetToken.js";
import {
  CreatePasswordResetTokenDTO,
  PasswordResetTokenRepository,
} from "../../domain/repositories/PasswordResetTokenRepository.js";
import { toDomainPasswordResetToken } from "../mappers/PasswordResetTokenMapper.js";

export class PasswordResetTokenRepositorySequelize implements PasswordResetTokenRepository {
  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const row = await models.PasswordResetToken.findOne({
      where: { tokenHash },
    });
    return row ? toDomainPasswordResetToken(row) : null;
  }

  async create(
    data: CreatePasswordResetTokenDTO,
    tx?: PersistenceTransaction,
  ): Promise<PasswordResetToken> {
    const transaction = tx as Transaction | undefined;
    const created = await models.PasswordResetToken.create(
      {
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        usedAt: null,
      },
      { transaction },
    );
    await created.reload({ transaction });
    return toDomainPasswordResetToken(created);
  }

  async markUsed(id: string, usedAt: Date): Promise<void> {
    await models.PasswordResetToken.update({ usedAt }, { where: { id } });
  }

  async invalidateAllForUser(
    userId: string,
    now: Date = new Date(),
    tx?: PersistenceTransaction,
  ): Promise<void> {
    await models.PasswordResetToken.update(
      { usedAt: now },
      {
        where: {
          userId,
          usedAt: { [Op.is]: null },
        },
        transaction: tx as Transaction | undefined,
      },
    );
  }
}
