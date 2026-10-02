import logger from "@/utils/logger.js";

/**
 * Work started after the response is sent (ADR-0054).
 *
 * A bare promise outlives the request with nothing able to wait for it:
 * shutdown closes the database underneath it, and the next integration test
 * truncates the tables it is writing to. Everything registered here can be
 * awaited with `drainBackgroundTasks`.
 */

/** How long shutdown waits for background work before closing connections. */
export const SHUTDOWN_DRAIN_TIMEOUT_MS = 10_000;

const pending = new Map<Promise<void>, string>();

/**
 * Starts `task` without making the caller wait for it. A rejection or a
 * synchronous throw is logged with `label` and `meta`, and never propagates.
 */
export const runInBackground = (
  label: string,
  task: () => Promise<unknown>,
  meta: Record<string, unknown> = {},
): void => {
  let started: Promise<unknown>;
  try {
    started = task();
  } catch (error) {
    started = Promise.reject(error);
  }

  const tracked: Promise<void> = started
    .then(
      () => undefined,
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        // The message carries the detail: the development format prints no
        // metadata.
        logger.error(`[BACKGROUND] Task failed: ${label}: ${message}`, {
          ...meta,
          error: message,
          ...(error instanceof Error
            ? { errorName: error.name, stack: error.stack }
            : {}),
        });
      },
    )
    // A throwing logger must not turn into an unhandled rejection.
    .catch(() => undefined)
    .finally(() => {
      pending.delete(tracked);
    });

  pending.set(tracked, label);
};

export const pendingBackgroundTaskCount = (): number => pending.size;

/**
 * Resolves once no background task is pending, including any started while
 * draining. With `timeoutMs`, gives up at the deadline, warns with the labels
 * still pending, and resolves with how many it left running. Those stay
 * tracked, so a later drain still waits for them.
 */
export const drainBackgroundTasks = async (
  timeoutMs?: number,
): Promise<number> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const deadline =
    timeoutMs === undefined
      ? undefined
      : new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            timedOut = true;
            resolve();
          }, timeoutMs);
        });

  try {
    while (pending.size > 0 && !timedOut) {
      const settled = Promise.all(pending.keys());
      await (deadline ? Promise.race([settled, deadline]) : settled);
    }
  } finally {
    clearTimeout(timer);
  }

  if (pending.size > 0) {
    const labels = [...pending.values()];
    // Labels are in the message too: the development format prints no metadata.
    logger.warn(
      `[BACKGROUND] Drain timeout — abandoning: ${labels.join(", ")}`,
      { pending: labels },
    );
  }
  return pending.size;
};
