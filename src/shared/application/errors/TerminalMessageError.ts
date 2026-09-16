/**
 * A message that no number of retries will fix: malformed content, an identity the
 * idempotency guard refuses, a job for a metric the user does not own. The consumer parks
 * these at once instead of spending the retry budget on them (ADR-0005).
 *
 * Only errors marked this way are terminal. Anything unrecognised is retried: wrongly
 * retrying costs a delay, wrongly parking costs the work.
 */
export class TerminalMessageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TerminalMessageError";
  }
}

export const isTerminalMessageError = (
  error: unknown,
): error is TerminalMessageError => error instanceof TerminalMessageError;
