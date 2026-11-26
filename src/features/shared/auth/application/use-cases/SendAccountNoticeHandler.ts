import logger from "@/utils/logger.js";
import { TerminalMessageError } from "@/shared/application/errors/TerminalMessageError.js";
import {
  isUuid,
  readJobBody,
} from "@/shared/application/messaging/job-body.js";
import type { MessageIdempotencyPort } from "@/shared/application/ports/MessageIdempotencyPort.js";
import type {
  IncomingMessage,
  MessageContext,
} from "@/shared/application/ports/MessageHandlerPort.js";
import {
  ACCOUNT_NOTICES,
  type AccountNotice,
  type AccountNoticeJob,
  type SendAccountNotice,
} from "./SendAccountNotice.js";

/** What `src/worker.ts` runs for each account-notice job (credential-changes D-05). */
export class SendAccountNoticeHandler {
  constructor(
    private sendAccountNotice: SendAccountNotice,
    private idempotency: MessageIdempotencyPort,
  ) {}

  async handle(msg: IncomingMessage, { queue }: MessageContext): Promise<void> {
    const job = parseJob(msg.content);
    const messageId = msg.properties.messageId as unknown;

    // The dedup record and the send share one transaction: a failed send
    // rolls the record back and the consumer retries.
    const outcome = await this.idempotency.runOnce({ messageId, queue }, (tx) =>
      this.sendAccountNotice.executeInTransaction(job, tx),
    );

    if (outcome === "duplicate") {
      logger.info("[RABBITMQ] Duplicate message skipped.", {
        messageId,
        queue,
      });
    }
  }
}

const isAccountNotice = (value: unknown): value is AccountNotice =>
  typeof value === "string" &&
  (ACCOUNT_NOTICES as readonly string[]).includes(value);

/** A message no retry can fix parks at once. */
const parseJob = (content: Buffer): AccountNoticeJob => {
  const { userId, notice, requestId } = readJobBody(content);
  if (!isUuid(userId)) {
    throw new TerminalMessageError(
      "Refusing account-notice job without a user id.",
    );
  }
  if (!isAccountNotice(notice)) {
    throw new TerminalMessageError(
      "Refusing account-notice job with an unknown notice.",
    );
  }
  if (notice === "email_change_requested") {
    if (!isUuid(requestId)) {
      throw new TerminalMessageError(
        "Refusing email-change notice job without a request id.",
      );
    }
    return { userId, notice, requestId };
  }
  return { userId, notice };
};
