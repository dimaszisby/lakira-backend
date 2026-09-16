import { Transaction, UniqueConstraintError } from "sequelize";
import sequelize from "@/config/db.js";
import { ProcessedMessage } from "./persistence/processed-message.sequelize.js";
import { TerminalMessageError } from "@/shared/application/errors/TerminalMessageError.js";
import type {
  IdempotencyKey,
  IdempotencyOutcome,
  MessageIdempotencyPort,
  PersistenceTransaction,
} from "@/shared/application/ports/MessageIdempotencyPort.js";

/** processed_messages.message_id is STRING(36). */
const MAX_MESSAGE_ID_LENGTH = 36;

/**
 * A message that cannot be deduplicated is refused rather than processed unguarded:
 * processing it would reintroduce the duplicate writes ADR-0007 exists to prevent, and
 * the parking lot makes the misbehaving publisher visible. Terminal: a message never
 * acquires a messageId, so retrying it is pointless.
 */
export class InvalidMessageIdError extends TerminalMessageError {
  constructor(messageId: unknown) {
    super(
      `Refusing message with unusable messageId (${String(messageId)}): ` +
        `idempotency requires a string of 1-${MAX_MESSAGE_ID_LENGTH} characters.`,
    );
    this.name = "InvalidMessageIdError";
  }
}

/** Rolls the transaction back when the dedup insert hits an existing row. */
class DuplicateMessage extends Error {}

export class SequelizeMessageIdempotency implements MessageIdempotencyPort {
  async runOnce(
    { messageId, queue, organizationId = null }: IdempotencyKey,
    work: (tx: PersistenceTransaction) => Promise<void>,
  ): Promise<IdempotencyOutcome> {
    if (
      typeof messageId !== "string" ||
      messageId.length === 0 ||
      messageId.length > MAX_MESSAGE_ID_LENGTH
    ) {
      throw new InvalidMessageIdError(messageId);
    }

    try {
      await sequelize.transaction(async (transaction: Transaction) => {
        // Only this insert may signal a duplicate. A unique violation raised by `work`
        // must fail the message, not be mistaken for a skip — that would lose work.
        try {
          await ProcessedMessage.create(
            { messageId, queue, organizationId },
            { transaction },
          );
        } catch (error) {
          if (error instanceof UniqueConstraintError) {
            throw new DuplicateMessage();
          }
          throw error;
        }

        await work(transaction);
      });
      return "processed";
    } catch (error) {
      if (error instanceof DuplicateMessage) {
        return "duplicate";
      }
      throw error;
    }
  }
}
