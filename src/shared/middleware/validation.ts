import { AuthRequest } from "@/types/request.context.js";
import { Response, NextFunction } from "express";
import { ZodError, ZodTypeAny } from "zod";
import logger from "@/utils/logger.js";
import {
  describeZodIssues,
  formatZodIssues,
} from "@/shared/utils/zod-error-formatter.js";
import { zod3Messages } from "@/shared/utils/zod3-messages.js";
import {
  sendError,
  VALIDATION_FAILED_MESSAGE,
} from "@/shared/utils/error-envelope.js";

const ZOD3_MESSAGES = { error: zod3Messages };

type SchemaBag = {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
};

const handleError = (res: Response, error: ZodError) => {
  const formattedErrors = formatZodIssues(error);
  // The client's mistake: at warn, as every other 4xx (api-tooling-residuals D-02).
  logger.warn("Validation Errors:", { issues: describeZodIssues(error) });
  sendError(res, 400, VALIDATION_FAILED_MESSAGE, { errors: formattedErrors });
};

type SafeParseHolder = { safeParse: ZodTypeAny["safeParse"] };

const hasSafeParse = (candidate: unknown): candidate is SafeParseHolder =>
  typeof candidate === "object" &&
  candidate !== null &&
  "safeParse" in candidate &&
  typeof (candidate as { safeParse?: unknown }).safeParse === "function";

const isZodSchema = (x: unknown): x is ZodTypeAny => hasSafeParse(x);

export const validate =
  (arg?: SchemaBag | ZodTypeAny) =>
  (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!arg) return next();

    try {
      if (isZodSchema(arg)) {
        const parsed = arg.safeParse(
          { params: req.params, query: req.query, body: req.body },
          ZOD3_MESSAGES,
        );
        if (!parsed.success) return handleError(res, parsed.error);
        req.validated = parsed.data;
        return next();
      }

      const out: Record<string, unknown> = {};
      if (arg.params) {
        const p = arg.params.safeParse(req.params, ZOD3_MESSAGES);
        if (!p.success) return handleError(res, p.error);
        out.params = p.data;
      }
      if (arg.query) {
        const q = arg.query.safeParse(req.query, ZOD3_MESSAGES);
        if (!q.success) return handleError(res, q.error);
        out.query = q.data;
      }
      if (arg.body) {
        const b = arg.body.safeParse(req.body, ZOD3_MESSAGES);
        if (!b.success) return handleError(res, b.error);
        out.body = b.data;
      }
      req.validated = out;
      return next();
    } catch (error) {
      logger.error("Unexpected Error during Validation:", error);
      next(error);
    }
  };

export default validate;
