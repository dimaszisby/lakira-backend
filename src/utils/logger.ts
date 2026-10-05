import { createLogger, format, transports, Logger } from "winston";
import { SENSITIVE_KEY_PATTERN } from "../config/sensitive-keys.js";
import { requestIdStorage } from "@/shared/middleware/request-id.js";
import { APP_NAME } from "@/config/app-name.js";

const { combine, timestamp, printf, errors, colorize, json, splat } = format;
// Reads process.env directly rather than the Zod-validated env — see app-name.ts:1-3;
// logger.ts loads before envManager is initialised, so importing it would be a circular
// init failure. Normalised here because it now selects the console format, and zodEnv
// lowercases NODE_ENV while this does not.
const nodeEnv = (process.env.NODE_ENV || "development").toLowerCase();

// Release identity (ADR-0039 Part 1) — same circular-init bypass as nodeEnv above.
// Mirrors zodEnv.ts's precedence (APP_RELEASE wins; falls back to Render's own
// RENDER_GIT_COMMIT; "unknown" otherwise) so this one-line duplicate can't drift silently.
const release =
  process.env.APP_RELEASE || process.env.RENDER_GIT_COMMIT || "unknown";

const LOG_LEVELS = [
  "error",
  "warn",
  "info",
  "http",
  "verbose",
  "debug",
  "silly",
] as const;

// LOG_LEVEL is declared in zodEnv.ts, which is the fail-fast contract for every other
// consumer. This module cannot import it (circular init, above), so it re-validates the
// raw value and falls back to the same default the schema uses.
const resolveLevel = (): string => {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (raw && (LOG_LEVELS as readonly string[]).includes(raw)) return raw;
  // "http" (winston npm level 3), not "info" (2), so HTTP access lines are included by
  // default — at "info" they are silently dropped, which would ship access logging that
  // does not exist in production. Includes error/warn/info/http, excludes verbose/debug.
  return nodeEnv === "production" ? "http" : "debug";
};

// What an error is allowed to say about itself in a log record, besides its
// message and stack. Winston copies every own property of an error passed to a
// log call onto the record, and a database error's own properties are its SQL
// and bound values. Scalars only, and only these (log-redaction-coverage D-06).
const ERROR_FIELD_ALLOWLIST: ReadonlySet<string> = new Set([
  "name",
  "code",
  "errno",
  "syscall",
  "status",
  "statusCode",
  "expose",
  "type",
  "kind",
  "isOperational",
]);

// Postgres's own description of a failure: the SQLSTATE and schema names, never
// row data. `detail` is left out on purpose; it quotes the offending values.
const DB_ERROR_FIELDS = ["code", "constraint", "table", "column"] as const;

const isScalar = (value: unknown): value is string | number | boolean =>
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

const describeDbError = (error: Error): Record<string, string> | undefined => {
  const { original } = error as { original?: unknown };
  if (original === null || typeof original !== "object") return undefined;
  const source = original as Record<string, unknown>;
  const db: Record<string, string> = {};
  for (const field of DB_ERROR_FIELDS) {
    const value = source[field];
    if (typeof value === "string") db[field] = value;
  }
  return Object.keys(db).length > 0 ? db : undefined;
};

/** The allowlisted view of an error: its scalar identity fields, and `db`. */
export function summarizeError(error: Error): Record<string, unknown> {
  const source = error as unknown as Record<string, unknown>;
  const summary: Record<string, unknown> = { name: error.name };
  for (const key of Object.keys(source)) {
    if (ERROR_FIELD_ALLOWLIST.has(key) && isScalar(source[key])) {
      summary[key] = source[key];
    }
  }
  const db = describeDbError(error);
  if (db) summary.db = db;
  return summary;
}

export function redactObject(obj: unknown, depth: number): unknown {
  if (obj instanceof Error) {
    return { ...summarizeError(obj), message: obj.message };
  }
  if (depth >= 5 || obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, depth + 1));
  }
  const record = obj as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    result[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? "***REDACTED***"
      : redactObject(record[key], depth + 1);
  }
  return result;
}

const SPLAT = Symbol.for("splat");
const LEVEL = Symbol.for("level");

type LogRecord = Record<string | symbol, unknown>;

// What the record owns. An error's key of the same name never replaces these.
const RECORD_FIELDS: ReadonlySet<string> = new Set([
  "level",
  "message",
  "stack",
]);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  !(value instanceof Error);

// First in the chain, so that nothing after it ever holds an error object.
// Winston copies an error's own properties onto the record in `logger.log`,
// copies them again in `splat()`, and `splat()` prints an argument whole when
// the message has a `%j`, `%s` or `%o` token, which a message built from client
// text can have. So this step undoes the first copy and replaces each error
// among the call's arguments with its allowlisted view; the later steps then
// only have that view to work with (log-redaction-coverage D-06).
const reduceLoggedErrors = format((info) => {
  const record = info as unknown as LogRecord;

  // `logger.error(err)`: Winston uses the error itself as the record.
  if (info instanceof Error) {
    return {
      ...summarizeError(info),
      level: record.level,
      [LEVEL]: record[LEVEL],
      message: info.message,
      stack: info.stack,
      service: APP_NAME,
      release,
    } as unknown as typeof info;
  }

  // `logger.log({ level, message: err })`.
  if (record.message instanceof Error) {
    const error = record.message;
    record.message = error.message;
    record.stack = error.stack;
    Object.assign(record, summarizeError(error));
    return info;
  }

  const args = record[SPLAT];
  if (!Array.isArray(args) || !args.some((arg) => arg instanceof Error)) {
    return info;
  }
  for (const arg of args) {
    if (!(arg instanceof Error)) continue;
    for (const key of Object.keys(arg)) {
      if (!RECORD_FIELDS.has(key)) delete record[key];
    }
  }
  // The copy may have replaced the logger's own defaults, or metadata passed
  // beside the error; put both back, then the allowlisted view of each error.
  record.service = APP_NAME;
  record.release = release;
  const reduced = args.map((arg) =>
    arg instanceof Error ? summarizeError(arg) : arg,
  );
  for (const arg of reduced) {
    if (isPlainObject(arg)) Object.assign(record, arg);
  }
  record[SPLAT] = reduced;
  return info;
});

const redactSensitive = format((info) => {
  const infoRecord = info as unknown as Record<string, unknown>;
  for (const key of Object.keys(infoRecord)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      infoRecord[key] = "***REDACTED***";
    } else if (
      infoRecord[key] !== null &&
      typeof infoRecord[key] === "object"
    ) {
      infoRecord[key] = redactObject(infoRecord[key], 1);
    }
  }
  return info;
});

const attachRequestId = format((info) => {
  const requestId = requestIdStorage.getStore();
  if (requestId) {
    (info as unknown as Record<string, unknown>).requestId = requestId;
  }
  return info;
});

// Winston's `colorize()` rewrites `info.level` to "\x1b[32minfo\x1b[39m". Uppercasing that
// whole string also uppercases the escape terminator ("\x1b[39m" -> "\x1b[39M"), which is not
// a valid SGR sequence — which is why the dev console colours never actually rendered.
// The uncolourised level is still available under winston's LEVEL symbol, so uppercase only
// that word within the colourised string and leave the escape codes untouched.
const LEVEL_SYMBOL = LEVEL;

const logFormat = printf((info) => {
  const { message, timestamp, stack, requestId } = info;
  const plainLevel = String(
    (info as unknown as Record<symbol, unknown>)[LEVEL_SYMBOL] ?? info.level,
  );
  const level = String(info.level).replace(
    plainLevel,
    plainLevel.toUpperCase(),
  );
  const rid = requestId ? ` [${requestId}]` : "";
  return `${timestamp}${rid} [${level}]: ${String(stack || message)}`;
});

const logger: Logger = createLogger({
  level: resolveLevel(),
  format: combine(
    reduceLoggedErrors(),
    timestamp(),
    errors({ stack: true }),
    splat(),
    attachRequestId(),
    redactSensitive(),
    json(),
  ),
  defaultMeta: { service: APP_NAME, release },
  // ADR-0041 — the application writes its log stream to stdout and nothing else. It does
  // not create, rotate, route, or retain log files in any environment. Collection is the
  // platform's responsibility: Render captures stdout in production, the json-file driver
  // in docker-compose.yml does locally.
  //
  // Note there is NO transport-level format outside development: the logger chain already
  // ends in json(), whose output lives in info[Symbol.for("message")]. Re-applying json()
  // here would serialise a second time and lose it.
  transports: [
    new transports.Console({
      // Everything on stdout, so ordering across levels is preserved for the collector.
      // Set explicitly so a future change to winston's default cannot split the stream.
      stderrLevels: [],
      consoleWarnLevels: [],
      ...(nodeEnv === "development"
        ? { format: combine(colorize(), logFormat) }
        : {}),
    }),
  ],
  // Near-inert with a single sink, but it still stops an EPIPE on a closed stdout from
  // taking the process down.
  exitOnError: false,
});

/**
 * Winston writes asynchronously and `process.exit()` does not flush pending stream
 * writes, so without this the line describing a crash can be lost — precisely the
 * incident case ADR-0041 exists to serve. Bounded, so a wedged stdout cannot hang
 * shutdown indefinitely.
 *
 * Lives here rather than in each caller because three separate exit paths need it:
 * server.ts, worker.ts, and redis-client.ts.
 */
export const flushLogs = (timeoutMs = 2000): Promise<void> =>
  new Promise((resolve) => {
    const bail = setTimeout(resolve, timeoutMs);
    logger.once("finish", () => {
      clearTimeout(bail);
      resolve();
    });
    logger.end();
  });

export default logger;
