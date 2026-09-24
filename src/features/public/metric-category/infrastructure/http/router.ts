import { Router } from "express";
import { env } from "@/config/envManager.js";
import {
  createCategory,
  listCategories,
  getCategory,
  updateCategory,
  deleteCategory,
  generateDummyCategories,
} from "./controller.js";
import { authMiddleware } from "@/features/auth/public.js";
import { cacheMiddleware } from "@/shared/middleware/cache.js";
import { userRateLimiter } from "@/shared/middleware/rate-limiter.js";
import { validate } from "@/shared/middleware/validation.js";
import {
  createMetricCategorySchema,
  updateMetricCategorySchema,
  getMetricCategorySchema,
  getAllMetricCategoriesSchema,
  deleteMetricCategorySchema,
  generateDummyMetricCategoriesSchema,
} from "./schema.zod.js";
import { AuthRequest } from "@/types/request.context.js";
import { buildCursorCacheKey } from "@/shared/cache/keys.js";
import {
  METRIC_CATEGORY_CURSOR_FEATURE,
  METRIC_CATEGORY_CURSOR_VERSION,
} from "../../application/cache.constants.js";
import { methodNotAllowed } from "@/shared/middleware/method-guard.js";
import { requireJsonObjectBody } from "@/shared/middleware/require-json-object.js";

const getQueryString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const categoriesCacheKey = (req: AuthRequest) => {
  const limitParam = getQueryString(req.query.limit);
  const sortParam = getQueryString(req.query.sort);
  const qParam = getQueryString(req.query.q);
  const afterParam = getQueryString(req.query.after);
  const filterName = getQueryString(req.query["filter[name]"]);
  const includeTotal = getQueryString(req.query.includeTotal) ?? "false";

  return buildCursorCacheKey({
    feature: METRIC_CATEGORY_CURSOR_FEATURE,
    version: METRIC_CATEGORY_CURSOR_VERSION,
    userId: req.user?.id,
    organizationId: req.user?.organizationId,
    segments: [
      ["l", Number(limitParam ?? 20)],
      ["s", sortParam ?? "-createdAt"],
      ["q", qParam ?? ""],
      ["fn", filterName ?? ".js"],
      ["after", afterParam ?? ""],
      ["it", includeTotal],
    ],
  });
};

const categoryCacheKey = (req: AuthRequest) =>
  `category:${req.user?.organizationId}:${req.user?.id}:${req.params.id}`;

export const createMetricCategoryRouter = () => {
  const router = Router();
  router.use(authMiddleware);

  router.post(
    "/",
    userRateLimiter,
    requireJsonObjectBody(),
    validate(createMetricCategorySchema),
    createCategory,
  );

  router.get(
    "/",
    validate(getAllMetricCategoriesSchema),
    cacheMiddleware(categoriesCacheKey, 300),
    listCategories,
  );

  router.get(
    "/:id",
    validate(getMetricCategorySchema),
    cacheMiddleware(categoryCacheKey, 600),
    getCategory,
  );

  router.put(
    "/:id",
    userRateLimiter,
    requireJsonObjectBody(),
    validate(updateMetricCategorySchema),
    updateCategory,
  );

  router.delete(
    "/:id",
    userRateLimiter,
    validate(deleteMetricCategorySchema),
    deleteCategory,
  );

  if (env.ENABLE_DUMMY_ENDPOINTS) {
    router.post(
      "/dummy",
      userRateLimiter,
      requireJsonObjectBody(),
      validate(generateDummyMetricCategoriesSchema),
      generateDummyCategories,
    );
    router.all("/dummy", methodNotAllowed(["POST"]));
  }

  router.all("/", methodNotAllowed(["GET", "POST"]));
  router.all("/:id", methodNotAllowed(["GET", "PUT", "DELETE"]));

  return router;
};
