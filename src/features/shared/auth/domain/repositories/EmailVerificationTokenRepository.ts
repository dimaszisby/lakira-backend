import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";
import { EmailVerificationToken } from "../entities/EmailVerificationToken.js";

export type CreateEmailVerificationTokenDTO = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};

export interface EmailVerificationTokenRepository {
  save(
    data: CreateEmailVerificationTokenDTO,
    tx?: PersistenceTransaction,
  ): Promise<EmailVerificationToken>;
  findByTokenHash(hash: string): Promise<EmailVerificationToken | null>;
  revokeAllForUser(
    userId: string,
    now?: Date,
    tx?: PersistenceTransaction,
  ): Promise<void>;
  markUsed(id: string, usedAt: Date): Promise<void>;
}
