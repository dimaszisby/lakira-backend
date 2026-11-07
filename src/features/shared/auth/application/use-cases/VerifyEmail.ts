import { ValidationError } from "@/shared/domain/errors/DomainError.js";
import crypto from "node:crypto";
import { UserRepository } from "../../domain/repositories/UserRepository.js";
import { EmailVerificationTokenRepository } from "../../domain/repositories/EmailVerificationTokenRepository.js";

const INVALID_TOKEN_MESSAGE = "Verification link is invalid or has expired.";

export type VerifyEmailInput = {
  token: string;
};

export type VerifyEmailDeps = {
  now?: () => Date;
};

export class VerifyEmail {
  constructor(
    private userRepo: UserRepository,
    private tokenRepo: EmailVerificationTokenRepository,
    private deps: VerifyEmailDeps = {},
  ) {}

  async execute(input: VerifyEmailInput): Promise<void> {
    const now = this.deps.now ? this.deps.now() : new Date();
    const tokenHash = crypto
      .createHash("sha256")
      .update(input.token)
      .digest("hex");

    const token = await this.tokenRepo.findByTokenHash(tokenHash);
    if (!token || !token.isUsable(now)) {
      throw new ValidationError(INVALID_TOKEN_MESSAGE);
    }

    const user = await this.userRepo.findById(token.userId);
    if (!user) {
      throw new ValidationError(INVALID_TOKEN_MESSAGE);
    }

    user.setEmailVerifiedAt(now);
    await this.userRepo.save(user);

    // TOCTOU: findByTokenHash + markUsed are not atomic, so two concurrent
    // requests could both pass isUsable(). This is accepted because double-
    // verification is idempotent (same user, same timestamp). If this service
    // scales to multiple instances, replace with an atomic
    // UPDATE ... WHERE used_at IS NULL RETURNING * pattern.
    await this.tokenRepo.markUsed(token.id, now);
  }
}
