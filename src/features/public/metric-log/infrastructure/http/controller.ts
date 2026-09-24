import { Response } from "express";
import AppError from "@/utils/AppError.js";
import { successResponse } from "@/utils/response-formatter.js";
import catchAsync from "@/utils/catch-async.js";
import { AuthRequest } from "@/types/request.context.js";
import { toMetricLogListResponseDTO, toMetricLogResponseDTO } from "./dto.js";
import {
  createMetricLogSchema,
  deleteMetricLogSchema,
  generateDummyMetricLogsSchema,
  getAggregatedStatsSchema,
  getMetricLogByIdSchema,
  listMetricLogsViaCursorSchema,
  updateMetricLogSchema,
} from "./schema.zod.js";
import { assertAuthenticated } from "@/utils/auth-guards.js";
import logger from "@/utils/logger.js";
import { buildMetricLogFeature } from "../../feature.js";
import { pickValidated } from "@/shared/middleware/validated.js";

type MetricLogFeature = ReturnType<typeof buildMetricLogFeature>;
// Built on first use, never at import (ADR-0045).
let metricLogFeature: MetricLogFeature | undefined;
const getMetricLogFeature = (): MetricLogFeature =>
  (metricLogFeature ??= buildMetricLogFeature());

export const overrideMetricLogFeatureForTest = (feature: MetricLogFeature) => {
  metricLogFeature = feature;
};

export const createMetricLog = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);

    const { body } = pickValidated(createMetricLogSchema)(req);
    const { metricId, type, logValue, loggedAt } = body;

    const logDomain = await getMetricLogFeature().createLog.execute({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      metricId,
      type,
      logValue,
      loggedAt,
    });
    const dto = toMetricLogResponseDTO(logDomain);

    successResponse(res, 201, dto, "Metric Log created successfully");
  },
);

export const getUserLogLibrariesViaCursor = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);

    const { query } = pickValidated(listMetricLogsViaCursorSchema)(req);
    const { limit, sort, q, after, includeTotal, filter } = query;

    const page = await getMetricLogFeature().listLogs.execute({
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
      items: toMetricLogListResponseDTO(page.items),
      nextCursor: page.nextCursor ?? null,
      sort: page.sort,
      limit: page.limit,
      ...(page.q ? { q: page.q } : {}),
      ...(page.filter ? { filter: page.filter } : {}),
      ...(includeTotal ? { totalCount: page.totalCount ?? 0 } : {}),
    };

    successResponse(res, 200, dto, "Metric Logs cursor fetched successfully");
  },
);

export const getLogById = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);

    const { params, query } = pickValidated(getMetricLogByIdSchema)(req);
    const { metricId } = query;

    const logDomain = await getMetricLogFeature().getLog.execute({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      logId: params.id,
    });

    if (logDomain.metricId !== metricId) {
      throw new AppError("Log not found for the specified metric", 404);
    }

    successResponse(res, 200, toMetricLogResponseDTO(logDomain));
  },
);

export const updateLog = catchAsync(async (req: AuthRequest, res: Response) => {
  assertAuthenticated(req);

  const { body, params } = pickValidated(updateMetricLogSchema)(req);
  const { logValue, type, loggedAt } = body;

  const logDomain = await getMetricLogFeature().updateLog.execute({
    userId: req.user.id,
    organizationId: req.user.organizationId,
    logId: params.id,
    updates: { logValue, type, loggedAt },
  });

  successResponse(
    res,
    200,
    toMetricLogResponseDTO(logDomain),
    "Log updated successfully",
  );
});

export const deleteLog = catchAsync(async (req: AuthRequest, res: Response) => {
  assertAuthenticated(req);

  const { params } = pickValidated(deleteMetricLogSchema)(req);
  const logDomain = await getMetricLogFeature().deleteLog.execute({
    userId: req.user.id,
    organizationId: req.user.organizationId,
    logId: params.id,
  });

  successResponse(
    res,
    200,
    toMetricLogResponseDTO(logDomain),
    "Log deleted successfully",
  );
});

export const getAggregatedStats = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { query } = pickValidated(getAggregatedStatsSchema)(req);
    const stats = await getMetricLogFeature().getStats.execute({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      metricId: query.metricId,
    });
    successResponse(res, 200, stats);
  },
);

export const generateDummyMetricLogs = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);

    const { body, params } = pickValidated(generateDummyMetricLogsSchema)(req);
    const { metricId } = params;
    const { count } = body;

    logger.info("Generating dummy logs", {
      metricId,
      count,
      userId: req.user.id,
    });

    const result = await getMetricLogFeature().generateDummyLogs.execute({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      metricId,
      count,
    });

    successResponse(
      res,
      202,
      { jobId: result.jobId },
      `${count} dummy metric log generation accepted`,
    );
  },
);
