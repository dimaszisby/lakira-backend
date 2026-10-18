import { randomUUID } from "node:crypto";
import logger from "@/utils/logger.js";
import {
  EXCHANGES,
  ROUTING_KEYS,
} from "@/shared/application/messaging/job-routes.js";
import type { MessageQueuePort } from "@/shared/application/ports/MessageQueuePort.js";
import type { VerificationEmailJob } from "./SendVerificationEmailHandler.js";

export type ScheduleEmailVerificationInput = {
  userId: string;
  /** Why the email is owed; names the in-process task in the logs (ADR-0054). */
  reason: "register" | "resend";
};

export type ScheduleEmailVerificationDeps = {
  /**
   * Sends the email in this process, after the response. Not durable: a crash
   * loses it (ADR-0054). Used when the queue is off or a publish fails.
   */
  sendInProcess: (input: ScheduleEmailVerificationInput) => void;
};

/**
 * Hands the verification email to the worker when the queue is on, so a crash or
 * a failed send does not lose it (ADR-0067). Never fails the request: a publish
 * that throws falls back to sending in process (durable-verification-email D-04).
 */
export class ScheduleEmailVerification {
  constructor(
    private queue: MessageQueuePort,
    private deps: ScheduleEmailVerificationDeps,
  ) {}

  async execute(input: ScheduleEmailVerificationInput): Promise<void> {
    if (!this.queue.isEnabled()) {
      this.deps.sendInProcess(input);
      return;
    }

    const job: VerificationEmailJob = { userId: input.userId };
    try {
      await this.queue.publish(EXCHANGES.JOBS, job, {
        routingKey: ROUTING_KEYS.AUTH_SEND_VERIFICATION_EMAIL,
        messageId: randomUUID(),
      });
    } catch (error) {
      logger.warn(
        "[RABBITMQ] Verification email not queued; sending it in process.",
        {
          userId: input.userId,
          reason: input.reason,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      this.deps.sendInProcess(input);
    }
  }
}
