import { SENSITIVE_KEY_PATTERN } from "../config/sensitive-keys.js";
import { redactObject } from "./logger.js";

/**
 * The parts of a Sentry event this scrubber touches. Structural rather than importing
 * Sentry's `ErrorEvent`, so a version bump cannot silently change what is scrubbed.
 */
export type ScrubbableEvent = {
  message?: string;
  request?: {
    url?: string;
    headers?: Record<string, string>;
    cookies?: Record<string, string> | string;
    data?: unknown;
    query_string?: unknown;
  };
  user?: Record<string, unknown>;
  breadcrumbs?: ScrubbableBreadcrumb[];
  exception?: { values?: { type?: string; value?: string }[] };
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
};

export type ScrubbableBreadcrumb = {
  message?: string;
  data?: Record<string, unknown>;
};

/** The parts of a span, in Sentry's `SpanJSON` shape, that can carry request or query text. */
export type ScrubbableSpan = {
  op?: string;
  description?: string;
  data?: Record<string, unknown>;
};

export type ScrubbableTransaction = ScrubbableEvent & {
  spans?: ScrubbableSpan[];
};

const REDACTED = "***REDACTED***";

/** Everything from the query string or the fragment on. A list search rides there. */
export const stripQuery = (url: string): string => url.replace(/[?#].*$/s, "");

// Every quantifier is bounded: an error message can echo request text, and an
// unbounded run retried from each position costs quadratic time.
const MAX_TEXT = 16_384;
const URL_IN_TEXT = /(https?:\/\/[^\s?#'")<>]{1,2000})[?#][^\s'")<>]{0,4000}/gi;
const QUERY_IN_TEXT =
  /([^\s?#"'()<>]{1,2000})\?[\w.%[\]-]{1,64}=[^\s"')<>]{0,4000}/g;
const JWT_IN_TEXT =
  /eyJ[\w-]{5,2000}\.[\w-]{5,4000}\.[\w-]{0,2000}(?:\.[\w-]{0,4000}){0,2}/g;
const SCHEME_TOKEN_IN_TEXT = /\b(Bearer|Basic)\s+[\w.~+/=-]{8,4000}/gi;
const EMAIL_IN_TEXT =
  /(?:"[^"\s]{1,64}"|[\p{L}\p{N}._%+'-]{1,64})(?:@|%40)[\p{L}\p{N}.-]{1,253}\.\p{L}{2,24}/giu;

/**
 * Cleans free text that leaves for Sentry: an exception's message, a breadcrumb, a
 * header value. In this order, so a query string takes its address with it. It
 * catches a query string, a token and an address. It does not catch a name or any
 * other detail a message holds, nor a key with no recognisable shape
 * (kit log-redaction-coverage, D-12).
 */
export const scrubText = (text: string): string =>
  (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}[Truncated]` : text)
    .replace(URL_IN_TEXT, "$1")
    .replace(QUERY_IN_TEXT, "$1")
    .replace(JWT_IN_TEXT, "[token]")
    .replace(SCHEME_TOKEN_IN_TEXT, "$1 [token]")
    .replace(EMAIL_IN_TEXT, "[email]");

const redactRecord = (
  record: Record<string, string>,
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const key of Object.keys(record)) {
    const value = record[key];
    // A referer or an origin is a URL the browser was on, query string included.
    out[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? REDACTED
      : typeof value === "string"
        ? scrubText(value)
        : value;
  }
  return out;
};

// Attribute and breadcrumb keys, in Sentry's and OpenTelemetry's spellings.
const URL_KEY = /(^|[._])(url|uri|target)([._]|$)/i;
const DROPPED_KEY =
  /^(url\.(query|fragment)|http\.query|db\.(statement|query\.(text|parameter.*))|http\.client_ip|client\.address)$/i;
const MAX_DEPTH = 5;

/**
 * One value of span attributes or breadcrumb data, at any depth: a console
 * breadcrumb keeps its raw arguments in an array. A URL keeps its path, where the
 * key-based mask would have blanked it: `url` is on the sensitive list because a
 * connection URL holds a password, and here it is the request that was made.
 */
const scrubValue = (key: string, value: unknown, depth: number): unknown => {
  if (typeof value === "string") {
    if (URL_KEY.test(key)) return stripQuery(value);
    return SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : scrubText(value);
  }
  if (SENSITIVE_KEY_PATTERN.test(key)) return REDACTED;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Error) return scrubText(value.message);
  if (depth >= MAX_DEPTH) return "[Truncated]";
  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(key, item, depth + 1));
  }
  return scrubData(value as Record<string, unknown>, depth + 1);
};

const scrubData = (
  data: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (DROPPED_KEY.test(key)) continue;
    out[key] = scrubValue(key, value, depth);
  }
  return out;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Strips credentials and request text from a Sentry event before egress.
 *
 * With `sendDefaultPii` off the SDK still attaches the request URL with its query
 * string and the request headers, and an error's message goes out as the exception
 * value. All of that is cleaned here, along with what the application passes
 * explicitly.
 *
 * See `docs/internal/initiatives/log-redaction-coverage/decisions.md` D-02 and D-12.
 */
export const scrubSentryEvent = <T extends ScrubbableEvent>(event: T): T => {
  if (typeof event.message === "string") {
    event.message = scrubText(event.message);
  }
  if (event.request) {
    if (typeof event.request.url === "string") {
      event.request.url = stripQuery(event.request.url);
    }
    delete event.request.query_string;
    if (event.request.headers) {
      event.request.headers = redactRecord(event.request.headers);
    }
    // Cookies are never useful in a stack trace and always carry the session.
    delete event.request.cookies;
    if (event.request.data !== undefined) {
      event.request.data = redactObject(event.request.data, 0);
    }
  }
  if (event.user) {
    // An id names a person without describing them.
    const { id } = event.user;
    if (id === undefined || id === null) delete event.user;
    else event.user = { id };
  }
  if (event.breadcrumbs) {
    for (const crumb of event.breadcrumbs) {
      if (typeof crumb.message === "string") {
        crumb.message = scrubText(crumb.message);
      }
      if (isRecord(crumb.data)) crumb.data = scrubData(crumb.data);
    }
  }
  for (const exception of event.exception?.values ?? []) {
    if (typeof exception.value === "string") {
      exception.value = scrubText(exception.value);
    }
  }
  if (event.extra) {
    event.extra = redactObject(event.extra, 0) as Record<string, unknown>;
  }
  if (event.contexts) {
    // The trace context carries the root span's attributes, on errors too. They
    // are cleaned from the original: the key-based mask would blank a `url` key.
    const trace = event.contexts.trace;
    const traceData =
      isRecord(trace) && isRecord(trace.data) ? scrubData(trace.data) : null;
    event.contexts = redactObject(event.contexts, 0) as Record<string, unknown>;
    const redactedTrace = event.contexts.trace;
    if (traceData && isRecord(redactedTrace)) redactedTrace.data = traceData;
  }
  return event;
};

const isDatabaseSpan = (span: ScrubbableSpan): boolean =>
  span.op === "db" ||
  span.op?.startsWith("db.") === true ||
  Object.keys(span.data ?? {}).some((key) => key.startsWith("db.system"));

/** The operation a database span ran, without the statement that carried its values. */
const databaseOperation = (span: ScrubbableSpan): string => {
  const named = span.data?.["db.operation.name"] ?? span.data?.["db.operation"];
  if (typeof named === "string" && named) return named;
  const verb = /^\s*([A-Za-z]+)/.exec(span.description ?? "")?.[1];
  return verb ? verb.toUpperCase() : "DB";
};

/**
 * One span, for `beforeSendSpan` and for every span of a transaction. A database
 * span's description is the SQL statement, which Sequelize writes with its values
 * inlined; there is no reliable way to clean it, so it is replaced by the operation.
 */
export const scrubSentrySpan = <T extends ScrubbableSpan>(span: T): T => {
  if (isDatabaseSpan(span)) {
    span.description = databaseOperation(span);
  } else if (typeof span.description === "string") {
    span.description = scrubText(span.description);
  }
  if (isRecord(span.data)) span.data = scrubData(span.data);
  return span;
};

/** Transactions do not pass through `beforeSend`; this is `beforeSendTransaction`. */
export const scrubSentryTransaction = <T extends ScrubbableTransaction>(
  event: T,
): T => {
  scrubSentryEvent(event);
  for (const span of event.spans ?? []) scrubSentrySpan(span);
  return event;
};
