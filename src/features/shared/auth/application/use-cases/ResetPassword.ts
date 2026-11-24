import { ValidationError } from "@/shared/domain/errors/DomainError.js";
import type { TransactionPort } from "@/shared/application/ports/TransactionPort.js";
import logger from "@/utils/logger.js";
import crypto from "node:crypto";
import { UserRepository } from "../../domain/repositories/UserRepository.js";
import { PasswordResetTokenRepository } from "../../domain/repositories/PasswordResetTokenRepository.js";
import { RefreshTokenRepository } from "../../domain/repositories/RefreshTokenRepository.js";
import { PasswordHasher } from "../ports/PasswordHasher.js";

const INVALID_TOKEN_MESSAGE = "Invalid or expired reset token";

export type ResetPasswordInput = {
  token: string;
  password: string;
  passwordConfirmation: string;
};

export type ResetPasswordDeps = {
  now?: () => Date;
};

export class ResetPassword {
  constructor(
    private userRepo: UserRepository,
    private tokenRepo: PasswordResetTokenRepository,
    private hasher: PasswordHasher,
    private refreshTokenRepo: RefreshTokenRepository,
    private tx: TransactionPort,
    private deps: ResetPasswordDeps = {},
  ) {}

  async execute(input: ResetPasswordInput): Promise<void> {
    if (input.password !== input.passwordConfirmation) {
      throw new ValidationError("Passwords do not match");
    }

    const now = this.deps.now ? this.deps.now() : new Date();
    const tokenHash = crypto
      .createHash("sha256")
      .update(input.token)
      .digest("hex");

    const token = await this.tokenRepo.findByTokenHash(tokenHash);
    if (!token || token.isUsed() || token.isExpired(now)) {
      throw new ValidationError(INVALID_TOKEN_MESSAGE);
    }

    const user = await this.userRepo.findById(token.userId);
    if (!user) {
      throw new ValidationError(INVALID_TOKEN_MESSAGE);
    }

    // Hashed before the transaction opens: bcrypt is slow, and a connection
    // held across it is one the pool cannot lend.
    const passwordHash = await this.hasher.hash(input.password);
    user.setPasswordHash(passwordHash);

    // The end of every session, the new password and the spent token commit
    // together, or none of them does (ADR-0097). Sessions end first, as in
    // UpdateProfile, so the two take their locks in the same order.
    await this.tx.runInTransaction(async (tx) => {
      await this.refreshTokenRepo.revokeAllForUser(user.id, now, tx);
      await this.userRepo.save(user, tx);
      await this.tokenRepo.markUsed(token.id, now, tx);
    });

    logger.info("auth.sessions.revoked", {
      userId: user.id,
      reason: "password_reset",
    });
  }
}
