import { isTerminalMessageError } from "@/shared/application/errors/TerminalMessageError.js";

export const RETRY_COUNT_HEADER = "x-retry-count";

/** Caps exponential backoff so a large RABBITMQ_MAX_RETRIES cannot schedule a retry days out. */
export const MAX_RETRY_DELAY_MS = 300_000;

export type FailureDecision =
  | { action: "park"; reason: "terminal" | "exhausted" }
  | { action: "retry"; nextRetryCount: number; delayMs: number };

/**
 * Headers survive a redelivery unchanged, so the count only moves when the consumer
 * republishes. An absent or unreadable header counts as a first attempt; the republish
 * then writes a valid one, so the loop stays bounded either way.
 */
export const readRetryCount = (
  headers: Record<string, unknown> | undefined,
): number => {
  const parsed = parseInt(String(headers?.[RETRY_COUNT_HEADER] ?? "0"), 10);
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
};

export const decideOnFailure = ({
  error,
  retryCount,
  maxRetries,
  baseDelayMs,
}: {
  error: unknown;
  retryCount: number;
  maxRetries: number;
  baseDelayMs: number;
}): FailureDecision => {
  if (isTerminalMessageError(error)) {
    return { action: "park", reason: "terminal" };
  }
  if (retryCount >= maxRetries) {
    return { action: "park", reason: "exhausted" };
  }
  return {
    action: "retry",
    nextRetryCount: retryCount + 1,
    delayMs: Math.min(baseDelayMs * 2 ** retryCount, MAX_RETRY_DELAY_MS),
  };
};
