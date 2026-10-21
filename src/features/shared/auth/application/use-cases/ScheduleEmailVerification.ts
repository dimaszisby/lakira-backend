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
   * loses it (ADR-0054). Used when the queue is off.
   */
  sendInProcess: (input: ScheduleEmailVerificationInput) => void;
  /**
   * Runs the job in this process, after the response, recorded under `messageId` and the
   * job's queue, as the worker records it. Used when a publish fails: it may still have
   * reached the broker, and whichever of the two runs second sends nothing
   * (queue-failure-paths D-03, ADR-0080; audit 2026-10-20 X68).
   */
  sendJobInProcess: (
    input: ScheduleEmailVerificationInput & { messageId: string },
  ) => void;
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
    const messageId = randomUUID();
    try {
      await this.queue.publish(EXCHANGES.JOBS, job, {
        routingKey: ROUTING_KEYS.AUTH_SEND_VERIFICATION_EMAIL,
        messageId,
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
      this.deps.sendJobInProcess({ ...input, messageId });
    }
  }
}
