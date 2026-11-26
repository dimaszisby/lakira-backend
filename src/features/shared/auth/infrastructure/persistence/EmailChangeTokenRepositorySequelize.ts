import { Op, Transaction, UniqueConstraintError } from "sequelize";
import AppError from "@/utils/AppError.js";
import { models } from "@/infrastructure/db/models.js";
import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";
import { EmailChangeToken } from "../../domain/entities/EmailChangeToken.js";
import {
  CreateEmailChangeTokenDTO,
  EmailChangeTokenRepository,
} from "../../domain/repositories/EmailChangeTokenRepository.js";
import { toDomainEmailChangeToken } from "../mappers/EmailChangeTokenMapper.js";

// Migration 20261125000001: one pending change per user (credential-changes D-11).
const PENDING_USER_INDEX = "uq_email_change_tokens_pending_user";
export const EMAIL_CHANGE_PENDING_CONFLICT =
  "Another email change was requested at the same time. Try again.";

const isPendingUserConflict = (err: unknown): boolean =>
  err instanceof UniqueConstraintError &&
  (err.parent as { constraint?: string } | undefined)?.constraint ===
    PENDING_USER_INDEX;

export class EmailChangeTokenRepositorySequelize implements EmailChangeTokenRepository {
  async create(
    data: CreateEmailChangeTokenDTO,
    tx?: PersistenceTransaction,
  ): Promise<EmailChangeToken> {
    const transaction = tx as Transaction | undefined;
    let created;
    try {
      created = await models.EmailChangeToken.create(
        {
          userId: data.userId,
          newEmail: data.newEmail,
          oldEmail: data.oldEmail,
          expiresAt: data.expiresAt,
          tokenHash: null,
          usedAt: null,
        },
        { transaction },
      );
    } catch (err) {
      // The other request's row committed after this one's supersede ran.
      if (isPendingUserConflict(err)) {
        throw new AppError(EMAIL_CHANGE_PENDING_CONFLICT, 409);
      }
      throw err;
    }
    await created.reload({ transaction });
    return toDomainEmailChangeToken(created);
  }

  async supersedeAllForUser(
    userId: string,
    now: Date,
    tx?: PersistenceTransaction,
  ): Promise<void> {
    await models.EmailChangeToken.update(
      { usedAt: now },
      {
        where: { userId, usedAt: { [Op.is]: null } },
        transaction: tx as Transaction | undefined,
      },
    );
  }

  async findById(
    id: string,
    tx?: PersistenceTransaction,
  ): Promise<EmailChangeToken | null> {
    const row = await models.EmailChangeToken.findByPk(id, {
      transaction: tx as Transaction | undefined,
    });
    return row ? toDomainEmailChangeToken(row) : null;
  }

  async setTokenHash(
    id: string,
    tokenHash: string,
    tx?: PersistenceTransaction,
  ): Promise<void> {
    await models.EmailChangeToken.update(
      { tokenHash },
      { where: { id }, transaction: tx as Transaction | undefined },
    );
  }

  async findByTokenHash(tokenHash: string): Promise<EmailChangeToken | null> {
    const row = await models.EmailChangeToken.findOne({
      where: { tokenHash },
    });
    return row ? toDomainEmailChangeToken(row) : null;
  }

  async spend(
    id: string,
    now: Date,
    tx?: PersistenceTransaction,
  ): Promise<boolean> {
    // One statement: a second confirmation waits on the row lock, then
    // re-reads `used_at` once the first commits, and changes nothing.
    const [affectedCount] = await models.EmailChangeToken.update(
      { usedAt: now },
      {
        where: {
          id,
          usedAt: { [Op.is]: null },
          expiresAt: { [Op.gt]: now },
        },
        transaction: tx as Transaction | undefined,
      },
    );
    return affectedCount === 1;
  }
}
