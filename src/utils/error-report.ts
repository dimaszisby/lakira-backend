import * as Sentry from "@sentry/node";

/**
 * Reports an error to Sentry, tagged with ids only: a queue, a channel, a message id, a
 * reason. Never an address, a token or a job body; the scrub hooks clean the error itself
 * (ADR-0071). Without `initSentry` it does nothing, as the SDK does.
 */
export const reportError = (
  error: unknown,
  tags: Record<string, string | undefined>,
): void => {
  const defined = Object.fromEntries(
    Object.entries(tags).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  Sentry.captureException(error, { tags: defined });
};

/** Sends what Sentry still holds, within `timeoutMs`; resolves either way (ADR-0103). */
export const flushErrorReports = async (timeoutMs: number): Promise<void> => {
  await Sentry.flush(timeoutMs);
};
