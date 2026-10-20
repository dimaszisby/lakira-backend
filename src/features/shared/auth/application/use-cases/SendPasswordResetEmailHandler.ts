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
  PasswordResetEmailJob,
  RequestPasswordReset,
} from "./RequestPasswordReset.js";

/** What `src/worker.ts` runs for each password-reset email job (ADR-0069). */
export class SendPasswordResetEmailHandler {
  constructor(
    private requestPasswordReset: RequestPasswordReset,
    private idempotency: MessageIdempotencyPort,
  ) {}

  async handle(msg: IncomingMessage, { queue }: MessageContext): Promise<void> {
    const { userId } = parseJob(msg.content);
    const messageId = msg.properties.messageId as unknown;

    // The token and the dedup record share one transaction, and the send runs
    // inside it: a failed send rolls both back and the consumer retries (D-02).
    const outcome = await this.idempotency.runOnce({ messageId, queue }, (tx) =>
      this.requestPasswordReset.executeInTransaction(userId, tx),
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
const parseJob = (content: Buffer): PasswordResetEmailJob => {
  const { userId } = readJobBody(content);
  if (!isUuid(userId)) {
    throw new TerminalMessageError(
      "Refusing password-reset email job without a user id.",
    );
  }
  return { userId };
};
