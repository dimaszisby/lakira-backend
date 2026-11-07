import { describe, expect, it } from "@jest/globals";
import { z } from "zod";
import { zod3Messages } from "@/shared/utils/zod3-messages.js";

// Each expected message is what zod 3.25 gave for the same schema and input, read off the
// corpus run in zod-4-migration D-03.
const messageOf = (schema: z.ZodType, input: unknown): string => {
  const result = schema.safeParse(input, { error: zod3Messages });
  if (result.success) throw new Error("expected the parse to fail");
  return result.error.issues[0].message;
};

describe("zod3Messages", () => {
  it.each<[string, z.ZodType, unknown, string]>([
    ["a missing value", z.string(), undefined, "Required"],
    ["a wrong type", z.string(), 1, "Expected string, received number"],
    ["an array", z.string(), [], "Expected string, received array"],
    ["null", z.number(), null, "Expected number, received null"],
    ["NaN", z.coerce.number(), "abc", "Expected number, received nan"],
    [
      "a float for an int",
      z.number().int(),
      1.5,
      "Expected integer, received float",
    ],
    ["an invalid date", z.date(), new Date("x"), "Invalid date"],
    [
      "a short string",
      z.string().min(2),
      "a",
      "String must contain at least 2 character(s)",
    ],
    [
      "a long string",
      z.string().max(2),
      "abc",
      "String must contain at most 2 character(s)",
    ],
    [
      "a small number",
      z.number().min(1),
      0,
      "Number must be greater than or equal to 1",
    ],
    [
      "a non-positive number",
      z.number().positive(),
      0,
      "Number must be greater than 0",
    ],
    [
      "a big number",
      z.number().max(1),
      2,
      "Number must be less than or equal to 1",
    ],
    [
      "a short array",
      z.array(z.string()).min(1),
      [],
      "Array must contain at least 1 element(s)",
    ],
    ["an email", z.string().email(), "x", "Invalid email"],
    ["a guid", z.string().guid(), "x", "Invalid uuid"],
    ["a url", z.string().url(), "x", "Invalid url"],
    ["a datetime", z.string().datetime(), "x", "Invalid datetime"],
    ["a regex", z.string().regex(/^a$/), "b", "Invalid"],
    ["a missing enum", z.enum(["a", "b"]), undefined, "Required"],
    [
      "an enum of the wrong type",
      z.enum(["a", "b"]),
      1,
      "Expected 'a' | 'b', received number",
    ],
    [
      "an enum value",
      z.enum(["a", "b"]),
      "c",
      "Invalid enum value. Expected 'a' | 'b', received 'c'",
    ],
    [
      "a literal",
      z.literal(false),
      null,
      "Invalid literal value, expected false",
    ],
    [
      "an unknown key",
      z.object({}).strict(),
      { a: 1, b: 2 },
      "Unrecognized key(s) in object: 'a', 'b'",
    ],
    ["a union", z.union([z.string(), z.null()]), 1, "Invalid input"],
    ["a refinement", z.string().refine(() => false), "a", "Invalid input"],
  ])("words %s as zod 3 did", (_name, schema, input, expected) => {
    expect(messageOf(schema, input)).toBe(expected);
  });

  it("leaves a message the schema sets itself", () => {
    expect(messageOf(z.string().min(2, { message: "Too short" }), "a")).toBe(
      "Too short",
    );
  });
});
