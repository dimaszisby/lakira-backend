import { Response, NextFunction } from "express";
import AppError from "@/utils/AppError.js";
import {
  DomainError,
  type DomainErrorKind,
} from "@/shared/domain/errors/DomainError.js";
import logger from "@/utils/logger.js";
import { env } from "@/config/envManager.js";
import { AuthRequest } from "@/types/request.context.js";
import { ZodError } from "zod";
import {
  describeZodIssues,
  formatZodIssues,
} from "@/shared/utils/zod-error-formatter.js";
import {
  sendError,
  VALIDATION_FAILED_MESSAGE,
} from "@/shared/utils/error-envelope.js";
import { UniqueConstraintError, DatabaseError } from "sequelize";
import * as Sentry from "@sentry/node";
import { getRequestId } from "@/shared/middleware/request-id.js";

const MALFORMED_JSON_MESSAGE =
  "Malformed JSON payload. Provide a valid JSON object.";

/** Shown instead of a 5xx message in production so internals never leak. */
const MASKED_SERVER_ERROR_MESSAGE = "Something went wrong!";

/**
 * Where the domain's vocabulary becomes HTTP's. Entities raise a `kind`; this is the
 * only place that decides what status it answers with (ADR-0044 / feature-boundaries
 * D-06). Keep it total — an unmapped kind would fall through to 500, turning a
 * client mistake into a server fault and, in production, masking its message.
 */
const DOMAIN_ERROR_STATUS: Record<DomainErrorKind, number> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
};

const isBodyParseError = (
  error: unknown,
): error is SyntaxError & {
  status?: number;
  type?: string;
} => {
  return (
    error instanceof SyntaxError &&
    typeof (error as { type?: string }).type === "string" &&
    ((error as { type?: string }).type === "entity.parse.failed" ||
      (error as { status?: number }).status === 400)
  );
};

const MALFORMED_URL_MESSAGE = "Malformed URL";

const DUPLICATE_VALUE_MESSAGE = "Duplicate value";

/**
 * Errors raised by the framework that describe a client mistake, mapped to the
 * 4xx they deserve instead of a masked 500 and a Sentry event (C3 residual 2).
 * Returns `undefined` for anything else, which stays on the server-error path.
 *
 * - The `http-errors` contract, which body-parser and raw-body follow (413, 415,
 *   400): `expose` is the raiser's promise that the message is safe to show.
 *   Recognised by shape, so any middleware that keeps the contract is covered.
 * - Express's undecodable path parameter: a `URIError` with status 400 but no
 *   `expose`, whose message quotes the parameter, so the reply uses a fixed one.
 *
 * See `docs/internal/initiatives/error-envelope-residuals/decisions.md` D-02, D-04.
 */
const toClientError = (error: Error): AppError | undefined => {
  const { status, expose } = error as { status?: unknown; expose?: unknown };
  if (typeof status !== "number" || status < 400 || status >= 500) {
    return undefined;
  }
  if (expose === true) {
    return new AppError(error.message, status);
  }
  if (error instanceof URIError && status === 400) {
    return new AppError(MALFORMED_URL_MESSAGE, 400);
  }
  return undefined;
};

// How a client error is named in its log line: the raiser's `type` when it is
// a plain token (`charset.unsupported`), the error's class otherwise. Not its
// message, which quotes the path segment or the header that was wrong.
const clientErrorLabel = (error: Error): string => {
  const { type } = error as { type?: unknown };
  return typeof type === "string" && /^[a-z][a-z.]{0,63}$/.test(type)
    ? type
    : error.name;
};

export const createErrorHandler =
  () =>
  (err: Error, req: AuthRequest, res: Response, next: NextFunction): void => {
    void next;
    if (isBodyParseError(err)) {
      // Not the error: its message and stack quote the start of the body.
      logger.error("Invalid JSON payload received", { type: err.type });
      sendError(res, 400, MALFORMED_JSON_MESSAGE, {
        errors: [{ field: "body", message: MALFORMED_JSON_MESSAGE }],
      });
      return;
    }
    if (err instanceof ZodError) {
      const formattedErrors = formatZodIssues(err);
      logger.error("Validation Errors:", { issues: describeZodIssues(err) });
      sendError(res, 400, VALIDATION_FAILED_MESSAGE, {
        errors: formattedErrors,
      });
      return;
    }

    const clientError = toClientError(err);

    // The logger keeps only an error's allowlisted fields, so passing `err` does
    // not write its SQL or bound values (log-redaction-coverage D-06).
    if (err instanceof DatabaseError) {
      const dbMessage = err.original?.message ?? err.message;
      logger.error(`Database error: ${dbMessage}`, err);
    } else if (err instanceof UniqueConstraintError) {
      // A duplicate is a conflict the client caused, answered 409 below.
      logger.warn(`Client error 409: ${DUPLICATE_VALUE_MESSAGE}`);
    } else if (clientError) {
      // The client's mistake, not ours: no stack, not at error level.
      logger.warn(
        `Client error ${clientError.statusCode}: ${clientErrorLabel(err)}`,
      );
    } else {
      logger.error(`Error Occurred: ${err.message}`, err);
    }

    const appError =
      err instanceof AppError
        ? err
        : err instanceof DomainError
          ? new AppError(err.message, DOMAIN_ERROR_STATUS[err.kind])
          : err instanceof UniqueConstraintError
            ? new AppError(DUPLICATE_VALUE_MESSAGE, 409)
            : (clientError ?? new AppError("Internal Server Error", 500));

    if (appError.statusCode >= 500) {
      Sentry.captureException(err, {
        tags: { requestId: getRequestId() },
      });
    }

    // Masking is a 5xx concern: a server fault may carry a database string or an
    // internal identifier, so production replaces it. A 4xx describes what the
    // *client* got wrong and is safe — and useless once masked. Masking both was
    // C3 defect 2: production answered every 404/400/403/409 with
    // `{"status":"error","message":"Something went wrong!"}` while the spec, and
    // every other environment, promised the real message.
    const isMaskedServerError =
      env.NODE_ENV === "production" && appError.statusCode >= 500;

    sendError(
      res,
      appError.statusCode,
      isMaskedServerError ? MASKED_SERVER_ERROR_MESSAGE : appError.message,
      {
        stack: env.NODE_ENV === "development" ? appError.stack : undefined,
      },
    );
  };

export const errorHandler = createErrorHandler();
