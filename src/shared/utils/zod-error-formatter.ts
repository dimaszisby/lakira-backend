import type { ZodError } from "zod";
import type { FieldIssue } from "@/shared/utils/error-envelope.js";

export const formatZodIssues = (error: ZodError): FieldIssue[] =>
  error.errors.map((issue) => ({
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
  error.errors.map((issue) => ({
    field: issue.path.join(".") || "body",
    code: issue.code,
  }));
