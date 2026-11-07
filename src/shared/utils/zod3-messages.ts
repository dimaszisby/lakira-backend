import type { core } from "zod";

/**
 * zod 3's default English messages, as an error map for zod 4 (zod-4-migration D-03). zod
 * 4 words them differently ("Invalid input: expected string, received undefined" for
 * "Required"), and they reach the client in the 400 body and the operator in an
 * `[ENV_ERROR]` line. Every parse passes it, `{ error: zod3Messages }`, so neither
 * changed with the upgrade. A message a schema sets itself still wins: zod reads the
 * schema's own first.
 */

/** The name zod 3 gave a value's type in "received <type>". */
const typeName = (value: unknown): string => {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  if (value instanceof Map) return "map";
  if (value instanceof Set) return "set";
  if (value instanceof Promise) return "promise";
  if (typeof value === "number") return Number.isNaN(value) ? "nan" : "number";
  return typeof value;
};

const quoted = (values: readonly unknown[]): string =>
  values.map((value) => `'${String(value)}'`).join(" | ");

/** A literal and an enum both report `invalid_value`; zod 3 worded them apart. */
const isLiteral = (issue: core.$ZodRawIssue): boolean => {
  const def: unknown = issue.inst?._zod.def;
  return (
    typeof def === "object" &&
    def !== null &&
    "type" in def &&
    def.type === "literal"
  );
};

const invalidType = (
  issue: core.$ZodRawIssue<core.$ZodIssueInvalidType>,
): string => {
  const { input, expected } = issue;
  if (input === undefined) return "Required";
  if (expected === "date" && input instanceof Date) return "Invalid date";
  if (expected === "int" && typeof input === "number") {
    return "Expected integer, received float";
  }
  return `Expected ${expected === "int" ? "number" : expected}, received ${typeName(input)}`;
};

const invalidValue = (
  issue: core.$ZodRawIssue<core.$ZodIssueInvalidValue>,
): string => {
  const { input, values } = issue;
  if (isLiteral(issue)) {
    return `Invalid literal value, expected ${JSON.stringify(values[0])}`;
  }
  if (input === undefined) return "Required";
  if (typeof input !== "string") {
    return `Expected ${quoted(values)}, received ${typeName(input)}`;
  }
  return `Invalid enum value. Expected ${quoted(values)}, received '${input}'`;
};

const tooSmall = (issue: core.$ZodRawIssue<core.$ZodIssueTooSmall>): string => {
  const { origin, minimum, inclusive, exact } = issue;
  if (origin === "array") {
    return `Array must contain ${exact ? "exactly" : inclusive ? "at least" : "more than"} ${minimum} element(s)`;
  }
  if (origin === "string") {
    return `String must contain ${exact ? "exactly" : inclusive ? "at least" : "over"} ${minimum} character(s)`;
  }
  if (origin === "number" || origin === "int" || origin === "bigint") {
    return `Number must be ${exact ? "exactly equal to " : inclusive ? "greater than or equal to " : "greater than "}${minimum}`;
  }
  if (origin === "date") {
    return `Date must be ${exact ? "exactly equal to " : inclusive ? "greater than or equal to " : "greater than "}${new Date(Number(minimum))}`;
  }
  return "Invalid input";
};

const tooBig = (issue: core.$ZodRawIssue<core.$ZodIssueTooBig>): string => {
  const { origin, maximum, inclusive, exact } = issue;
  if (origin === "array") {
    return `Array must contain ${exact ? "exactly" : inclusive ? "at most" : "less than"} ${maximum} element(s)`;
  }
  if (origin === "string") {
    return `String must contain ${exact ? "exactly" : inclusive ? "at most" : "under"} ${maximum} character(s)`;
  }
  if (origin === "number" || origin === "int" || origin === "bigint") {
    return `Number must be ${exact ? "exactly" : inclusive ? "less than or equal to" : "less than"} ${maximum}`;
  }
  if (origin === "date") {
    return `Date must be ${exact ? "exactly" : inclusive ? "smaller than or equal to" : "smaller than"} ${new Date(Number(maximum))}`;
  }
  return "Invalid input";
};

const FORMAT_MESSAGES: Record<string, string> = {
  email: "Invalid email",
  uuid: "Invalid uuid",
  guid: "Invalid uuid",
  url: "Invalid url",
  datetime: "Invalid datetime",
  date: "Invalid date",
  time: "Invalid time",
  regex: "Invalid",
};

const invalidFormat = (
  issue: core.$ZodRawIssue<core.$ZodIssueInvalidStringFormat>,
): string => {
  if (issue.format === "starts_with" && "prefix" in issue) {
    return `Invalid input: must start with "${String(issue.prefix)}"`;
  }
  if (issue.format === "ends_with" && "suffix" in issue) {
    return `Invalid input: must end with "${String(issue.suffix)}"`;
  }
  if (issue.format === "includes" && "includes" in issue) {
    return `Invalid input: must include "${String(issue.includes)}"`;
  }
  return FORMAT_MESSAGES[issue.format] ?? "Invalid";
};

export const zod3Messages: core.$ZodErrorMap = (issue) => {
  switch (issue.code) {
    case "invalid_type":
      return invalidType(issue);
    case "invalid_value":
      return invalidValue(issue);
    case "too_small":
      return tooSmall(issue);
    case "too_big":
      return tooBig(issue);
    case "invalid_format":
      return invalidFormat(issue);
    case "not_multiple_of":
      return `Number must be a multiple of ${String(issue.divisor)}`;
    case "unrecognized_keys":
      return `Unrecognized key(s) in object: ${issue.keys.map((key) => `'${key}'`).join(", ")}`;
    default:
      return "Invalid input";
  }
};
