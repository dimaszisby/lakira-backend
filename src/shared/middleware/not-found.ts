import type { Request, Response } from "express";
import { sendError } from "@/shared/utils/error-envelope.js";

const ROUTE_NOT_FOUND_MESSAGE = "Route not found";

/**
 * The last route handler: anything that reaches it matched no route. Without it
 * Express answers with its own HTML page, the one non-JSON error the API emitted
 * (C3 residual 1). It answers directly rather than throwing, so a scanner probing
 * paths is recorded by the access log only, not logged as an error. The path is
 * deliberately not echoed back.
 */
export const createNotFoundHandler =
  () =>
  (_req: Request, res: Response): void => {
    sendError(res, 404, ROUTE_NOT_FOUND_MESSAGE);
  };

export const notFoundHandler = createNotFoundHandler();
