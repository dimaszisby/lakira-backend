import { createHash } from "crypto";
import type { Response, NextFunction } from "express";
import { AuthRequest } from "@/types/request.context.js";
import { assertAuthenticated } from "@/utils/auth-guards.js";
import { env } from "@/config/envManager.js";
import { pickValidated } from "@/shared/middleware/validated.js";
import { getDashboardVizSchema, getVisualizationSchema } from "./schema.zod.js";
import { successResponse } from "@/utils/response-formatter.js";
import { buildAnalyticsFeature } from "../../feature.js";

const DASH_CACHE_MAX_AGE = env.VIZ_CACHE_MAX_AGE_SEC;
const DASH_CACHE_STALE_WHILE_REVALIDATE = env.VIZ_CACHE_STALE_SEC;

/** Both visualization routes are cached identically; derived from env, so constant per process. */
const VIZ_CACHE_CONTROL = [
  "private",
  `max-age=${DASH_CACHE_MAX_AGE}`,
  `stale-while-revalidate=${DASH_CACHE_STALE_WHILE_REVALIDATE}`,
].join(", ");

type AnalyticsFeature = ReturnType<typeof buildAnalyticsFeature>;
// Built on first use, never at import (ADR-0045).
let feature: AnalyticsFeature | undefined;
const getFeature = (): AnalyticsFeature =>
  (feature ??= buildAnalyticsFeature());

export const overrideAnalyticsFeatureForTest = (custom: AnalyticsFeature) => {
  feature = custom;
};

/**
 * A validator must change whenever the body does. The previous implementation
 * base64-encoded the body and kept the first 27 characters, which is a *prefix* of
 * the payload rather than a digest of it — it covered only the leading 20 bytes, so
 * two responses differing after that point shared an ETag and a conditional request
 * was answered 304 with stale data. Hash first, then truncate, matching
 * `deriveEtagSeed` in VisualizationReadRepoSequelize.
 */
function makeEtag(body: unknown) {
  const digest = createHash("sha1")
    .update(JSON.stringify(body))
    .digest("base64url");
  return `"${digest.slice(0, 27)}"`;
}

export async function handleGetVisualization(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    assertAuthenticated(req);
    const v = pickValidated(getVisualizationSchema)(req);
    const { params, query } = v;

    const data = await getFeature().getVisualization.execute({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      metricId: params.metricId,
      startISO: query.start,
      endISO: query.end,
      bucket: query.bucket,
      tz: query.tz,
      fill: query.fill,
    });

    // Headers first: RFC 9110 15.4.5 requires a 304 to carry the same validator a 200
    // would have. Setting them after the conditional sent a bare 304 with no ETag and
    // no Cache-Control, which a client cannot use to refresh its cache entry.
    const etag = makeEtag(data);
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", VIZ_CACHE_CONTROL);
    if (req.headers["if-none-match"] === etag) return res.status(304).end();

    return successResponse(res, 200, data);
  } catch (err) {
    next(err);
  }
}

export async function handleGetDashboardVisualization(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    assertAuthenticated(req);
    const { query } = pickValidated(getDashboardVizSchema)(req);

    const data = await getFeature().getDashboardVisualization.execute({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      startISO: query.start,
      endISO: query.end,
      bucket: query.bucket,
      tz: query.tz,
      fill: query.fill,
      limit: query.limit,
    });

    const etag = data?.sync?.etagSeed ?? makeEtag(data);
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", VIZ_CACHE_CONTROL);
    if (req.headers["if-none-match"] === etag) return res.status(304).end();
    return successResponse(res, 200, data);
  } catch (err) {
    next(err);
  }
}
