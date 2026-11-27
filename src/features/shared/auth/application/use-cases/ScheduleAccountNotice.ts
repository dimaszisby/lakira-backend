import { randomUUID } from "node:crypto";
import logger from "@/utils/logger.js";
import {
  EXCHANGES,
  ROUTING_KEYS,
} from "@/shared/application/messaging/job-routes.js";
import type { MessageQueuePort } from "@/shared/application/ports/MessageQueuePort.js";
import type { AccountNoticeJob } from "./SendAccountNotice.js";

export type ScheduleAccountNoticeDeps = {
  /**
   * Sends the notice in this process, after the response. Not durable: a crash
   * loses it (ADR-0054). Used when the queue is off.
   */
  sendInProcess: (job: AccountNoticeJob) => void;
  /**
   * Runs the job in this process, after the response, recorded under
   * `messageId` and the job's queue, as the worker records it. Used when a
   * publish fails: whichever of the two runs second sends nothing (ADR-0080).
   */
  sendJobInProcess: (job: AccountNoticeJob & { messageId: string }) => void;
};

/**
 * Hands an account notice to the worker, as the verification email is
 * (ADR-0067, credential-changes D-05). Never fails the request that owes it: a
 * notice is sent after the change it reports has committed.
 */
export class ScheduleAccountNotice {
  constructor(
    private queue: MessageQueuePort,
    private deps: ScheduleAccountNoticeDeps,
  ) {}

  async execute(job: AccountNoticeJob): Promise<void> {
    if (!this.queue.isEnabled()) {
      this.deps.sendInProcess(job);
      return;
    }

    const messageId = randomUUID();
    try {
      await this.queue.publish(EXCHANGES.JOBS, job, {
        routingKey: ROUTING_KEYS.AUTH_SEND_ACCOUNT_NOTICE,
        messageId,
      });
    } catch (error) {
      logger.warn(
        "[RABBITMQ] Account notice not queued; sending it in process.",
        {
          userId: job.userId,
          notice: job.notice,
          error,
        },
      );
      this.deps.sendJobInProcess({ ...job, messageId });
    }
  }
}
