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
import type { MetricCategoryFeature } from "../../feature.js";
import { generateDummyMetricCategoriesSchema } from "./schema.zod.js";
import { pickValidated } from "@/shared/middleware/validated.js";

type Feature = MetricCategoryFeature;
const createCategory = (feature: Feature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { body } = pickValidated(createMetricCategorySchema)(req);
    const payload = body;
    const category = await feature.createCategory.execute({
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
  });

const listCategories = (feature: Feature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { query } = pickValidated(getAllMetricCategoriesSchema)(req);
    const { limit, sort, q, after, includeTotal, filterName } = query;
    const filter = filterName ? { name: filterName } : undefined;

    const page = await feature.listCategories.execute({
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
  });

const getCategory = (feature: Feature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { params } = pickValidated(getMetricCategorySchema)(req);
    const category = await feature.getCategory.execute(
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
  });

const updateCategory = (feature: Feature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { body, params } = pickValidated(updateMetricCategorySchema)(req);
    const category = await feature.updateCategory.execute({
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
  });

const deleteCategory = (feature: Feature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { params } = pickValidated(deleteMetricCategorySchema)(req);
    await feature.deleteCategory.execute(
      req.user.id,
      req.user.organizationId,
      params.id,
    );
    successResponse(res, 200, null, "Category deleted successfully");
  });

const generateDummyCategories = (feature: Feature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { body } = pickValidated(generateDummyMetricCategoriesSchema)(req);
    const created = await feature.generateDummyCategories.execute({
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
  });

/** Every handler, closed over the feature the router hands it (ADR-0072). */
export const createMetricCategoryController = (feature: Feature) => ({
  createCategory: createCategory(feature),
  listCategories: listCategories(feature),
  getCategory: getCategory(feature),
  updateCategory: updateCategory(feature),
  deleteCategory: deleteCategory(feature),
  generateDummyCategories: generateDummyCategories(feature),
});
