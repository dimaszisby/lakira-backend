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
import { methodNotAllowed } from "@/shared/middleware/method-guard.js";
import { requireJsonObjectBody } from "@/shared/middleware/require-json-object.js";

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
    // No cacheMiddleware: ListCategories caches this page itself under a key
    // built from the normalized filter. A second, router-level layer keyed on
    // raw req.query ignored the filter (kit list-cache-key-filters, D-02).
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
