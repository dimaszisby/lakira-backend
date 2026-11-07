import morgan from "morgan";
import type { Request, Response } from "express";
import logger from "@/utils/logger.js";
import { maskEmails } from "@/utils/mask-emails.js";

/**
 * HTTP access logging — ADR-0041 item 4.
 *
 * One line per completed request, emitted through the Winston logger rather than
 * morgan's own writer, so access lines share a single JSON shape with application
 * logs and inherit `attachRequestId()` correlation (ADR-0027) and
 * `redactSensitive()` masking (ADR-0028) for free.
 *
 * morgan's format function is used for its side effect and returns `null`, which
 * tells morgan to write nothing itself. That is the seam morgan offers for handing
 * the structured token values to another sink instead of stringifying them.
 */

/** Probe paths excluded so orchestrator traffic does not drown the stream. */
const PROBE_PATHS = new Set(["/api/v1/health", "/api/v1/ready"]);

/**
 * Path only — the query string is deliberately dropped.
 *
 * `SENSITIVE_KEY_PATTERN` redaction applies to log *metadata*, not to URL strings,
 * so search terms, filters and cursors would otherwise enter the stream unredacted.
 * Resource ids in the path still appear; they are user-associated but not secret.
 */
const pathWithoutQuery = (req: Request): string =>
  req.originalUrl.split("?")[0] ?? "";

export const accessLogMiddleware = morgan<Request, Response>(
  (tokens, req, res) => {
    const durationRaw = tokens["response-time"](req, res);
    const statusRaw = tokens.status(req, res);
    const lengthRaw = tokens.res(req, res, "content-length");

    logger.http("http_request", {
      method: tokens.method(req, res),
      // An unmatched route's path keeps what was sent, an address included (audit
      // 2026-10-20 X5; log-and-ci-leaks D-02).
      path: maskEmails(pathWithoutQuery(req)),
      status: statusRaw ? Number(statusRaw) : undefined,
      durationMs: durationRaw ? Number(durationRaw) : undefined,
      contentLength: lengthRaw ? Number(lengthRaw) : undefined,
    });

    // Returning null suppresses morgan's own output; Winston already wrote the line.
    return null;
  },
  {
    skip: (req) => PROBE_PATHS.has(pathWithoutQuery(req as Request)),
  },
);

export default accessLogMiddleware;
