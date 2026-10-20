import { TerminalMessageError } from "@/shared/application/errors/TerminalMessageError.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a field of a job is a UUID, as every id a publisher sends is. */
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);

/**
 * A job's body as an object, for its handler to check field by field. A message no
 * retry can fix parks at once: content that is not JSON, or JSON that is not an object
 * (kit queue-design-hardening, D-03). Every handler starts here, so none casts the
 * payload it was given.
 */
export const readJobBody = (content: Buffer): Record<string, unknown> => {
  let body: unknown;
  try {
    body = JSON.parse(content.toString());
  } catch (error) {
    throw new TerminalMessageError("Refusing message with malformed JSON.", {
      cause: error,
    });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new TerminalMessageError(
      "Refusing message that is not a JSON object.",
    );
  }
  return body as Record<string, unknown>;
};
