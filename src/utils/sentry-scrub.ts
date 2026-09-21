import { SENSITIVE_KEY_PATTERN } from "../config/sensitive-keys.js";
import { redactObject } from "./logger.js";

/**
 * The parts of a Sentry event this scrubber touches. Structural rather than importing
 * Sentry's `ErrorEvent`, so a version bump cannot silently change what is scrubbed.
 */
export type ScrubbableEvent = {
  request?: {
    headers?: Record<string, string>;
    cookies?: Record<string, string> | string;
    data?: unknown;
    query_string?: unknown;
  };
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
};

const redactRecord = (
  record: Record<string, string>,
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const key of Object.keys(record)) {
    out[key] = SENSITIVE_KEY_PATTERN.test(key) ? "***REDACTED***" : record[key];
  }
  return out;
};

/**
 * Strips credentials from a Sentry event before egress.
 *
 * `@sentry/node` v8+ defaults `sendDefaultPii: false`, so the SDK does not attach headers,
 * cookies or request bodies on its own — which is why SaaS-readiness caveat C5 overstated the
 * gap. What the default does **not** cover is data the application passes explicitly
 * (`captureException` context, `extra`, properties riding on an error object). This closes that.
 *
 * See `docs/internal/initiatives/log-redaction-coverage/decisions.md` D-02.
 */
export const scrubSentryEvent = <T extends ScrubbableEvent>(event: T): T => {
  if (event.request) {
    if (event.request.headers) {
      event.request.headers = redactRecord(event.request.headers);
    }
    // Cookies are never useful in a stack trace and always carry the session.
    delete event.request.cookies;
    if (event.request.data !== undefined) {
      event.request.data = redactObject(event.request.data, 0);
    }
  }
  if (event.extra) {
    event.extra = redactObject(event.extra, 0) as Record<string, unknown>;
  }
  if (event.contexts) {
    event.contexts = redactObject(event.contexts, 0) as Record<string, unknown>;
  }
  return event;
};
