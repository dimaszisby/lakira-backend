import crypto, { randomUUID } from "node:crypto";
import logger from "@/utils/logger.js";
import {
  EXCHANGES,
  QUEUES,
  ROUTING_KEYS,
} from "@/shared/application/messaging/job-routes.js";
import type { MessageIdempotencyPort } from "@/shared/application/ports/MessageIdempotencyPort.js";
import type { MessageQueuePort } from "@/shared/application/ports/MessageQueuePort.js";
import type { TransactionPort } from "@/shared/application/ports/TransactionPort.js";
import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/shared/domain/errors/DomainError.js";
import { UserRepository } from "../../domain/repositories/UserRepository.js";
import { EmailChangeTokenRepository } from "../../domain/repositories/EmailChangeTokenRepository.js";
import { EmailSender } from "../ports/EmailSender.js";
import { ConfirmCurrentPassword } from "./ConfirmCurrentPassword.js";
import { ScheduleAccountNotice } from "./ScheduleAccountNotice.js";

/** As a verification link: both prove control of an inbox (credential-changes D-10). */
export const EMAIL_CHANGE_TOKEN_TTL_HOURS = 24;
export const EMAIL_UNCHANGED = "The new email must differ from the current one";
export const EMAIL_IN_USE = "Email already in use";

export type RequestEmailChangeInput = {
  userId: string;
  currentPassword: string;
  email: string;
};

/** The whole message: which pending change. No address, no token (D-05). */
export type EmailChangeEmailJob = { requestId: string };

export type RequestEmailChangeDeps = {
  frontendEmailChangeUrl: string;
  buildEmail: (
    link: string,
    ttlHours: number,
  ) => { subject: string; text: string; html: string };
  now?: () => Date;
};

/**
 * `POST /auth/change-email` (credential-changes D-01, D-02). Asks for the
 * current password, then stores a pending change: the account's address moves
 * only when the link sent to the new one is confirmed. The confirmation goes to
 * the worker as the reset email does (ADR-0069), and the old address is told.
 */
export class RequestEmailChange {
  constructor(
    private userRepo: UserRepository,
    private emailChangeTokenRepo: EmailChangeTokenRepository,
    private emailSender: EmailSender,
    private queue: MessageQueuePort,
    private idempotency: MessageIdempotencyPort,
    private confirmCurrentPassword: ConfirmCurrentPassword,
    private scheduleAccountNotice: ScheduleAccountNotice,
    private tx: TransactionPort,
    private deps: RequestEmailChangeDeps,
  ) {}

  async execute(input: RequestEmailChangeInput): Promise<void> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) throw new NotFoundError("User not found");

    await this.confirmCurrentPassword.execute(user, input.currentPassword);

    const newEmail = input.email.trim().toLowerCase();
    if (newEmail === user.email) {
      throw new ValidationError(EMAIL_UNCHANGED, { field: "email" });
    }
    if (await this.userRepo.existsByEmail(newEmail)) {
      throw new ConflictError(EMAIL_IN_USE);
    }

    const now = this.deps.now ? this.deps.now() : new Date();
    const expiresAt = new Date(
      now.getTime() + EMAIL_CHANGE_TOKEN_TTL_HOURS * 60 * 60 * 1000,
    );

    // A new request replaces a pending one, and its link stops working (AC-9).
    const request = await this.tx.runInTransaction(async (tx) => {
      await this.emailChangeTokenRepo.supersedeAllForUser(user.id, now, tx);
      return this.emailChangeTokenRepo.create(
        { userId: user.id, newEmail, oldEmail: user.email, expiresAt },
        tx,
      );
    });

    logger.info("auth.email_change.requested", { userId: user.id });

    await this.sendConfirmation(request.id);
    await this.scheduleAccountNotice.execute({
      userId: user.id,
      notice: "email_change_requested",
      requestId: request.id,
    });
  }

  /**
   * Hands the confirmation to the worker when the queue is on. With the queue
   * off, sends it in the request; when the publish fails, runs the job itself
   * under the id it tried to publish with, so whichever of this and the worker
   * runs second sends nothing (ADR-0080).
   */
  private async sendConfirmation(requestId: string): Promise<void> {
    if (!this.queue.isEnabled()) {
      await this.sendInRequest(requestId, (work) =>
        this.tx.runInTransaction(work),
      );
      return;
    }

    const job: EmailChangeEmailJob = { requestId };
    const messageId = randomUUID();
    try {
      await this.queue.publish(EXCHANGES.JOBS, job, {
        routingKey: ROUTING_KEYS.AUTH_SEND_EMAIL_CHANGE_EMAIL,
        messageId,
      });
      return;
    } catch (error) {
      logger.warn(
        "[RABBITMQ] Email change confirmation not queued; sending it in the request.",
        { requestId, error },
      );
    }

    await this.sendInRequest(requestId, async (work) => {
      const outcome = await this.idempotency.runOnce(
        { messageId, queue: QUEUES.AUTH_SEND_EMAIL_CHANGE_EMAIL },
        work,
      );
      if (outcome === "duplicate") {
        logger.info(
          "[RABBITMQ] Email change confirmation already sent by the worker.",
          { requestId, messageId },
        );
      }
    });
  }

  /** In the request: a failed send is logged, not retried; asking again sends another. */
  private async sendInRequest(
    requestId: string,
    run: (
      work: (tx: PersistenceTransaction) => Promise<void>,
    ) => Promise<unknown>,
  ): Promise<void> {
    try {
      await run((tx) => this.executeInTransaction(requestId, tx));
    } catch (error) {
      logger.error("Failed to send email change confirmation", {
        requestId,
        error,
      });
    }
  }

  /**
   * For the queued job. Mints the token, stores its hash on the row and sends
   * to the new address, all through `tx`: a failed send rolls the hash back and
   * the job is retried with a fresh one. A row already spent, superseded or
   * expired sends nothing.
   */
  async executeInTransaction(
    requestId: string,
    tx: PersistenceTransaction,
  ): Promise<void> {
    const request = await this.emailChangeTokenRepo.findById(requestId, tx);
    const now = this.deps.now ? this.deps.now() : new Date();
    if (!request || !request.isUsable(now)) return;

    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
    await this.emailChangeTokenRepo.setTokenHash(request.id, tokenHash, tx);

    const message = this.deps.buildEmail(
      this.buildLink(rawToken),
      EMAIL_CHANGE_TOKEN_TTL_HOURS,
    );
    await this.emailSender.send({ to: request.newEmail, ...message });
  }

  private buildLink(rawToken: string): string {
    const base = this.deps.frontendEmailChangeUrl;
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}token=${encodeURIComponent(rawToken)}`;
  }
}
