import { createHash } from "node:crypto";

// A namespace segment the name may repeat: a constant a key builder wrote,
// never text from a request.
const PLAIN_TOKEN = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const VERSION_TOKEN = /^v(\d{1,6}|\*)$/;

const namespaceOf = (key: string): string => {
  const [first, feature, version] = key.split(":");
  if (!first || !PLAIN_TOKEN.test(first)) return "unknown";
  if (first !== "cursor") return first;
  if (!feature || !PLAIN_TOKEN.test(feature)) return "unknown";
  return version && VERSION_TOKEN.test(version)
    ? `cursor:${feature}:${version}`
    : `cursor:${feature}`;
};

/**
 * How a cache key, or an invalidation pattern, is named in a log line: its
 * namespace and the first 12 hex characters of its SHA-256. Redaction is by
 * metadata key and does not scan message text, and a cursor key holds the
 * user's search text, so the key itself is never interpolated
 * (log-redaction-coverage D-08). One key keeps one name, so its miss, store and
 * hit lines can be matched.
 */
export const cacheEntryName = (key: string): string =>
  `${namespaceOf(key)}#${createHash("sha256").update(key).digest("hex").slice(0, 12)}`;
