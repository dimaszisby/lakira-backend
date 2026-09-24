import { Response } from "express";
import {
  createMetricSchema,
  deleteMetricSchema,
  generateDummyMetricsSchema,
  getAllMetricsViaCursorSchema,
  getMetricSchema,
  updateMetricSchema,
} from "./schema.zod.js";
import { buildMetricFeature } from "../../feature.js";
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
import { buildAnalyticsFeature } from "@/features/analytics/feature.js";
import { pickValidated } from "@/shared/middleware/validated.js";

type MetricFeature = ReturnType<typeof buildMetricFeature>;
// Built on first use, never at import (ADR-0045).
let metricFeature: MetricFeature | undefined;
const getMetricFeature = (): MetricFeature =>
  (metricFeature ??= buildMetricFeature());

export const overrideMetricFeatureForTest = (feature: MetricFeature) => {
  metricFeature = feature;
};

type AnalyticsFeature = ReturnType<typeof buildAnalyticsFeature>;
// Built on first use, never at import (ADR-0045).
let analyticsFeature: AnalyticsFeature | undefined;
const getAnalyticsFeature = (): AnalyticsFeature =>
  (analyticsFeature ??= buildAnalyticsFeature());

export const overrideMetricTrendFeatureForTest = (
  feature: AnalyticsFeature,
) => {
  analyticsFeature = feature;
};

export const createMetric = catchAsync(
  async (req: AuthRequest, res: Response) => {
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

    const metricDomain = await getMetricFeature().createMetric.execute({
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
  },
);

export const getUserMetricLibrariesViaCursor = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);

    const { query } = pickValidated(getAllMetricsViaCursorSchema)(req);
    const { limit, sort, q, after, includeTotal, filter } = query;

    const page = await getMetricFeature().listMetrics.execute({
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
  },
);

export const getUserDetailMetricById = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);

    const { params, query } = pickValidated(getMetricSchema)(req);
    const includeRaw = query.include ?? "flat";
    const allowed = new Set(["settings", "category", "logs"]);

    let includes: Array<"settings" | "category" | "logs"> = [];
    if (includeRaw === "full") {
      includes = ["settings", "category", "logs"];
    } else if (includeRaw !== "flat") {
      includes = includeRaw
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is "settings" | "category" | "logs" => allowed.has(s));
    }

    const logsLimit = query.logsLimit ?? 20;

    const metric = await getMetricFeature().getMetricDetail.execute({
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
      logger.error("Error mapping metric to DTO:", err, metric);
      throw new AppError("Internal Server Error: mapping failed", 500);
    }

    successResponse(
      res,
      200,
      dto,
      "Metric extended detail retrieved successfully",
    );
  },
);

export const updateMetric = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);

    const { body, params } = pickValidated(updateMetricSchema)(req);
    const updatedMetricDomain = await getMetricFeature().updateMetric.execute({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      metricId: params.id,
      data: body,
    });
    const dto = toMetricResponseDTO(updatedMetricDomain);

    successResponse(res, 200, dto, "Metric updated successfully");
  },
);

export const deleteMetric = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);

    const { params } = pickValidated(deleteMetricSchema)(req);
    const metricDomain = await getMetricFeature().deleteMetric.execute({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      metricId: params.id,
    });
    const dto = toMetricResponseDTO(metricDomain);

    successResponse(res, 200, dto, "Metric deleted successfully");
  },
);

export const generateDummyMetrics = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { body } = pickValidated(generateDummyMetricsSchema)(req);
    const { count } = body;

    const dummyMetrics = await getMetricFeature().generateDummyMetrics.execute({
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
  },
);

export const handleMetricTrend = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);

    const rawMetricId = req.params.metricId ?? req.params.id;
    const metricId = Array.isArray(rawMetricId) ? rawMetricId[0] : rawMetricId;
    if (!metricId) {
      throw new AppError("Metric id is required", 400);
    }

    const data = await getAnalyticsFeature().getMetricTrend.execute({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      metricId,
    });

    successResponse(res, 200, data);
  },
);
