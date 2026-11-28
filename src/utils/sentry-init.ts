import * as Sentry from "@sentry/node";
import { env } from "@/config/envManager.js";
import { SENTRY_DATA_COLLECTION, SENTRY_SCRUB_HOOKS } from "./sentry-scrub.js";

type Integration = ReturnType<typeof Sentry.onUnhandledRejectionIntegration>;

export interface InitSentryOptions {
  /** Tags every event, so a worker's crash is told from the API's. */
  processName: "api" | "worker";
  /** The process's own integrations, after the defaults. */
  integrations?: Integration[];
  /** Sentry's Dedupe drops an event equal to the one before it; false turns it off. */
  dedupe?: boolean;
}

/**
 * Starts Sentry for a process, when `SENTRY_DSN` is set. The one `Sentry.init` in `src/`:
 * the server and the worker both call it, so both send under the same settings and through
 * the same scrub hooks (ADR-0071, ADR-0103).
 */
export const initSentry = ({
  processName,
  integrations = [],
  dedupe = true,
}: InitSentryOptions): void => {
  if (!env.SENTRY_DSN) return;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    environment: env.NODE_ENV,
    release: env.APP_RELEASE,
    initialScope: { tags: { process: processName } },
    // Sentry 11 collects every data category it is not told to leave alone; each
    // is named and off (ADR-0071). The hooks then clean an error's message and
    // what application code passes. Spans and logs never reach beforeSend, so each
    // has its own hook; the app sends no logs, and the hook is set so starting to
    // cannot skip it.
    dataCollection: SENTRY_DATA_COLLECTION,
    ...SENTRY_SCRUB_HOOKS,
    // Pinned, not inherited: the span hook is written for streamed spans, and a
    // static lifecycle would never call it (sentry-11-data-collection D-03).
    traceLifecycle: "stream",
    // 10's default. 11 turns it on, which attaches a stack to captured messages
    // and changes how issues group (D-05).
    attachStacktrace: false,
    integrations: (defaults) => [
      ...defaults.filter(
        ({ name }) =>
          name !== "OnUnhandledRejection" && (dedupe || name !== "Dedupe"),
      ),
      // Its default "warn" mode prints the rejection's raw stack with console.error,
      // past the logger's masking; the entry point's own handler logs it (ADR-0103).
      Sentry.onUnhandledRejectionIntegration({ mode: "none" }),
      ...integrations,
    ],
  });
};
