import { Op, Transaction } from "sequelize";
import sequelize from "@/config/db.js";
import { models } from "@/infrastructure/db/models.js";
import { RefreshToken } from "../../domain/entities/RefreshToken.js";
import {
  RefreshTokenRepository,
  TransactionPort,
} from "../../domain/repositories/RefreshTokenRepository.js";
import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";
import { toDomainRefreshToken } from "../mappers/RefreshTokenMapper.js";

export class RefreshTokenRepositorySequelize
  implements RefreshTokenRepository, TransactionPort
{
  async save(token: RefreshToken, tx?: PersistenceTransaction): Promise<void> {
    await models.RefreshToken.upsert(
      {
        id: token.id,
        userId: token.userId,
        organizationId: token.organizationId,
        familyId: token.familyId,
        tokenHash: token.tokenHash,
        issuedAt: token.issuedAt,
        expiresAt: token.expiresAt,
        revokedAt: token.revokedAt,
        replacedById: token.replacedById,
        userAgent: token.userAgent,
        ip: token.ip,
      },
      { transaction: tx as Transaction | undefined },
    );
  }

  async findByTokenHash(hash: string): Promise<RefreshToken | null> {
    const row = await models.RefreshToken.findOne({
      where: { tokenHash: hash },
    });
    return row ? toDomainRefreshToken(row) : null;
  }

  async findByTokenHashForUpdate(
    hash: string,
    tx: PersistenceTransaction,
  ): Promise<RefreshToken | null> {
    const row = await models.RefreshToken.findOne({
      where: { tokenHash: hash },
      lock: Transaction.LOCK.UPDATE,
      transaction: tx as Transaction,
    });
    return row ? toDomainRefreshToken(row) : null;
  }

  async revokeFamily(
    familyId: string,
    now: Date = new Date(),
    tx?: PersistenceTransaction,
  ): Promise<void> {
    await models.RefreshToken.update(
      { revokedAt: now },
      {
        where: {
          familyId,
          revokedAt: { [Op.is]: null },
        },
        transaction: tx as Transaction | undefined,
      },
    );
  }

  async findActiveByUser(userId: string): Promise<RefreshToken[]> {
    const rows = await models.RefreshToken.findAll({
      where: {
        userId,
        revokedAt: { [Op.is]: null },
        expiresAt: { [Op.gt]: new Date() },
      },
    });
    return rows.map(toDomainRefreshToken);
  }

  async runInTransaction<T>(
    fn: (tx: PersistenceTransaction) => Promise<T>,
  ): Promise<T> {
    return sequelize.transaction(async (transaction: Transaction) => {
      return fn(transaction);
    });
  }
}
