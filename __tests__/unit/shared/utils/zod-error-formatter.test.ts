import { describe, expect, it } from "@jest/globals";
import { z, type ZodError } from "zod";
import {
  describeZodIssues,
  formatZodIssues,
} from "@/shared/utils/zod-error-formatter.js";
import { zod3Messages } from "@/shared/utils/zod3-messages.js";

const errorOf = (schema: z.ZodType, input: unknown): ZodError => {
  const result = schema.safeParse(input, { error: zod3Messages });
  if (result.success) throw new Error("expected the parse to fail");
  return result.error;
};

// Two object options, as the metric-settings bodies are: goal on, or goal off.
const goalBody = z.union([
  z
    .object({
      goalEnabled: z.literal(true),
      goalValue: z.number(),
      note: z.string(),
    })
    .strict(),
  z
    .object({ goalEnabled: z.literal(false).optional(), note: z.string() })
    .strict(),
]);

describe("zod-error-formatter (zod-4-migration D-06)", () => {
  it("names the field of the closest object option, not the union", () => {
    expect(formatZodIssues(errorOf(goalBody, { note: 1 }))).toEqual([
      { field: "note", message: "Expected string, received number" },
    ]);
  });

  it("prefixes a nested union's fields with its own path", () => {
    const schema = z.object({ body: goalBody });
    expect(
      formatZodIssues(
        errorOf(schema, { body: { goalEnabled: true, note: "a" } }),
      ),
    ).toEqual([{ field: "body.goalValue", message: "Required" }]);
  });

  it("keeps a union of primitives as one issue at its own path", () => {
    const schema = z.object({ after: z.union([z.string(), z.null()]) });
    expect(formatZodIssues(errorOf(schema, { after: 1 }))).toEqual([
      { field: "after", message: "Invalid input" },
    ]);
  });

  it("keeps only the type error of a field that failed its type", () => {
    const schema = z.object({ password: z.string().min(6) });
    expect(formatZodIssues(errorOf(schema, { password: [] }))).toEqual([
      { field: "password", message: "Expected string, received array" },
    ]);
  });

  it("logs the same fields, by code", () => {
    expect(describeZodIssues(errorOf(goalBody, { note: 1 }))).toEqual([
      { field: "note", code: "invalid_type" },
    ]);
  });

  it("names an issue at the root body", () => {
    expect(formatZodIssues(errorOf(z.object({}).strict(), { a: 1 }))).toEqual([
      { field: "body", message: "Unrecognized key(s) in object: 'a'" },
    ]);
  });
});
