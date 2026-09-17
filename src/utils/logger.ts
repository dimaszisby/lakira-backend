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

export function redactObject(obj: unknown, depth: number): unknown {
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
const LEVEL_SYMBOL = Symbol.for("level");

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
