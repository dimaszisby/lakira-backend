import type { Request, Response, NextFunction } from "express";
import { sendError } from "@/shared/utils/error-envelope.js";

const METHOD_NOT_ALLOWED_MESSAGE = "Method Not Allowed";

/**
 * Blocks unsupported HTTP methods that should consistently return 405
 * across the API surface (e.g., TRACE) so contract tests don't receive 404s.
 */
export function disallowTraceMethod(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.method === "TRACE") {
    res.setHeader("Allow", "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS");
    sendError(res, 405, METHOD_NOT_ALLOWED_MESSAGE);
    return;
  }

  next();
}

export function methodNotAllowed(allowed: string[]) {
  const allowHeader = Array.from(
    new Set(allowed.map((method) => method.toUpperCase()).concat(["OPTIONS"])),
  ).join(",");

  return (req: Request, res: Response) => {
    res.setHeader("Allow", allowHeader);
    sendError(res, 405, METHOD_NOT_ALLOWED_MESSAGE);
  };
}
