import crypto, { randomUUID } from "node:crypto";
import logger from "@/utils/logger.js";
import {
  EXCHANGES,
  ROUTING_KEYS,
} from "@/shared/application/messaging/job-routes.js";
import type { MessageQueuePort } from "@/shared/application/ports/MessageQueuePort.js";
import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";
import type { AuthUser } from "../../domain/entities/AuthUser.js";
import { UserRepository } from "../../domain/repositories/UserRepository.js";
import { PasswordResetTokenRepository } from "../../domain/repositories/PasswordResetTokenRepository.js";
import { EmailSender, type EmailMessage } from "../ports/EmailSender.js";

export const RESET_TOKEN_TTL_MINUTES = 15;

export type RequestPasswordResetInput = {
  email: string;
};

/** The whole message: who to email. No address, no token (durable-password-reset-email D-01). */
export type PasswordResetEmailJob = { userId: string };

export type RequestPasswordResetDeps = {
  frontendResetUrl: string;
  buildEmail: (
    link: string,
    ttlMinutes: number,
  ) => {
    subject: string;
    text: string;
    html: string;
  };
  ttlMinutes?: number;
  now?: () => Date;
};

export class RequestPasswordReset {
  constructor(
    private userRepo: UserRepository,
    private tokenRepo: PasswordResetTokenRepository,
    private emailSender: EmailSender,
    private queue: MessageQueuePort,
    private deps: RequestPasswordResetDeps,
  ) {}

  /**
   * Hands the email to the worker when the queue is on (ADR-0069). With the
   * queue off, or when the publish fails, sends it in the request as before
   * (D-04). Never fails and never says whether the account exists.
   */
  async execute(input: RequestPasswordResetInput): Promise<void> {
    const email = input.email.trim().toLowerCase();
    const user = await this.userRepo.findByEmail(email);
    if (!user) return;

    if (this.queue.isEnabled()) {
      const job: PasswordResetEmailJob = { userId: user.id };
      try {
        await this.queue.publish(EXCHANGES.JOBS, job, {
          routingKey: ROUTING_KEYS.AUTH_SEND_PASSWORD_RESET_EMAIL,
          messageId: randomUUID(),
        });
        return;
      } catch (error) {
        logger.warn(
          "[RABBITMQ] Password reset email not queued; sending it in the request.",
          {
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }

    await this.sendInRequest(user);
  }

  /**
   * For the queued job (durable-password-reset-email D-02). The tokens are
   * written through `tx` and a failed send throws, so the caller's transaction
   * rolls them back with it and the job is retried.
   */
  async executeInTransaction(
    userId: string,
    tx: PersistenceTransaction,
  ): Promise<void> {
    const user = await this.userRepo.findById(userId, tx);
    if (!user) return;
    await this.emailSender.send(await this.issue(user, tx));
  }

  /** In the request: a failed send is logged, not retried. */
  private async sendInRequest(user: AuthUser): Promise<void> {
    const message = await this.issue(user);
    try {
      await this.emailSender.send(message);
    } catch (error) {
      logger.error("Failed to send password reset email", {
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Invalidates the user's earlier tokens and mints one. */
  private async issue(
    user: AuthUser,
    tx?: PersistenceTransaction,
  ): Promise<EmailMessage> {
    const now = this.deps.now ? this.deps.now() : new Date();
    const ttlMinutes = this.deps.ttlMinutes ?? RESET_TOKEN_TTL_MINUTES;

    await this.tokenRepo.invalidateAllForUser(user.id, now, tx);

    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

    await this.tokenRepo.create({ userId: user.id, tokenHash, expiresAt }, tx);

    const link = this.buildResetLink(rawToken);
    const message = this.deps.buildEmail(link, ttlMinutes);

    return {
      to: user.email,
      subject: message.subject,
      html: message.html,
      text: message.text,
    };
  }

  private buildResetLink(rawToken: string): string {
    const base = this.deps.frontendResetUrl;
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}token=${encodeURIComponent(rawToken)}`;
  }
}
