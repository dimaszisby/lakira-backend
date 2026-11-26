import crypto from "node:crypto";
import logger from "@/utils/logger.js";
import type { TransactionPort } from "@/shared/application/ports/TransactionPort.js";
import {
  ConflictError,
  ValidationError,
} from "@/shared/domain/errors/DomainError.js";
import { UserRepository } from "../../domain/repositories/UserRepository.js";
import { EmailChangeTokenRepository } from "../../domain/repositories/EmailChangeTokenRepository.js";
import { EmailVerificationTokenRepository } from "../../domain/repositories/EmailVerificationTokenRepository.js";
import { PasswordResetTokenRepository } from "../../domain/repositories/PasswordResetTokenRepository.js";
import { EMAIL_IN_USE } from "./RequestEmailChange.js";

/** One answer for unknown, spent, superseded and expired: it names no account. */
export const INVALID_EMAIL_CHANGE_TOKEN =
  "Email change link is invalid or has expired.";

export type ConfirmEmailChangeInput = { token: string };
export type ConfirmEmailChangeDeps = { now?: () => Date };

/**
 * `POST /auth/confirm-email-change` (credential-changes D-02). Opening the link
 * proves control of the new address, so the change is applied and the address
 * is verified. Needs no session: the link may be opened on another device.
 */
export class ConfirmEmailChange {
  constructor(
    private userRepo: UserRepository,
    private emailChangeTokenRepo: EmailChangeTokenRepository,
    private verificationTokenRepo: EmailVerificationTokenRepository,
    private resetTokenRepo: PasswordResetTokenRepository,
    private tx: TransactionPort,
    private deps: ConfirmEmailChangeDeps = {},
  ) {}

  async execute(input: ConfirmEmailChangeInput): Promise<void> {
    const tokenHash = crypto
      .createHash("sha256")
      .update(input.token)
      .digest("hex");
    const request = await this.emailChangeTokenRepo.findByTokenHash(tokenHash);
    if (!request) throw new ValidationError(INVALID_EMAIL_CHANGE_TOKEN);

    const now = this.deps.now ? this.deps.now() : new Date();

    // The token row is locked first, then the user's, as a password change or
    // reset takes them (D-09), so the two cannot deadlock.
    await this.tx.runInTransaction(async (tx) => {
      // Spent in one conditional update: of two racing confirmations, the
      // second changes nothing and gets the same 400 (AC-8).
      if (!(await this.emailChangeTokenRepo.spend(request.id, now, tx))) {
        throw new ValidationError(INVALID_EMAIL_CHANGE_TOKEN);
      }

      const user = await this.userRepo.findById(request.userId, tx);
      if (!user) throw new ValidationError(INVALID_EMAIL_CHANGE_TOKEN);

      // Taken since the request: the throw rolls the spend back with the rest.
      // The unique index stays the backstop for a registration racing this.
      if (await this.userRepo.existsByEmail(request.newEmail, tx)) {
        throw new ConflictError(EMAIL_IN_USE);
      }

      user.changeEmail(request.newEmail);
      user.setEmailVerifiedAt(now);
      await this.userRepo.save(user, tx);

      // Links sent to the old address must not act on the new one, and no
      // other pending change outlives this one (D-11).
      await this.emailChangeTokenRepo.supersedeAllForUser(user.id, now, tx);
      await this.verificationTokenRepo.revokeAllForUser(user.id, now, tx);
      await this.resetTokenRepo.invalidateAllForUser(user.id, now, tx);
    });

    logger.info("auth.email_change.confirmed", { userId: request.userId });
  }
}
