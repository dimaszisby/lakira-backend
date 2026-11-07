export type CursorCacheSegmentValue =
  | string
  | number
  | boolean
  | null
  | undefined;
export type CursorCacheSegment = [string, CursorCacheSegmentValue];

const normalizeSegmentValue = (value: CursorCacheSegmentValue): string => {
  if (value === undefined || value === null) return "_";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") {
    if (Number.isNaN(value) || !Number.isFinite(value)) return "_";
    return String(value);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? encodeSegmentText(trimmed) : "_";
};

/**
 * A string segment, encoded so it can stand only for itself (kit
 * query-values-mean-what-they-say, D-03; audit S12). Trimmed alone, a search holding `:`
 * could shift into the next segment, `_` matched the empty sentinel, and `*` made a key
 * read as a Redis pattern. `encodeURIComponent` takes `:`; `_` and `*`, which it leaves
 * alone, are encoded by hand. An id, a number or a plain word comes out unchanged, so the
 * invalidation patterns that name one still match.
 */
const encodeSegmentText = (text: string): string =>
  encodeURIComponent(text).replace(
    /[_*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

export const cursorCacheNamespace = (
  feature: string,
  version?: number | string,
): string => {
  const slug = feature.trim().replace(/\s+/g, "-");
  if (version === undefined || version === null || version === "") {
    return `cursor:${slug}`;
  }
  const versionStr = String(version).replace(/^v/i, "");
  return `cursor:${slug}:v${versionStr}`;
};

/**
 * Builds a cursor-pagination cache key.
 *
 * `organizationId` is a required string, not an optional `segments` entry, so a
 * caller cannot omit the tenant boundary — see ADR-0035. It is emitted as a fixed
 * `org:<id>` segment directly after the user segment. It once accepted a missing
 * one and wrote `org:_` (architecture-boundaries D-03).
 */
export const buildCursorCacheKey = ({
  feature,
  version = 1,
  userId,
  organizationId,
  segments = [],
}: {
  feature: string;
  version?: number | string;
  userId?: string | null;
  organizationId: string;
  segments?: CursorCacheSegment[];
}): string => {
  // A missing value is the "_" sentinel itself, not the text "_", which is encoded.
  const safeUser = normalizeSegmentValue(userId);
  const safeOrg = normalizeSegmentValue(organizationId);
  const parts = [
    cursorCacheNamespace(feature, version),
    safeUser,
    `org:${safeOrg}`,
  ];

  for (const [label, value] of segments) {
    parts.push(`${label}:${normalizeSegmentValue(value)}`);
  }

  return parts.join(":");
};
