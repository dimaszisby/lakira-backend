import type { Response } from "express";

/**
 * The single error envelope for the API.
 *
 * Every non-2xx JSON body the backend emits has this shape. It replaces the
 * eight hand-rolled emission sites catalogued in C3
 * (`docs/internal/todos/2026-09-01-todo-error-envelope.md`), which produced four
 * different bodies for the same class of failure.
 *
 * `status` is always *derived* from the HTTP status code and never passed in, so
 * the `fail`/`error` discriminator cannot drift between call sites.
 */

/**
 * One field-level problem. `field` is a dotted path into the request
 * (`"body.name"`, `"params.id"`) or plain `"body"` when the whole payload is at
 * fault — never an array of path segments. The OpenAPI `BadRequestError`
 * component documents this key by the same name.
 */
export type FieldIssue = {
  field: string;
  message: string;
};

export type ErrorEnvelope = {
  status: "fail" | "error";
  message: string;
  errors?: FieldIssue[];
  stack?: string;
};

/** Summary used wherever a request fails Zod validation. */
export const VALIDATION_FAILED_MESSAGE = "Validation failed";

/**
 * 4xx is the caller's fault (`fail`); everything else is ours (`error`).
 * `AppError` reuses this so there is exactly one copy of the rule.
 */
export const envelopeStatus = (statusCode: number): "fail" | "error" =>
  statusCode >= 400 && statusCode < 500 ? "fail" : "error";

export const buildErrorEnvelope = (
  statusCode: number,
  message: string,
  options: { errors?: FieldIssue[]; stack?: string } = {},
): ErrorEnvelope => {
  const envelope: ErrorEnvelope = {
    status: envelopeStatus(statusCode),
    message,
  };

  if (options.errors && options.errors.length > 0) {
    envelope.errors = options.errors;
  }
  if (options.stack) {
    envelope.stack = options.stack;
  }

  return envelope;
};

/**
 * Writes the envelope to the wire. Every error body in `src/` goes through here.
 */
export const sendError = (
  res: Response,
  statusCode: number,
  message: string,
  options: { errors?: FieldIssue[]; stack?: string } = {},
): void => {
  res.status(statusCode).json(buildErrorEnvelope(statusCode, message, options));
};
