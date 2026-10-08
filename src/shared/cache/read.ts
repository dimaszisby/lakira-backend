import logger from "@/utils/logger.js";
import { cacheEntryName } from "@/utils/cache-entry-name.js";

export type CachedRead = { ok: true; value: unknown } | { ok: false };

/**
 * Parses a value read from the cache. One that does not parse is a miss: it is
 * logged by the entry's name and never thrown, because `JSON.parse`'s message
 * quotes the start of what it could not read, which is a stored response, and
 * a thrown error's message is written to the log (log-redaction-coverage D-09).
 */
export const readCachedJson = (raw: string, key: string): CachedRead => {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    logger.warn(`[CACHE] unreadable entry ${cacheEntryName(key)}`);
    return { ok: false };
  }
};
