import { describe, it, expect } from "@jest/globals";
import { maskQuotedValues } from "@/utils/mask-quoted-values.js";

// Kit log-redaction-coverage, D-16 (register row B-20). Postgres quotes a
// submitted value in some messages and does not escape a quote inside it, so
// everything from the first quote to the last is masked.
describe("maskQuotedValues", () => {
  it.each([
    [
      "a single value",
      'invalid input syntax for type uuid: "victim@example.com"',
      'invalid input syntax for type uuid: "[value]"',
    ],
    [
      "two identifiers, and the text between them",
      'insert or update on table "a" violates foreign key constraint "b"',
      'insert or update on table "[value]"',
    ],
    [
      "a quote inside a value",
      'invalid input syntax for type uuid: "a"secret"',
      'invalid input syntax for type uuid: "[value]"',
    ],
    [
      "a newline inside a value",
      'invalid input syntax for type uuid: "line one\nsecret"',
      'invalid input syntax for type uuid: "[value]"',
    ],
    [
      "a lone quote, to the end",
      'value too long: "secret',
      'value too long: "[value]',
    ],
    ["no quote", "connection terminated", "connection terminated"],
  ])("masks %s", (_label, input, expected) => {
    expect(maskQuotedValues(input)).toBe(expected);
  });
});
