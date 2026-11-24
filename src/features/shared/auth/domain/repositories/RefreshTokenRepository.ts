import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";
import { RefreshToken } from "../entities/RefreshToken.js";

export interface RefreshTokenRepository {
  save(token: RefreshToken, tx?: PersistenceTransaction): Promise<void>;
  findByTokenHashForUpdate(
    hash: string,
    tx: PersistenceTransaction,
  ): Promise<RefreshToken | null>;
  findByTokenHash(hash: string): Promise<RefreshToken | null>;
  revokeFamily(
    familyId: string,
    now?: Date,
    tx?: PersistenceTransaction,
  ): Promise<void>;
  /** Every unrevoked token of the user, in one statement: ends all their sessions (ADR-0097). */
  revokeAllForUser(
    userId: string,
    now?: Date,
    tx?: PersistenceTransaction,
  ): Promise<void>;
  findActiveByUser(userId: string): Promise<RefreshToken[]>;
}
