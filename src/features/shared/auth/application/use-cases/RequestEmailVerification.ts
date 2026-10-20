import crypto from "node:crypto";
import logger from "@/utils/logger.js";
import { UserRepository } from "../../domain/repositories/UserRepository.js";
import { EmailVerificationTokenRepository } from "../../domain/repositories/EmailVerificationTokenRepository.js";
import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";
import { EmailSender, type EmailMessage } from "../ports/EmailSender.js";

export const VERIFICATION_TOKEN_TTL_SEC = 86400;

export type RequestEmailVerificationInput = {
  userId: string;
};

export type RequestEmailVerificationDeps = {
  frontendVerifyUrl: string;
  buildEmail: (
    link: string,
    ttlHours: number,
  ) => {
    subject: string;
    text: string;
    html: string;
  };
  ttlSec?: number;
  now?: () => Date;
};

export class RequestEmailVerification {
  constructor(
    private userRepo: UserRepository,
    private tokenRepo: EmailVerificationTokenRepository,
    private emailSender: EmailSender,
    private deps: RequestEmailVerificationDeps,
  ) {}

  /** In process: a failed send is logged, not retried. */
  async execute(input: RequestEmailVerificationInput): Promise<void> {
    const email = await this.issue(input.userId);
    if (!email) return;

    try {
      await this.emailSender.send(email);
    } catch (error) {
      logger.error("Failed to send verification email", {
        userId: input.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * For the queued job (durable-verification-email D-03). The token is written
   * through `tx` and a failed send throws, so the caller's transaction rolls the
   * token back with it and the job is retried.
   */
  async executeInTransaction(
    userId: string,
    tx: PersistenceTransaction,
  ): Promise<void> {
    const email = await this.issue(userId, tx);
    if (!email) return;
    await this.emailSender.send(email);
  }

  /** Revokes the user's earlier tokens and mints one; null when no email is owed. */
  private async issue(
    userId: string,
    tx?: PersistenceTransaction,
  ): Promise<EmailMessage | null> {
    const user = await this.userRepo.findById(userId, tx);
    if (!user) return null;

    if (user.emailVerifiedAt !== null) return null;

    const now = this.deps.now ? this.deps.now() : new Date();
    const ttlSec = this.deps.ttlSec ?? VERIFICATION_TOKEN_TTL_SEC;

    await this.tokenRepo.revokeAllForUser(user.id, now, tx);

    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
    const expiresAt = new Date(now.getTime() + ttlSec * 1000);

    await this.tokenRepo.save({ userId: user.id, tokenHash, expiresAt }, tx);

    const link = this.buildVerifyLink(rawToken);
    const ttlHours = Math.round(ttlSec / 3600);
    const message = this.deps.buildEmail(link, ttlHours);

    return {
      to: user.email,
      subject: message.subject,
      html: message.html,
      text: message.text,
    };
  }

  private buildVerifyLink(rawToken: string): string {
    const base = this.deps.frontendVerifyUrl;
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}token=${encodeURIComponent(rawToken)}`;
  }
}
