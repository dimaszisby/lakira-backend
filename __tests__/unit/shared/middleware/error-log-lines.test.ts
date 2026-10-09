import {
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  jest,
} from "@jest/globals";
import { Writable } from "node:stream";
import type { Response } from "express";
import { transports } from "winston";
import { z } from "zod";
import logger from "@/utils/logger.js";
import { createErrorHandler } from "@/shared/middleware/error.js";
import type { AuthRequest } from "@/types/request.context.js";

// Kit log-redaction-coverage, D-08. The real logger: Winston appends an error
// argument's message to the line, and body-parser's message quotes the start
// of the body it could not parse.
const EMAIL = "victim@example.com";

describe("error handler: what its client-error lines carry", () => {
  let lines: string[];
  let capture: InstanceType<typeof transports.Stream>;

  beforeEach(() => {
    lines = [];
    capture = new transports.Stream({
      stream: new Writable({
        write(chunk, _encoding, done) {
          lines.push(String(chunk));
          done();
        },
      }),
    });
    logger.add(capture);
  });

  afterEach(() => {
    logger.remove(capture);
  });

  it("writes no part of the body", () => {
    // What body-parser raises for `{"email":"victim@example.com"` cut short.
    const err = Object.assign(
      new SyntaxError(
        `Unexpected token 'v', ..."{"email":"${EMAIL}" is not valid JSON`,
      ),
      {
        type: "entity.parse.failed",
        status: 400,
        statusCode: 400,
        expose: true,
        body: `{"email":"${EMAIL}"`,
      },
    );
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    createErrorHandler()(err, {} as AuthRequest, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain(EMAIL);
    expect(lines[0]).not.toContain("Unexpected token");
    const record = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(record.message).toBe("Invalid JSON payload received");
    expect(record.type).toBe("entity.parse.failed");
  });

  const respond = () =>
    ({
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }) as unknown as Response;

  // D-09. Zod's default messages repeat the input: the enum message quotes the
  // value and a strict object names every unknown key.
  it("logs a failed validation by field and code, not by Zod's message", () => {
    const parsed = z
      .object({ sortOrder: z.enum(["ASC", "DESC"]) })
      .strict()
      .safeParse({ sortOrder: EMAIL, [`x-${EMAIL}`]: 1 });
    if (parsed.success) throw new Error("expected the parse to fail");

    createErrorHandler()(parsed.error, {} as AuthRequest, respond(), jest.fn());

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain(EMAIL);
    const record = JSON.parse(lines[0]) as { issues: unknown };
    expect(record.issues).toEqual([
      { field: "sortOrder", code: "invalid_enum_value" },
      { field: "body", code: "unrecognized_keys" },
    ]);
  });

  it("logs an undecodable path parameter without the parameter", () => {
    const err = Object.assign(
      new URIError(`Failed to decode param '${EMAIL}%zz'`),
      {
        status: 400,
        statusCode: 400,
      },
    );

    createErrorHandler()(err, {} as AuthRequest, respond(), jest.fn());

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain(EMAIL);
    expect((JSON.parse(lines[0]) as { message: string }).message).toBe(
      "Client error 400: URIError",
    );
  });

  it("logs an exposed parser error by its type, not its message", () => {
    const err = Object.assign(new Error(`unsupported charset "${EMAIL}"`), {
      status: 415,
      statusCode: 415,
      expose: true,
      type: "charset.unsupported",
    });

    createErrorHandler()(err, {} as AuthRequest, respond(), jest.fn());

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain(EMAIL);
    expect((JSON.parse(lines[0]) as { message: string }).message).toBe(
      "Client error 415: charset.unsupported",
    );
  });
});
