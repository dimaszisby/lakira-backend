import { Response } from "express";
import catchAsync from "@/utils/catch-async.js";
import { successResponse } from "@/utils/response-formatter.js";
import { AuthRequest } from "@/types/request.context.js";
import { assertAuthenticated } from "@/utils/auth-guards.js";
import {
  toResponseDTO,
  toListResponseDTO,
} from "../mappers/MetricCategoryMapper.js";
import {
  createMetricCategorySchema,
  deleteMetricCategorySchema,
  getAllMetricCategoriesSchema,
  getMetricCategorySchema,
  updateMetricCategorySchema,
} from "./schema.zod.js";
import { buildMetricCategoryFeature } from "../../feature.js";
import { generateDummyMetricCategoriesSchema } from "./schema.zod.js";
import { pickValidated } from "@/shared/middleware/validated.js";

type Feature = ReturnType<typeof buildMetricCategoryFeature>;
// Built on first use, never at import (ADR-0045).
let feature: Feature | undefined;
const getFeature = (): Feature => (feature ??= buildMetricCategoryFeature());

export const overrideMetricCategoryFeatureForTest = (custom: Feature) => {
  feature = custom;
};

export const createCategory = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { body } = pickValidated(createMetricCategorySchema)(req);
    const payload = body;
    const category = await getFeature().createCategory.execute({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      name: payload.name,
      color: payload.color,
      icon: payload.icon,
    });

    successResponse(
      res,
      201,
      toResponseDTO(category),
      "Category created successfully",
    );
  },
);

export const listCategories = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { query } = pickValidated(getAllMetricCategoriesSchema)(req);
    const { limit, sort, q, after, includeTotal, filterName } = query;
    const filter = filterName ? { name: filterName } : undefined;

    const page = await getFeature().listCategories.execute({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      limit,
      sort,
      q,
      filter,
      after,
      includeTotal,
    });

    const dto = {
      items: toListResponseDTO(page.items),
      nextCursor: page.nextCursor ?? null,
      sort: page.sort,
      limit: page.limit,
      ...(page.q ? { q: page.q } : {}),
      ...(page.filter ? { filter: page.filter } : {}),
      ...(includeTotal ? { totalCount: page.totalCount ?? 0 } : {}),
    };

    successResponse(res, 200, dto, "Categories list retrieved successfully");
  },
);

export const getCategory = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { params } = pickValidated(getMetricCategorySchema)(req);
    const category = await getFeature().getCategory.execute(
      req.user.id,
      req.user.organizationId,
      params.id,
    );
    successResponse(
      res,
      200,
      toResponseDTO(category),
      "Category retrieved successfully",
    );
  },
);

export const updateCategory = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { body, params } = pickValidated(updateMetricCategorySchema)(req);
    const category = await getFeature().updateCategory.execute({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      categoryId: params.id,
      name: body.name,
      color: body.color,
      icon: body.icon,
    });

    successResponse(
      res,
      200,
      toResponseDTO(category),
      "Category updated successfully",
    );
  },
);

export const deleteCategory = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { params } = pickValidated(deleteMetricCategorySchema)(req);
    await getFeature().deleteCategory.execute(
      req.user.id,
      req.user.organizationId,
      params.id,
    );
    successResponse(res, 200, null, "Category deleted successfully");
  },
);

export const generateDummyCategories = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { body } = pickValidated(generateDummyMetricCategoriesSchema)(req);
    const created = await getFeature().generateDummyCategories.execute({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      count: body.count,
    });

    successResponse(
      res,
      201,
      toListResponseDTO(created),
      `${body.count} dummy metric categories generated successfully`,
    );
  },
);
