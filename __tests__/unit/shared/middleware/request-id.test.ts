import type { Request, Response } from "express";
import {
  getRequestId,
  requestIdMiddleware,
} from "@/shared/middleware/request-id.js";

/**
 * Register row B-14 (kit observability, D-05). Any non-empty x-request-id a caller
 * sent became the request's id: on every log line, in the response header and on
 * the Sentry event. Only 1 to 64 characters of [A-Za-z0-9._-] are honoured now.
 * `getRequestId()` is what the logger and the error handler read, so it is read
 * here inside `next()`.
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const run = (incoming: string | string[] | undefined) => {
  const headers: Record<string, string> = {};
  const req = {
    headers: incoming === undefined ? {} : { "x-request-id": incoming },
  } as unknown as Request;
  const res = {
    setHeader: (name: string, value: string) => {
      headers[name.toLowerCase()] = value;
    },
  } as unknown as Response;
  let seenInside: string | undefined;

  requestIdMiddleware(req, res, () => {
    seenInside = getRequestId();
  });

  return { echoed: headers["x-request-id"], seenInside };
};

describe("requestIdMiddleware", () => {
  it.each([
    ["a UUID", "3f2b8c1e-9d4a-4f6b-8e2c-1a5d7b9c0e3f"],
    ["a short token", "my-trace-id-abc123"],
    ["dots and underscores", "svc.web_01.req-9"],
    ["exactly 64 characters", "a".repeat(64)],
  ])("honours %s", (_, id) => {
    expect(run(id)).toEqual({ echoed: id, seenInside: id });
  });

  it.each([
    ["65 characters", "a".repeat(65)],
    ["a very long value", "x".repeat(10_000)],
    ["a space", "trace id"],
    ["a slash", "trace/id"],
    ["a colon", "trace:id"],
    ["a newline", "trace\nid"],
    ["a non-ASCII letter", "tracé"],
    ["a header sent twice, as Node joins it", "first-id, second-id"],
  ])("replaces a value with %s by a minted UUID", (_, id) => {
    const { echoed, seenInside } = run(id);

    expect(echoed).toMatch(UUID_PATTERN);
    expect(seenInside).toBe(echoed);
    expect(echoed).not.toContain(id);
  });

  it.each([
    ["no header", undefined],
    ["an empty header", ""],
    ["an array", ["one", "two"]],
  ])("mints a UUID for %s", (_, incoming) => {
    const { echoed, seenInside } = run(incoming);

    expect(echoed).toMatch(UUID_PATTERN);
    expect(seenInside).toBe(echoed);
  });
});
