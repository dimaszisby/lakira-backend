import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

export const requestIdStorage = new AsyncLocalStorage<string>();

export const getRequestId = (): string | undefined =>
  requestIdStorage.getStore();

/**
 * The incoming ids honoured: 1 to 64 characters of letters, digits, `.`, `_` and
 * `-`. A UUID fits. Anything else is replaced by a minted UUID, never echoed or
 * logged: the id goes onto every log line of the request and onto its Sentry
 * event, so a caller could otherwise write text of any length there (register row
 * B-14; kit observability, D-05). A header sent twice arrives joined as "a, b" and
 * is replaced too.
 */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const incoming = req.headers["x-request-id"];
  const requestId =
    typeof incoming === "string" && REQUEST_ID_PATTERN.test(incoming)
      ? incoming
      : randomUUID();

  res.setHeader("x-request-id", requestId);
  requestIdStorage.run(requestId, () => next());
};
