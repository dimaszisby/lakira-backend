import { AuthRequest } from "@/types/request.context.js";
import { pickValidated } from "@/shared/middleware/validated.js";
import { assertAuthenticated } from "@/utils/auth-guards.js";
import { getMetricCategorySchema } from "./schema.zod.js";
import { categoryEntryKey } from "../../application/cache.constants.js";

/**
 * Cache key for `GET /metric-categories/:id`, from the validated id. It read raw
 * `req.params` (api-tooling-residuals D-03, audit X11).
 */
export const categoryCacheKey = (req: AuthRequest) => {
  // Throws without a tenant; cacheMiddleware then skips the cache
  // (architecture-boundaries D-03).
  assertAuthenticated(req);
  const { params } = pickValidated(getMetricCategorySchema)(req);
  return categoryEntryKey(req.user.organizationId, req.user.id, params.id);
};
