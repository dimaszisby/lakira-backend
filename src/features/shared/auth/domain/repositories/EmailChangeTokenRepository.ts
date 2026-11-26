import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";
import { EmailChangeToken } from "../entities/EmailChangeToken.js";

export type CreateEmailChangeTokenDTO = {
  userId: string;
  newEmail: string;
  oldEmail: string;
  expiresAt: Date;
};

export interface EmailChangeTokenRepository {
  create(
    data: CreateEmailChangeTokenDTO,
    tx?: PersistenceTransaction,
  ): Promise<EmailChangeToken>;
  /** Marks every pending change of the user spent (credential-changes D-02, D-09). */
  supersedeAllForUser(
    userId: string,
    now: Date,
    tx?: PersistenceTransaction,
  ): Promise<void>;
  findById(
    id: string,
    tx?: PersistenceTransaction,
  ): Promise<EmailChangeToken | null>;
  setTokenHash(
    id: string,
    tokenHash: string,
    tx?: PersistenceTransaction,
  ): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<EmailChangeToken | null>;
  /**
   * Spends the token if it is still pending and unexpired, in one conditional
   * update. True when this call spent it: of two racing confirmations, one gets
   * true and the other false.
   */
  spend(id: string, now: Date, tx?: PersistenceTransaction): Promise<boolean>;
}
