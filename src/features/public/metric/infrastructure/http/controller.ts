import { Response } from "express";
import {
  createMetricSchema,
  deleteMetricSchema,
  generateDummyMetricsSchema,
  getAllMetricsViaCursorSchema,
  getMetricSchema,
  updateMetricSchema,
} from "./schema.zod.js";
import type { MetricFeature } from "../../feature.js";
import { AuthRequest } from "@/types/request.context.js";
import logger from "@/utils/logger.js";
import {
  toMetricLibraryResponseDTO,
  toMetricResponseDTO,
  toUserMetricDetailResponseDTO,
} from "./dto.js";
import AppError from "@/utils/AppError.js";
import { successResponse } from "@/utils/response-formatter.js";
import catchAsync from "@/utils/catch-async.js";
import { assertAuthenticated } from "@/utils/auth-guards.js";
import type { MetricTrendPort } from "../../application/ports/MetricTrendPort.js";
import { pickValidated } from "@/shared/middleware/validated.js";
import { metricDetailIncludes } from "./detail-includes.js";

const createMetric = (feature: MetricFeature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);

    const { body } = pickValidated(createMetricSchema)(req);
    const {
      categoryId,
      originalMetricId,
      name,
      description,
      defaultUnit,
      isPublic,
    } = body;

    const metricDomain = await feature.createMetric.execute({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      categoryId,
      originalMetricId,
      name,
      description,
      defaultUnit,
      isPublic,
    });

    const dto = toMetricResponseDTO(metricDomain);
    successResponse(res, 201, dto, "Metric created successfully");
  });

const getUserMetricLibrariesViaCursor = (feature: MetricFeature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);

    const { query } = pickValidated(getAllMetricsViaCursorSchema)(req);
    const { limit, sort, q, after, includeTotal, filter } = query;

    const page = await feature.listMetrics.execute({
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
      items: page.items.map(toMetricLibraryResponseDTO),
      nextCursor: page.nextCursor ?? null,
      sort: page.sort,
      limit: page.limit,
      ...(page.q ? { q: page.q } : {}),
      ...(page.filter ? { filter: page.filter } : {}),
      ...(includeTotal ? { totalCount: page.totalCount ?? 0 } : {}),
    };

    successResponse(res, 200, dto, "Metrics cursor fetched successfully");
  });

const getUserDetailMetricById = (feature: MetricFeature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);

    const { params, query } = pickValidated(getMetricSchema)(req);
    // The same reading the cache key takes (api-tooling-residuals D-03).
    const includes = metricDetailIncludes(query.include);

    const logsLimit = query.logsLimit ?? 20;

    const metric = await feature.getMetricDetail.execute({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      metricId: params.id,
      includes,
      logsLimit,
    });
    if (!metric) {
      throw new AppError("Metric not found", 404);
    }

    let dto;
    try {
      dto = toUserMetricDetailResponseDTO(metric);
    } catch (err) {
      logger.error("Error mapping metric to DTO:", err, {
        metricId: params.id,
      });
      throw new AppError("Internal Server Error: mapping failed", 500);
    }

    successResponse(
      res,
      200,
      dto,
      "Metric extended detail retrieved successfully",
    );
  });

const updateMetric = (feature: MetricFeature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);

    const { body, params } = pickValidated(updateMetricSchema)(req);
    const updatedMetricDomain = await feature.updateMetric.execute({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      metricId: params.id,
      data: body,
    });
    const dto = toMetricResponseDTO(updatedMetricDomain);

    successResponse(res, 200, dto, "Metric updated successfully");
  });

const deleteMetric = (feature: MetricFeature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);

    const { params } = pickValidated(deleteMetricSchema)(req);
    const metricDomain = await feature.deleteMetric.execute({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      metricId: params.id,
    });
    const dto = toMetricResponseDTO(metricDomain);

    successResponse(res, 200, dto, "Metric deleted successfully");
  });

const generateDummyMetrics = (feature: MetricFeature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { body } = pickValidated(generateDummyMetricsSchema)(req);
    const { count } = body;

    const dummyMetrics = await feature.generateDummyMetrics.execute({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      count,
    });
    const dto = dummyMetrics.map(toMetricResponseDTO);

    successResponse(
      res,
      201,
      dto,
      `${count} dummy metrics generated successfully`,
    );
  });

const handleMetricTrend = (metricTrend: MetricTrendPort) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);

    const rawMetricId = req.params.metricId ?? req.params.id;
    const metricId = Array.isArray(rawMetricId) ? rawMetricId[0] : rawMetricId;
    if (!metricId) {
      throw new AppError("Metric id is required", 400);
    }

    const data = await metricTrend.execute({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      metricId,
    });

    successResponse(res, 200, data);
  });

/**
 * Every handler, closed over what the router hands it (ADR-0072). The trends
 * endpoint gets analytics' query, not its feature (D-04), through metric's own
 * port (architecture-boundaries D-01).
 */
export const createMetricController = ({
  metric,
  metricTrend,
}: {
  metric: MetricFeature;
  metricTrend: MetricTrendPort;
}) => ({
  createMetric: createMetric(metric),
  getUserMetricLibrariesViaCursor: getUserMetricLibrariesViaCursor(metric),
  getUserDetailMetricById: getUserDetailMetricById(metric),
  updateMetric: updateMetric(metric),
  deleteMetric: deleteMetric(metric),
  generateDummyMetrics: generateDummyMetrics(metric),
  handleMetricTrend: handleMetricTrend(metricTrend),
});
