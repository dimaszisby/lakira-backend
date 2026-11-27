import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";
import { PasswordResetToken } from "../entities/PasswordResetToken.js";

export type CreatePasswordResetTokenDTO = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};

export interface PasswordResetTokenRepository {
  findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null>;
  create(
    data: CreatePasswordResetTokenDTO,
    tx?: PersistenceTransaction,
  ): Promise<PasswordResetToken>;
  /**
   * Spends the token if it is still unused and unexpired, in one conditional
   * update. True when this call spent it: of two racing resets, or a reset
   * racing a confirmed email change, one gets false (#351, credential-changes D-11).
   */
  spend(id: string, now: Date, tx?: PersistenceTransaction): Promise<boolean>;
  invalidateAllForUser(
    userId: string,
    now?: Date,
    tx?: PersistenceTransaction,
  ): Promise<void>;
}
