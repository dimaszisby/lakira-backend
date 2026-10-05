import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { Writable } from "node:stream";
import { transports } from "winston";
import {
  DatabaseError,
  UniqueConstraintError,
  ValidationErrorItem,
} from "sequelize";
import logger, { redactObject } from "@/utils/logger.js";

// Audit T1, kit log-redaction-coverage D-06. The real logger and the real
// Sequelize error classes: Winston copies an error's own properties onto the
// record, and a database error's properties are its SQL and bound values.
const EMAIL = "victim@example.com";
const HASH = "$2b$12$abcdefghijklmnopqrstuuJ1rYw2yq0G0H1nS4T5U6V7W8X9Y0Z1a";

const pgError = () =>
  Object.assign(
    new Error('duplicate key value violates unique constraint "users_email"'),
    {
      code: "23505",
      constraint: "users_email",
      table: "users",
      detail: `Key (email)=(${EMAIL}) already exists.`,
      sql: 'INSERT INTO "users" ("id","email","password") VALUES ($1,$2,$3)',
      parameters: ["id-1", EMAIL, HASH],
    },
  );

const databaseError = () =>
  new DatabaseError(
    pgError() as ConstructorParameters<typeof DatabaseError>[0],
  );

const uniqueError = () =>
  new UniqueConstraintError({
    parent: pgError() as never,
    fields: { email: EMAIL },
    errors: [
      new ValidationErrorItem(
        "email must be unique",
        "unique violation" as never,
        "email",
        EMAIL,
        { dataValues: { email: EMAIL, password: HASH } } as never,
        "not_unique",
        "",
        [],
      ),
    ],
    message: "Validation error",
  });

describe("logger: an error's payload", () => {
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

  const lastRecord = () =>
    JSON.parse(lines[lines.length - 1]) as Record<string, unknown>;

  const expectNoPayload = () => {
    const line = lines[lines.length - 1];
    expect(line).not.toContain(EMAIL);
    expect(line).not.toContain(HASH);
    expect(line).not.toContain("INSERT INTO");
  };

  it("keeps a database error's bound values and SQL out of the line", () => {
    const err = databaseError();
    // The call the error middleware makes for this branch.
    logger.error(`Database error: ${err.original.message}`, err);

    expectNoPayload();
    const record = lastRecord();
    expect(record).not.toHaveProperty("sql");
    expect(record).not.toHaveProperty("parameters");
    expect(record).not.toHaveProperty("original");
    expect(record).not.toHaveProperty("parent");
  });

  it("keeps a unique-constraint error's fields, values and instance out of the line", () => {
    const err = uniqueError();
    logger.error(`Error Occurred: ${err.message}`, err);

    expectNoPayload();
    const record = lastRecord();
    expect(record).not.toHaveProperty("fields");
    expect(record).not.toHaveProperty("errors");
  });

  it("still says what failed: name, stack, message and the database's own codes", () => {
    const err = databaseError();
    logger.error(`Database error: ${err.original.message}`, err);

    const record = lastRecord();
    expect(record.name).toBe("SequelizeDatabaseError");
    expect(String(record.message)).toContain("Database error:");
    expect(String(record.stack)).toContain("SequelizeDatabaseError");
    expect(record.db).toEqual({
      code: "23505",
      constraint: "users_email",
      table: "users",
    });
  });

  it("keeps the scalar fields an ordinary error is told apart by", () => {
    const err = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
      syscall: "connect",
      statusCode: 503,
      config: { password: HASH, user: EMAIL },
    });
    logger.error("[REDIS] connection failed:", err);

    expectNoPayload();
    const record = lastRecord();
    expect(record.code).toBe("ECONNREFUSED");
    expect(record.syscall).toBe("connect");
    expect(record.statusCode).toBe(503);
    expect(record).not.toHaveProperty("config");
  });

  it("reduces an error nested inside a metadata object", () => {
    logger.error("background task failed", {
      label: "verification-email",
      err: uniqueError(),
    });

    expectNoPayload();
    const record = lastRecord();
    expect(record.label).toBe("verification-email");
    expect(record.err).toMatchObject({
      name: "SequelizeUniqueConstraintError",
    });
  });

  it("passes ordinary metadata through untouched", () => {
    logger.warn("auth.lockout.triggered", { emailHash: "abc", attempts: 5 });

    const record = lastRecord();
    expect(record.emailHash).toBe("abc");
    expect(record.attempts).toBe(5);
  });

  it("leaves metadata passed beside an error in place", () => {
    logger.error("job failed", new Error("boom"), { jobId: "j-1" });

    expect(lastRecord().jobId).toBe("j-1");
  });

  // A message can carry a format token the caller never wrote: Winston appends
  // the error's own message, and a body-parser message quotes the request body.
  // `splat()` would then print the whole error object into the message text.
  it.each(["%j", "%s", "%o", "%O"])(
    "does not print the error through a %s token in the message",
    (token) => {
      const err = databaseError();
      logger.error(`Invalid JSON payload received ${token}`, err);

      expectNoPayload();
    },
  );

  it("does not print a body-parser error's raw body through a token", () => {
    const err = Object.assign(
      new SyntaxError(
        'Unexpected token \'%\', "%j{"email"... is not valid JSON',
      ),
      {
        status: 400,
        type: "entity.parse.failed",
        body: `%j{"email":"${EMAIL}"}`,
      },
    );
    logger.error("Invalid JSON payload received", err);

    expectNoPayload();
    expect(lastRecord()).not.toHaveProperty("body");
  });

  it("reduces an error passed as the only argument", () => {
    logger.error(databaseError());

    expectNoPayload();
    const record = lastRecord();
    expect(record.level).toBe("error");
    expect(record.name).toBe("SequelizeDatabaseError");
    expect(record).not.toHaveProperty("sql");
  });

  it("reduces an error passed as the message of a log entry", () => {
    logger.log({ level: "error", message: uniqueError() as never });

    expectNoPayload();
    expect(lastRecord()).not.toHaveProperty("fields");
  });

  it("keeps the record's own fields when an error owns keys of the same name", () => {
    const err = Object.assign(new Error("boom"), {
      level: "silly",
      timestamp: "never",
      service: "someone-else",
    });
    logger.error("job failed", err);

    const record = lastRecord();
    expect(record.level).toBe("error");
    expect(record.timestamp).not.toBe("never");
    expect(record.service).not.toBe("someone-else");
  });

  it("keeps a metadata key that shares its name with an error field", () => {
    const err = Object.assign(new Error("boom"), { jobId: "from-the-error" });
    logger.error("job failed", err, { jobId: "j-1" });

    expect(lastRecord().jobId).toBe("j-1");
  });
});

describe("redactObject: an error value", () => {
  it("is reduced to its allowlisted fields", () => {
    const result = redactObject({ err: uniqueError() }, 0) as {
      err: Record<string, unknown>;
    };

    expect(JSON.stringify(result)).not.toContain(EMAIL);
    expect(JSON.stringify(result)).not.toContain(HASH);
    expect(result.err.name).toBe("SequelizeUniqueConstraintError");
    expect(result.err.db).toEqual({
      code: "23505",
      constraint: "users_email",
      table: "users",
    });
  });
});
