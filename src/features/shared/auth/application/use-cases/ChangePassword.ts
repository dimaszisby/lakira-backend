import {
  NotFoundError,
  ValidationError,
} from "@/shared/domain/errors/DomainError.js";
import type { TransactionPort } from "@/shared/application/ports/TransactionPort.js";
import logger from "@/utils/logger.js";
import { UserRepository } from "../../domain/repositories/UserRepository.js";
import { RefreshTokenRepository } from "../../domain/repositories/RefreshTokenRepository.js";
import { PasswordResetTokenRepository } from "../../domain/repositories/PasswordResetTokenRepository.js";
import { PasswordHasher } from "../ports/PasswordHasher.js";
import { IssueRefreshToken } from "./IssueRefreshToken.js";
import { ConfirmCurrentPassword } from "./ConfirmCurrentPassword.js";

export const PASSWORD_UNCHANGED =
  "The new password must differ from the current one";

export type ChangePasswordInput = {
  userId: string;
  /** The organization of the session making the change, which it re-issues. */
  organizationId: string;
  userAgent?: string | null;
  ip?: string | null;
  currentPassword: string;
  password: string;
};

export type ChangePasswordResult = {
  /** The session making the change continues on this refresh token. */
  rawRefreshToken: string;
};

export type ChangePasswordDeps = {
  now?: () => Date;
};

/**
 * `POST /auth/change-password` (credential-changes D-01). Asks for the current
 * password, then ends every session the user has and issues this one a new
 * refresh token, as ADR-0097 decided.
 */
export class ChangePassword {
  constructor(
    private userRepo: UserRepository,
    private resetTokenRepo: PasswordResetTokenRepository,
    private refreshTokenRepo: RefreshTokenRepository,
    private hasher: PasswordHasher,
    private issueRefreshToken: IssueRefreshToken,
    private confirmCurrentPassword: ConfirmCurrentPassword,
    private tx: TransactionPort,
    private deps: ChangePasswordDeps = {},
  ) {}

  async execute(input: ChangePasswordInput): Promise<ChangePasswordResult> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) throw new NotFoundError("User not found");

    await this.confirmCurrentPassword.execute(user, input.currentPassword);

    if (await this.hasher.compare(input.password, user.passwordHash)) {
      throw new ValidationError(PASSWORD_UNCHANGED, { field: "password" });
    }

    // Hashed before the transaction opens: bcrypt is slow, and a connection
    // held across it is one the pool cannot lend.
    const passwordHash = await this.hasher.hash(input.password);
    user.setPasswordHash(passwordHash);
    const now = this.deps.now ? this.deps.now() : new Date();

    // ADR-0097's order: sessions end before the user row is written, so a
    // concurrent refresh cannot deadlock with it, and the new token is issued
    // last, or it would be revoked with the rest. A reset link sent before the
    // change is spent with it (credential-changes AC-5).
    const rawRefreshToken = await this.tx.runInTransaction(async (tx) => {
      await this.refreshTokenRepo.revokeAllForUser(user.id, now, tx);
      await this.userRepo.save(user, tx);
      await this.resetTokenRepo.invalidateAllForUser(user.id, now, tx);
      const { rawToken } = await this.issueRefreshToken.executeInTransaction(
        {
          userId: user.id,
          organizationId: input.organizationId,
          userAgent: input.userAgent,
          ip: input.ip,
        },
        tx,
      );
      return rawToken;
    });

    logger.info("auth.sessions.revoked", {
      userId: user.id,
      reason: "password_change",
    });
    return { rawRefreshToken };
  }
}
