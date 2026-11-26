import { ValidationError } from "@/shared/domain/errors/DomainError.js";
import type { TransactionPort } from "@/shared/application/ports/TransactionPort.js";
import logger from "@/utils/logger.js";
import crypto from "node:crypto";
import { UserRepository } from "../../domain/repositories/UserRepository.js";
import { PasswordResetTokenRepository } from "../../domain/repositories/PasswordResetTokenRepository.js";
import { RefreshTokenRepository } from "../../domain/repositories/RefreshTokenRepository.js";
import { EmailChangeTokenRepository } from "../../domain/repositories/EmailChangeTokenRepository.js";
import { PasswordHasher } from "../ports/PasswordHasher.js";
import { ScheduleAccountNotice } from "./ScheduleAccountNotice.js";

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
    private emailChangeTokenRepo: EmailChangeTokenRepository,
    private scheduleAccountNotice: ScheduleAccountNotice,
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
    // together, or none of them does (ADR-0097). A pending email change is
    // cancelled first, so the notice's advice to change the password stops it
    // (credential-changes D-09); then sessions end, as in ChangePassword, so
    // every path takes its locks in the same order.
    await this.tx.runInTransaction(async (tx) => {
      await this.emailChangeTokenRepo.supersedeAllForUser(user.id, now, tx);
      await this.refreshTokenRepo.revokeAllForUser(user.id, now, tx);
      await this.userRepo.save(user, tx);
      // Spent last and conditionally: a racing reset, or a confirmed email
      // change that revoked this link, leaves nothing to spend, and the whole
      // reset rolls back (#351, credential-changes D-11). First would lock
      // reset tokens ahead of the user row, the opposite of a confirmation.
      if (!(await this.tokenRepo.spend(token.id, now, tx))) {
        throw new ValidationError(INVALID_TOKEN_MESSAGE);
      }
    });

    logger.info("auth.sessions.revoked", {
      userId: user.id,
      reason: "password_reset",
    });

    // After the commit, so the notice never reports a change that rolled back (AC-10).
    await this.scheduleAccountNotice.execute({
      userId: user.id,
      notice: "password_changed",
    });
  }
}
