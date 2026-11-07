import { createHash } from "crypto";
import type { Response, NextFunction } from "express";
import { AuthRequest } from "@/types/request.context.js";
import { assertAuthenticated } from "@/utils/auth-guards.js";
import { pickValidated } from "@/shared/middleware/validated.js";
import { getDashboardVizSchema, getVisualizationSchema } from "./schema.zod.js";
import { successResponse } from "@/utils/response-formatter.js";
import type { AnalyticsFeature } from "../../feature.js";

/**
 * Both visualization routes: the browser may keep the response but must revalidate
 * it on every use. With a max-age it showed the old figures for that long after a
 * log was written, and nothing the frontend did could refetch past it.
 */
const VIZ_CACHE_CONTROL = "private, no-cache";

/**
 * A validator must change whenever the body does. The previous implementation
 * base64-encoded the body and kept the first 27 characters, which is a *prefix* of
 * the payload rather than a digest of it — it covered only the leading 20 bytes, so
 * two responses differing after that point shared an ETag and a conditional request
 * was answered 304 with stale data. Hash first, then truncate.
 *
 * Both handlers use it. The dashboard once sent `sync.etagSeed` instead, a hash of
 * the cache key and the metrics' `updated_at`, which no log write moves.
 */
function makeEtag(body: unknown) {
  const digest = createHash("sha1")
    .update(JSON.stringify(body))
    .digest("base64url");
  return `"${digest.slice(0, 27)}"`;
}

const handleGetVisualization =
  (feature: AnalyticsFeature) =>
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      assertAuthenticated(req);
      const v = pickValidated(getVisualizationSchema)(req);
      const { params, query } = v;

      const data = await feature.getVisualization.execute({
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
      // `req.fresh` reads the ETag set here and compares If-None-Match as RFC 9110
      // 13.1.2 asks: a list, weakly, `*` matching. It is the test `res.send` applies
      // too; deciding here skips serialising a body a 304 drops (v6-small-items D-03).
      const etag = makeEtag(data);
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", VIZ_CACHE_CONTROL);
      if (req.fresh) return res.status(304).end();

      return successResponse(res, 200, data);
    } catch (err) {
      next(err);
    }
  };

const handleGetDashboardVisualization =
  (feature: AnalyticsFeature) =>
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      assertAuthenticated(req);
      const { query } = pickValidated(getDashboardVizSchema)(req);

      const data = await feature.getDashboardVisualization.execute({
        userId: req.user.id,
        organizationId: req.user.organizationId,
        startISO: query.start,
        endISO: query.end,
        bucket: query.bucket,
        tz: query.tz,
        fill: query.fill,
        limit: query.limit,
      });

      const etag = makeEtag(data);
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", VIZ_CACHE_CONTROL);
      if (req.fresh) return res.status(304).end();
      return successResponse(res, 200, data);
    } catch (err) {
      next(err);
    }
  };

/** Both handlers, closed over the feature the router hands them (ADR-0072). */
export const createAnalyticsController = (feature: AnalyticsFeature) => ({
  handleGetVisualization: handleGetVisualization(feature),
  handleGetDashboardVisualization: handleGetDashboardVisualization(feature),
});
