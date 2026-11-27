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
import type {
  EmailChangeEmailJob,
  RequestEmailChange,
} from "./RequestEmailChange.js";

/** What `src/worker.ts` runs for each email-change confirmation job (credential-changes D-05). */
export class SendEmailChangeEmailHandler {
  constructor(
    private requestEmailChange: RequestEmailChange,
    private idempotency: MessageIdempotencyPort,
  ) {}

  async handle(msg: IncomingMessage, { queue }: MessageContext): Promise<void> {
    const { requestId } = parseJob(msg.content);
    const messageId = msg.properties.messageId as unknown;

    // The token's hash and the dedup record share one transaction, and the
    // send runs inside it: a failed send rolls both back and the consumer retries.
    const outcome = await this.idempotency.runOnce({ messageId, queue }, (tx) =>
      this.requestEmailChange.executeInTransaction(requestId, tx),
    );

    if (outcome === "duplicate") {
      logger.info("[RABBITMQ] Duplicate message skipped.", {
        messageId,
        queue,
      });
    }
  }
}

/** A message no retry can fix parks at once. */
const parseJob = (content: Buffer): EmailChangeEmailJob => {
  const { requestId } = readJobBody(content);
  if (!isUuid(requestId)) {
    throw new TerminalMessageError(
      "Refusing email-change email job without a request id.",
    );
  }
  return { requestId };
};
