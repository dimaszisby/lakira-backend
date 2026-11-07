import type { ZodError, core } from "zod";
import type { FieldIssue } from "@/shared/utils/error-envelope.js";

type Issue = core.$ZodIssue;

const pathKey = (issue: Issue): string => issue.path.map(String).join(".");

/**
 * The issues a client is told about (zod-4-migration D-06). zod 4 reports a union no
 * option matched as one `invalid_union` at the union's path, holding every option's
 * issues. Where an option is an object, this names the fields of the closest one instead:
 * the one with the fewest issues, the first on a tie. zod 3 did that only when the option
 * failed on its refinements, and otherwise answered "Invalid input" for the whole body. A
 * union of primitives stays one "Invalid input". zod 4 also runs a length check on a
 * value of the wrong type; zod 3 stopped a field at its type error, so a field with an
 * `invalid_type` issue keeps only that one.
 */
const asZod3Issues = (issues: readonly Issue[]): Issue[] => {
  const flatten = (list: readonly Issue[], prefix: PropertyKey[]): Issue[] =>
    list.flatMap((issue) => {
      const path = [...prefix, ...issue.path];
      if (issue.code === "invalid_union") {
        const objectOptions = issue.errors.filter((option) =>
          option.some((inner) => inner.path.length > 0),
        );
        if (objectOptions.length > 0) {
          const closest = objectOptions.reduce((best, option) =>
            option.length < best.length ? option : best,
          );
          return flatten(closest, path);
        }
      }
      return [{ ...issue, path }];
    });

  const flat = flatten(issues, []);
  const typeFailed = new Set(
    flat.filter((issue) => issue.code === "invalid_type").map(pathKey),
  );
  return flat.filter(
    (issue) => issue.code === "invalid_type" || !typeFailed.has(pathKey(issue)),
  );
};

export const formatZodIssues = (error: ZodError): FieldIssue[] =>
  asZod3Issues(error.issues).map((issue) => ({
    field: issue.path.join(".") || "body",
    message: issue.message,
  }));

/**
 * What a failed validation is logged as: each issue's field and Zod's issue
 * code. Not the message, which goes to the client: Zod's default messages
 * repeat the input (`received '<value>'`, `Unrecognized key(s): '<key>'`), and
 * log redaction does not scan text (log-redaction-coverage D-09).
 */
export const describeZodIssues = (
  error: ZodError,
): { field: string; code: string }[] =>
  asZod3Issues(error.issues).map((issue) => ({
    field: issue.path.join(".") || "body",
    code: issue.code,
  }));
