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
  InviteEmailJob,
  InviteUserToOrganization,
} from "./InviteUserToOrganization.js";

/** What `src/worker.ts` runs for each invite email job (ADR-0070). */
export class SendInviteEmailHandler {
  constructor(
    private inviteUserToOrganization: InviteUserToOrganization,
    private idempotency: MessageIdempotencyPort,
  ) {}

  async handle(msg: IncomingMessage, { queue }: MessageContext): Promise<void> {
    const { inviteId } = parseJob(msg.content);
    const messageId = msg.properties.messageId as unknown;

    // The token hash and the dedup record share one transaction, and the send
    // runs inside it: a failed send rolls both back and the consumer retries
    // (D-02).
    const outcome = await this.idempotency.runOnce({ messageId, queue }, (tx) =>
      this.inviteUserToOrganization.executeInTransaction(inviteId, tx),
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
const parseJob = (content: Buffer): InviteEmailJob => {
  const { inviteId } = readJobBody(content);
  if (!isUuid(inviteId)) {
    throw new TerminalMessageError(
      "Refusing invite email job without an invite id.",
    );
  }
  return { inviteId };
};
