import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";

export type IdempotencyKey = {
  /** Taken as delivered. The adapter rejects anything it cannot record. */
  messageId: unknown;
  queue: string;
  organizationId?: string | null;
};

export type IdempotencyOutcome = "processed" | "duplicate";

export interface MessageIdempotencyPort {
  /**
   * Records the message as processed and runs `work` in one transaction: both commit or
   * both roll back (ADR-0007). A message already recorded skips `work` and resolves
   * "duplicate", which the consumer acks.
   *
   * Only database writes made through `tx` are covered. Other side effects (cache,
   * notifications) belong after this resolves "processed".
   */
  runOnce(
    key: IdempotencyKey,
    work: (tx: PersistenceTransaction) => Promise<void>,
  ): Promise<IdempotencyOutcome>;
}
