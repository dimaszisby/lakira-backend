import { ValidationError } from "@/shared/domain/errors/DomainError.js";
import crypto from "node:crypto";
import { UserRepository } from "../../domain/repositories/UserRepository.js";
import { PasswordResetTokenRepository } from "../../domain/repositories/PasswordResetTokenRepository.js";
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

    const passwordHash = await this.hasher.hash(input.password);
    user.setPasswordHash(passwordHash);
    await this.userRepo.save(user);

    await this.tokenRepo.markUsed(token.id, now);
  }
}
