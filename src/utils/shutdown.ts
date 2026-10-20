import type http from "http";
import logger, { flushLogs } from "@/utils/logger.js";

/**
 * Process shutdown with one deadline, run once (ADR-0076).
 *
 * The server and the worker each hand their steps to `createShutdown`. A
 * second signal, or an error thrown while the steps run, joins the run already
 * going instead of starting another that exits underneath it. Whatever the
 * steps wait on, the process exits by the deadline.
 */

/** The whole shutdown, steps and log flush included. Under Render's 30 s. */
export const SHUTDOWN_TIMEOUT_MS = 25_000;

/** How long the server waits for open connections before closing them. */
export const HTTP_CLOSE_TIMEOUT_MS = 5_000;

/** How long the worker's consumers drain in-flight messages. */
export const WORKER_DRAIN_TIMEOUT_MS = 20_000;

/** The flush after the deadline has passed; the process exits either way. */
const DEADLINE_FLUSH_TIMEOUT_MS = 1_000;

interface ShutdownOptions {
  /** Prefix for the log lines, e.g. "SERVER". */
  label: string;
  /** Closes the process's resources. Receives the first call's exit code. */
  steps: (exitCode: number) => Promise<void>;
  timeoutMs?: number;
  exit?: (code: number) => void;
  flush?: () => Promise<void>;
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export const createShutdown = ({
  label,
  steps,
  timeoutMs = SHUTDOWN_TIMEOUT_MS,
  exit = (code) => process.exit(code),
  flush = flushLogs,
}: ShutdownOptions) => {
  let running: Promise<void> | null = null;
  let exitCode = 0;

  const run = async (): Promise<void> => {
    const finished = (async () => {
      try {
        await steps(exitCode);
        logger.info(`[${label}] Cleanup completed. Exiting.`);
      } catch (error) {
        logger.error(`[${label}] Error during shutdown:`, error);
        exitCode = exitCode || 1;
      }
      // A failed flush loses log lines, not the exit.
      await flush().catch(() => undefined);
      return true;
    })().catch(() => {
      // Only a throwing logger lands here.
      exitCode = exitCode || 1;
      return true;
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });

    // `finished` never rejects, so the race always settles.
    const inTime = await Promise.race([finished, deadline]);
    clearTimeout(timer);

    try {
      if (!inTime) {
        exitCode = exitCode || 1;
        logger.error(
          `[${label}] Shutdown did not finish within ${timeoutMs} ms; exiting.`,
        );
        await Promise.race([
          flush().catch(() => undefined),
          wait(DEADLINE_FLUSH_TIMEOUT_MS),
        ]);
      }
    } finally {
      exit(exitCode);
    }
  };

  return (reason: string, code = 0): Promise<void> => {
    // A crash during a graceful stop is not hidden by the stop's exit code.
    exitCode = exitCode || code;
    if (running) {
      logger.warn(`[${label}] Already shutting down (${reason}).`);
      return running;
    }
    logger.info(`[${label}] Received ${reason}, shutting down...`);
    running = run();
    return running;
  };
};

/**
 * Closes `server`. A connection still open when `timeoutMs` passes is closed
 * rather than waited for, so this always resolves.
 */
export const closeHttpServer = (
  server: http.Server,
  timeoutMs = HTTP_CLOSE_TIMEOUT_MS,
): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => {
      logger.warn(
        `[SERVER] Connections still open after ${timeoutMs} ms; closing them.`,
      );
      server.closeAllConnections();
    }, timeoutMs);
    server.close(() => {
      clearTimeout(timer);
      resolve();
    });
  });
