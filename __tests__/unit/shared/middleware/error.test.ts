import { describe, beforeEach, it, expect, jest } from "@jest/globals";
import type { AuthRequest } from "@/types/request.context.js";
import type { Response, NextFunction } from "express";
import AppError from "@/utils/AppError.js";
import { z, type ZodError } from "zod";
import { UniqueConstraintError } from "sequelize";
import { createErrorHandler } from "@/shared/middleware/error.js";

// Swap env + logger bindings so the middleware can be tested deterministically without touching real config/logging.
jest.mock("@/config/envManager.js", () => ({
  env: { NODE_ENV: "development" },
}));

const { env: envMock } = jest.requireMock("@/config/envManager.js") as {
  env: { NODE_ENV: string };
};

jest.mock("@/utils/logger.js", () => ({
  error: jest.fn(),
  warn: jest.fn(),
}));

const loggerMock = jest.requireMock("@/utils/logger.js") as {
  error: jest.Mock;
  warn: jest.Mock;
};

jest.mock("@sentry/node", () => ({
  captureException: jest.fn(),
}));

const sentryMock = jest.requireMock("@sentry/node") as {
  captureException: jest.Mock;
};

// The shape body-parser and raw-body raise: an `http-errors` instance, which is a
// plain Error carrying `status`, `statusCode`, `expose` and a `type`.
const httpError = (
  status: number,
  message: string,
  expose = status < 500,
  type = "test.error",
) =>
  Object.assign(new Error(message), {
    status,
    statusCode: status,
    expose,
    type,
  });

const createResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return res as unknown as Response;
};

// Instantiate once; per-test NODE_ENV mutations control behavior.
const handler = createErrorHandler();

describe("error middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    envMock.NODE_ENV = "development";
  });

  it("returns full payload for AppError in non-production", () => {
    const err = new AppError("Validation failed", 422);
    const req = {} as AuthRequest;
    const res = createResponse();
    const next = jest.fn();

    handler(err, req, res, next as NextFunction);

    expect(loggerMock.error).toHaveBeenCalledWith(
      "Error Occurred: Validation failed",
      err,
    );
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "fail",
        message: "Validation failed",
        stack: err.stack,
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  // Audit T1, kit log-redaction-coverage D-06. A duplicate is the client's
  // mistake: answered 409, logged as one, and the error object, which holds the
  // submitted values, is not handed to the logger at all.
  it("answers a unique-constraint error with 409 and logs it as a client error", () => {
    envMock.NODE_ENV = "production";
    const err = new UniqueConstraintError({
      fields: { email: "someone@example.com" },
      message: "Validation error",
    });
    const res = createResponse();

    handler(err, {} as AuthRequest, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      status: "fail",
      message: "Duplicate value",
    });
    expect(loggerMock.error).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Client error 409: Duplicate value",
    );
    expect(sentryMock.captureException).not.toHaveBeenCalled();
  });

  it("wraps unknown errors and hides stack outside development", () => {
    envMock.NODE_ENV = "test";
    const err = new Error("boom");
    const req = {} as AuthRequest;
    const res = createResponse();

    handler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      status: "error",
      message: "Internal Server Error",
    });
  });

  // C3 defect 2. This test used to assert the opposite: that a 400 in production
  // was masked to `{status:"error", message:"Something went wrong!"}`. Masking is
  // a 5xx concern — a 4xx describes what the client got wrong and is safe to
  // return. If this suite ever passes with the old expectations, the masking gate
  // was reverted.
  it("keeps the real 4xx message in production", () => {
    envMock.NODE_ENV = "production";
    const err = new AppError("Metric name already taken", 409);
    const res = createResponse();

    handler(err, {} as AuthRequest, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      status: "fail",
      message: "Metric name already taken",
    });
  });

  it("masks 5xx messages in production", () => {
    envMock.NODE_ENV = "production";
    const err = new AppError("Resend email send failed: bad api key", 500);
    const res = createResponse();

    handler(err, {} as AuthRequest, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      status: "error",
      message: "Something went wrong!",
    });
  });

  it("emits the unified envelope for malformed JSON", () => {
    envMock.NODE_ENV = "test";
    const err = Object.assign(new SyntaxError("Unexpected token"), {
      type: "entity.parse.failed",
      status: 400,
    });
    const res = createResponse();

    handler(err, {} as AuthRequest, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      status: "fail",
      message: "Malformed JSON payload. Provide a valid JSON object.",
      errors: [
        {
          field: "body",
          message: "Malformed JSON payload. Provide a valid JSON object.",
        },
      ],
    });
  });

  // C3 residual 2 (docs/internal/initiatives/error-envelope-residuals, D-02).
  // These used to fall through to a masked 500 and a Sentry event.
  it.each([
    [413, "request entity too large", "entity.too.large"],
    [415, 'unsupported charset "KOI8-R"', "charset.unsupported"],
    [400, "request aborted", "request.aborted"],
  ])(
    "passes an exposed %i body-parser error through, even in production",
    (status, message, type) => {
      envMock.NODE_ENV = "production";
      const res = createResponse();

      handler(
        httpError(status, message, true, type),
        {} as AuthRequest,
        res,
        jest.fn(),
      );

      expect(res.status).toHaveBeenCalledWith(status);
      expect(res.json).toHaveBeenCalledWith({ status: "fail", message });
      expect(loggerMock.warn).toHaveBeenCalled();
      expect(loggerMock.error).not.toHaveBeenCalled();
      expect(sentryMock.captureException).not.toHaveBeenCalled();
    },
  );

  it("does not trust a 4xx status that is not marked exposed", () => {
    envMock.NODE_ENV = "production";
    const err = httpError(400, "connection string leaked", false);
    const res = createResponse();

    handler(err, {} as AuthRequest, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      status: "error",
      message: "Something went wrong!",
    });
    expect(sentryMock.captureException).toHaveBeenCalledWith(
      err,
      expect.anything(),
    );
  });

  // Discovered in review (kit D-04): Express's param decoding raises this, with
  // a message that quotes the raw parameter, so the reply must not reuse it.
  it("answers an undecodable path parameter with a fixed 400", () => {
    envMock.NODE_ENV = "production";
    const err = Object.assign(new URIError("Failed to decode param '%zz'"), {
      status: 400,
      statusCode: 400,
    });
    const res = createResponse();

    handler(err, {} as AuthRequest, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      status: "fail",
      message: "Malformed URL",
    });
    expect(loggerMock.warn).toHaveBeenCalled();
    expect(sentryMock.captureException).not.toHaveBeenCalled();
  });

  it("keeps a 5xx http-error on the masked server-error path", () => {
    envMock.NODE_ENV = "production";
    const err = httpError(500, "stream encoding should not be set", true);
    const res = createResponse();

    handler(err, {} as AuthRequest, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      status: "error",
      message: "Something went wrong!",
    });
    expect(sentryMock.captureException).toHaveBeenCalledWith(
      err,
      expect.anything(),
    );
  });

  it("emits a message alongside field errors for ZodError", () => {
    envMock.NODE_ENV = "test";
    const err = z.object({ name: z.string() }).safeParse({}).error as ZodError;
    const res = createResponse();

    handler(err, {} as AuthRequest, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      status: "fail",
      message: "Validation failed",
      errors: [{ field: "name", message: expect.any(String) }],
    });
  });
});
