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
import type { MetricLogFeature } from "../../feature.js";
import { pickValidated } from "@/shared/middleware/validated.js";

const createMetricLog = (feature: MetricLogFeature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);

    const { body } = pickValidated(createMetricLogSchema)(req);
    const { metricId, type, logValue, loggedAt } = body;

    const logDomain = await feature.createLog.execute({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      metricId,
      type,
      logValue,
      loggedAt,
    });
    const dto = toMetricLogResponseDTO(logDomain);

    successResponse(res, 201, dto, "Metric Log created successfully");
  });

const getUserLogLibrariesViaCursor = (feature: MetricLogFeature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);

    const { query } = pickValidated(listMetricLogsViaCursorSchema)(req);
    const { limit, sort, q, after, includeTotal, filter } = query;

    const page = await feature.listLogs.execute({
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
  });

const getLogById = (feature: MetricLogFeature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);

    const { params, query } = pickValidated(getMetricLogByIdSchema)(req);
    const { metricId } = query;

    const logDomain = await feature.getLog.execute({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      logId: params.id,
    });

    if (logDomain.metricId !== metricId) {
      throw new AppError("Log not found for the specified metric", 404);
    }

    successResponse(res, 200, toMetricLogResponseDTO(logDomain));
  });

const updateLog = (feature: MetricLogFeature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);

    const { body, params } = pickValidated(updateMetricLogSchema)(req);
    const { logValue, type, loggedAt } = body;

    const logDomain = await feature.updateLog.execute({
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

const deleteLog = (feature: MetricLogFeature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);

    const { params } = pickValidated(deleteMetricLogSchema)(req);
    const logDomain = await feature.deleteLog.execute({
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

const getAggregatedStats = (feature: MetricLogFeature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { query } = pickValidated(getAggregatedStatsSchema)(req);
    const stats = await feature.getStats.execute({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      metricId: query.metricId,
      from: query.startDate ? new Date(query.startDate) : undefined,
      to: query.endDate ? new Date(query.endDate) : undefined,
    });
    successResponse(res, 200, stats);
  });

const generateDummyMetricLogs = (feature: MetricLogFeature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);

    const { body, params } = pickValidated(generateDummyMetricLogsSchema)(req);
    const { metricId } = params;
    const { count } = body;

    logger.info("Generating dummy logs", {
      metricId,
      count,
      userId: req.user.id,
    });

    const result = await feature.generateDummyLogs.execute({
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
  });

/** Every handler, closed over the feature the router hands it (ADR-0072). */
export const createMetricLogController = (feature: MetricLogFeature) => ({
  createMetricLog: createMetricLog(feature),
  getUserLogLibrariesViaCursor: getUserLogLibrariesViaCursor(feature),
  getLogById: getLogById(feature),
  updateLog: updateLog(feature),
  deleteLog: deleteLog(feature),
  getAggregatedStats: getAggregatedStats(feature),
  generateDummyMetricLogs: generateDummyMetricLogs(feature),
});
