import { isIP } from "node:net";
import type { NodeOptions } from "@sentry/node";
import { SENSITIVE_KEY_PATTERN } from "../config/sensitive-keys.js";
import { redactObject } from "./logger.js";
import { maskQuotedValues } from "./mask-quoted-values.js";

/**
 * The parts of a Sentry event this scrubber touches. Structural rather than importing
 * Sentry's `ErrorEvent`, so a version bump cannot silently change what is scrubbed.
 */
export type ScrubbableEvent = {
  message?: string;
  transaction?: string;
  tags?: Record<string, unknown>;
  logentry?: { message?: string; params?: unknown[] };
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

/**
 * The parts of a span that can carry request or query text, in the `StreamedSpanJSON`
 * shape `beforeSendSpan` receives from Sentry 11: the op is the `sentry.op` attribute,
 * and what 10 called the description and the data are the name and the attributes
 * (sentry-11-data-collection D-03).
 */
export type ScrubbableSpan = {
  name?: string;
  attributes?: Record<string, unknown>;
};

/**
 * A Sentry log, for `beforeSendLog`. The SDK passes a parameterized message as a
 * `String` object that also carries the template and its values.
 */
export type ScrubbableLog = {
  message: unknown;
  attributes?: Record<string, unknown>;
};

const REDACTED = "***REDACTED***";

/** Everything from the query string or the fragment on. A list search rides there. */
export const stripQuery = (url: string): string => url.replace(/[?#].*$/s, "");

// The `user:password@` of a URL of any scheme: a connection URL in an error
// message carries its password there (D-14).
const USERINFO_IN_TEXT = /\b([a-z][\w+.-]{0,30}:\/\/)[^\s/?#@]{1,512}@/gi;

const stripUserinfo = (text: string): string =>
  text.replace(USERINFO_IN_TEXT, "$1[credentials]@");

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
  /(?:"[^"\r\n]{1,64}"|[\p{L}\p{N}._%+'-]{1,64})(?:@|%40)[\p{L}\p{N}.-]{1,253}\.\p{L}{2,24}/giu;

const ZONE_ID = /%[\w.-]+$/;

const isOneAddress = (text: string): boolean => {
  const bare = text.trim().replace(ZONE_ID, "");
  // "::" parses as an address and is also ordinary punctuation.
  if (!/[0-9a-f]/i.test(bare)) return false;
  if (isIP(bare)) return true;
  // "[2001:db8::1]", "[2001:db8::1]:443" and "203.0.113.9:443".
  const bracketed = /^\[([^\]]+)\](?::\d{1,5})?$/.exec(bare);
  if (bracketed) return isIP(bracketed[1].replace(ZONE_ID, "")) !== 0;
  return isIP(bare.replace(/:\d{1,5}$/, "")) === 4;
};

/**
 * A network address, or a comma-separated list of them. The SDK names the peer
 * address differently from one release to the next, so an attribute is judged by
 * what it holds as well as by what it is called (D-13).
 */
const isAddress = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= 512 &&
  value.trim() !== "" &&
  value.split(",").every(isOneAddress);

// A run with no separator in it: what an address would be written as inside a
// message, a URL ("//203.0.113.9:5000/") or a header ("for=203.0.113.9").
const ADDRESS_CANDIDATE = /[^\s,;()<>"'=/@]{2,80}/g;

const maskAddressRun = (run: string): string => {
  const tail = /[.!?]+$/.exec(run)?.[0] ?? "";
  const core = tail ? run.slice(0, -tail.length) : run;
  return isOneAddress(core) ? `[address]${tail}` : run;
};

/** Text with each address in it replaced; a host name is left alone. */
const maskAddresses = (text: string): string =>
  text.replace(ADDRESS_CANDIDATE, maskAddressRun);

/** A URL value: no query string, no userinfo, no address. The path is kept (D-14). */
const cleanUrl = (url: string): string =>
  maskAddresses(stripUserinfo(stripQuery(url)));

/** The same, for every string of a context or of `extra`, at any depth. */
const maskAddressesDeep = (value: unknown, depth = 0): unknown => {
  if (typeof value === "string") return maskAddresses(value);
  if (value === null || typeof value !== "object" || depth >= MAX_DEPTH) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => maskAddressesDeep(item, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      maskAddressesDeep(item, depth + 1),
    ]),
  );
};

/**
 * Cleans free text that leaves for Sentry: an exception's message, a breadcrumb, a
 * header value. In this order, so a query string takes its address with it, and
 * userinfo goes before the email pattern can take half of it. It catches userinfo,
 * a query string, a token and an address. It does not catch a name or any other
 * detail a message holds, nor a key with no recognisable shape
 * (kit log-redaction-coverage, D-12 and D-14).
 */
export const scrubText = (text: string): string =>
  stripUserinfo(
    text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}[Truncated]` : text,
  )
    .replace(URL_IN_TEXT, "$1")
    .replace(QUERY_IN_TEXT, "$1")
    .replace(JWT_IN_TEXT, "[token]")
    .replace(SCHEME_TOKEN_IN_TEXT, "$1 [token]")
    .replace(EMAIL_IN_TEXT, "[email]")
    .replace(ADDRESS_CANDIDATE, maskAddressRun);

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
  /^(url\.(query|fragment)|http\.query|db\.(statement|query\.(text|parameter.*))|(.+\.)?(ip|ip_address|client_ip)|.+\.addr|client\.address|network\.(peer|local)\.address)$/i;
const MAX_DEPTH = 5;

/**
 * One value of span attributes or breadcrumb data, at any depth: a console
 * breadcrumb keeps its raw arguments in an array. A URL keeps its path, where the
 * key-based mask would have blanked it: `url` is on the sensitive list because a
 * connection URL holds a password, and here it is the request that was made.
 */
const scrubValue = (key: string, value: unknown, depth: number): unknown => {
  if (typeof value === "string") {
    // Reached for an item of an array: an attribute's own value is dropped with
    // its key in scrubData.
    if (isAddress(value)) return REDACTED;
    if (URL_KEY.test(key)) return cleanUrl(value);
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
    if (DROPPED_KEY.test(key) || isAddress(value)) continue;
    out[key] = scrubValue(key, value, depth);
  }
  return out;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Strips credentials and request text from a Sentry event before egress.
 *
 * `SENTRY_DATA_COLLECTION` turns off every category the SDK collects on its own, but
 * an error's message still goes out as the exception value, and the application
 * passes tags, extra and context explicitly. All of that is cleaned here, and so is
 * the request, in case a category is ever turned back on.
 *
 * See `docs/internal/initiatives/log-redaction-coverage/decisions.md` D-02 and D-12.
 */
export const scrubSentryEvent = <T extends ScrubbableEvent>(event: T): T => {
  if (typeof event.message === "string") {
    event.message = scrubText(event.message);
  }
  // The matched route as a rule, but an unmatched raw path reaches it as well.
  if (typeof event.transaction === "string") {
    event.transaction = scrubText(event.transaction);
  }
  if (isRecord(event.tags)) event.tags = scrubData(event.tags);
  if (event.logentry) {
    const { logentry } = event;
    if (typeof logentry.message === "string") {
      logentry.message = scrubText(logentry.message);
    }
    if (Array.isArray(logentry.params)) {
      logentry.params = scrubValue("params", logentry.params, 0) as unknown[];
    }
  }
  if (event.request) {
    if (typeof event.request.url === "string") {
      event.request.url = cleanUrl(event.request.url);
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
      // A database error's message can quote a submitted value (D-16).
      const value = exception.type?.startsWith("Sequelize")
        ? maskQuotedValues(exception.value)
        : exception.value;
      exception.value = scrubText(value);
    }
  }
  if (event.extra) {
    event.extra = maskAddressesDeep(redactObject(event.extra, 0)) as Record<
      string,
      unknown
    >;
  }
  if (event.contexts) {
    // The trace context carries the root span's attributes, on errors too. They
    // are cleaned from the original: the key-based mask would blank a `url` key.
    const trace = event.contexts.trace;
    const traceData =
      isRecord(trace) && isRecord(trace.data) ? scrubData(trace.data) : null;
    // A socket error's context carries the address it failed to reach.
    event.contexts = maskAddressesDeep(
      redactObject(event.contexts, 0),
    ) as Record<string, unknown>;
    const redactedTrace = event.contexts.trace;
    if (traceData && isRecord(redactedTrace)) redactedTrace.data = traceData;
  }
  return event;
};

const isDatabaseSpan = (span: ScrubbableSpan): boolean => {
  const op = span.attributes?.["sentry.op"];
  return (
    op === "db" ||
    (typeof op === "string" && op.startsWith("db.")) ||
    Object.keys(span.attributes ?? {}).some((key) =>
      key.startsWith("db.system"),
    )
  );
};

/** The operation a database span ran, without the statement that carried its values. */
const databaseOperation = (span: ScrubbableSpan): string => {
  const named =
    span.attributes?.["db.operation.name"] ?? span.attributes?.["db.operation"];
  if (typeof named === "string" && named) return named;
  const verb = /^\s*([A-Za-z]+)/.exec(span.name ?? "")?.[1];
  return verb ? verb.toUpperCase() : "DB";
};

/**
 * One span, for `beforeSendSpan`. Spans are streamed (Sentry 11's default, pinned in
 * `Sentry.init`), so there is no transaction event to clean. A database span's name
 * can be the SQL statement, which Sequelize writes with its values inlined; there is
 * no reliable way to clean it, so it is replaced by the operation.
 */
export const scrubSentrySpan = <T extends ScrubbableSpan>(span: T): T => {
  if (isDatabaseSpan(span)) {
    span.name = databaseOperation(span);
  } else if (typeof span.name === "string") {
    span.name = scrubText(span.name);
  }
  if (isRecord(span.attributes)) span.attributes = scrubData(span.attributes);
  return span;
};

/**
 * `beforeSendLog`. Sentry 11 sends a log only when `Sentry.logger` or a logging
 * integration is used, and the app uses neither; the hook is wired so that starting
 * to cannot skip the scrubber (D-14). A parameterized message becomes a plain
 * string: its template values are the raw arguments.
 */
export const scrubSentryLog = <T extends ScrubbableLog>(log: T): T => {
  log.message = scrubText(String(log.message));
  if (isRecord(log.attributes)) log.attributes = scrubData(log.attributes);
  return log;
};

/** Every hook `Sentry.init` takes, as one object, so none is left out of it. */
export const SENTRY_SCRUB_HOOKS = {
  beforeSend: scrubSentryEvent,
  beforeSendSpan: scrubSentrySpan,
  beforeSendLog: scrubSentryLog,
};

/**
 * What the SDK may collect on its own: nothing. Sentry 11 replaced `sendDefaultPii`
 * with this option, and every category it leaves unset is on, bound query
 * parameters and queue arguments included. Each is named, so the choice is written
 * down rather than inherited from a default (sentry-11-data-collection D-02,
 * ADR-0071). The scrubber above still runs on what the app passes itself.
 */
export const SENTRY_DATA_COLLECTION: NonNullable<
  NodeOptions["dataCollection"]
> = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  // Lines of our own source around each stack frame, not request data; 5 is 11's
  // default (10 sent 7).
  frameContextLines: 5,
};
