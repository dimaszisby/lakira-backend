export type MetricDetailInclude = "category" | "logs" | "settings";

const INCLUDES: readonly MetricDetailInclude[] = [
  "category",
  "logs",
  "settings",
];

/**
 * The relations a validated `?include=` names, in one order: `flat` is none and `full`
 * is all. The handler loads these and the cache key names them, from this one reading
 * (api-tooling-residuals D-03).
 */
export const metricDetailIncludes = (
  include: string | undefined,
): MetricDetailInclude[] => {
  if (!include || include === "flat") return [];
  if (include === "full") return [...INCLUDES];
  const named = new Set(include.split(",").map((token) => token.trim()));
  return INCLUDES.filter((relation) => named.has(relation));
};
