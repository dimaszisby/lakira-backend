import express, { type Application, type RequestHandler } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import hpp from "hpp";
import xssClean from "xss-clean";
import { accessLogMiddleware } from "./access-log.js";
import { disallowTraceMethod } from "./method-guard.js";
import { requestIdMiddleware } from "./request-id.js";

export type HttpPipelineOptions = {
  /** The app-wide limiter. A no-op when rate limiting is disabled. */
  limiter: RequestHandler;
  corsOrigins: string[];
  /** `REQUEST_BODY_LIMIT`, in the form body-parser takes ("1mb"). */
  bodyLimit: string;
  /** Production only: a plain-HTTP request is answered with a 301. */
  redirectToHttps: boolean;
  /** Registers `/health` and `/ready` at the point the pipeline reserves for them. */
  mountProbes: (app: Application) => void;
};

/**
 * Every global middleware, in the one order they run in. The order is a security
 * boundary (ADR-0061): change it here and nowhere else.
 */
export const mountHttpPipeline = (
  app: Application,
  options: HttpPipelineOptions,
): void => {
  // Request id first, so every line logged and every response from here on carries it.
  app.use(requestIdMiddleware);

  // HTTP access logging — after requestIdMiddleware so each line carries the same
  // requestId as the application logs for that request (ADR-0041).
  app.use(accessLogMiddleware);

  app.use(helmet()); // Secure HTTP headers

  // HTTPS redirect — after helmet() so the 301 response includes HSTS and other security headers
  if (options.redirectToHttps) {
    app.use((req, res, next) => {
      if (!req.secure && req.get("x-forwarded-proto") !== "https") {
        return res.redirect(
          301,
          `https://${req.headers.host ?? ""}${req.originalUrl}`,
        );
      }
      next();
    });
  }

  // Disallow TRACE (and similar unsupported verbs) globally so contracts receive 405 responses.
  app.use(disallowTraceMethod);

  // Ahead of the limiter: a 429 without these headers reaches a browser as a CORS error.
  app.use(
    cors({
      origin: options.corsOrigins,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      credentials: true, // Allow cookies and auth headers
    }),
  );

  // Ahead of the limiter, so a platform probe is never throttled, and ahead of the
  // parsers, so a probe reads no body.
  options.mountProbes(app);

  app.use(options.limiter);

  // Nothing above this line reads a request body. A request is counted before it
  // is parsed, so a flood of large or malformed bodies is throttled, not processed.
  app.use(
    express.json({
      limit: options.bodyLimit,
      strict: false, // allow primitives + guard downstream to emit cleaner 400s
    }),
  );

  // Cookie parser — before routes so req.cookies is populated
  app.use(cookieParser());

  app.use(xssClean()); // Prevent XSS attacks
  app.use(hpp()); // Prevent HTTP Parameter Pollution
};
