import { Op, Transaction } from "sequelize";
import { models } from "@/infrastructure/db/models.js";
import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";
import { EmailVerificationToken } from "../../domain/entities/EmailVerificationToken.js";
import {
  CreateEmailVerificationTokenDTO,
  EmailVerificationTokenRepository,
} from "../../domain/repositories/EmailVerificationTokenRepository.js";
import { toDomainEmailVerificationToken } from "../mappers/EmailVerificationTokenMapper.js";

export class EmailVerificationTokenRepositorySequelize implements EmailVerificationTokenRepository {
  async save(
    data: CreateEmailVerificationTokenDTO,
    tx?: PersistenceTransaction,
  ): Promise<EmailVerificationToken> {
    const transaction = tx as Transaction | undefined;
    const created = await models.EmailVerificationToken.create(
      {
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        usedAt: null,
      },
      { transaction },
    );
    await created.reload({ transaction });
    return toDomainEmailVerificationToken(created);
  }

  async findByTokenHash(hash: string): Promise<EmailVerificationToken | null> {
    const row = await models.EmailVerificationToken.findOne({
      where: { tokenHash: hash },
    });
    return row ? toDomainEmailVerificationToken(row) : null;
  }

  async revokeAllForUser(
    userId: string,
    now: Date = new Date(),
    tx?: PersistenceTransaction,
  ): Promise<void> {
    await models.EmailVerificationToken.update(
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

  async markUsed(id: string, usedAt: Date): Promise<void> {
    await models.EmailVerificationToken.update({ usedAt }, { where: { id } });
  }
}
