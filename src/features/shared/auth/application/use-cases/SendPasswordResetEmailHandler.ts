import logger from "@/utils/logger.js";
import { TerminalMessageError } from "@/shared/application/errors/TerminalMessageError.js";
import type { MessageIdempotencyPort } from "@/shared/application/ports/MessageIdempotencyPort.js";
import type {
  IncomingMessage,
  MessageContext,
} from "@/shared/application/ports/MessageHandlerPort.js";
import type {
  PasswordResetEmailJob,
  RequestPasswordReset,
} from "./RequestPasswordReset.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  let body: unknown;
  try {
    body = JSON.parse(content.toString());
  } catch (error) {
    throw new TerminalMessageError("Refusing message with malformed JSON.", {
      cause: error,
    });
  }

  const userId = (body as { userId?: unknown } | null)?.userId;
  if (typeof userId !== "string" || !UUID.test(userId)) {
    throw new TerminalMessageError(
      "Refusing password-reset email job without a user id.",
    );
  }
  return { userId };
};
