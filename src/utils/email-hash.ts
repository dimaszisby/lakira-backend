import { createHash } from "crypto";

/**
 * How an email address is named in a log line or a cache key: the SHA-256 of
 * the trimmed, lower-cased address. Redaction is by metadata key and does not
 * scan message text, so the address itself is never interpolated. Shared by
 * the login lockout and the rate limiters, so their lines can be matched.
 */
export const hashEmail = (email: string): string =>
  createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
