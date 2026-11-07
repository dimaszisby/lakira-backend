import { Response } from "express";
import type { MetricSettingsFeature } from "../../feature.js";
import catchAsync from "@/utils/catch-async.js";
import { successResponse } from "@/utils/response-formatter.js";
import { AuthRequest } from "@/types/request.context.js";
import { assertAuthenticated } from "@/utils/auth-guards.js";
import {
  toDisplayOptionsResponseDTO,
  toMetricSettingsResponseDTO,
} from "../persistence/mappers/MetricSettingsMapper.js";
import {
  createMetricSettingsSchema,
  deleteMetricSettingsSchema,
  getMetricSettingsSchema,
  listMetricSettingsViaCursorSchema,
  updateMetricSettingsSchema,
  updateDisplayOptionsSchema,
} from "./schema.zod.js";
import { pickValidated } from "@/shared/middleware/validated.js";

type Feature = MetricSettingsFeature;

const createMetricSettings = (feature: Feature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { body } = pickValidated(createMetricSettingsSchema)(req);
    const payload = body;
    const created = await feature.createSettings.execute({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      ...payload,
    });

    successResponse(
      res,
      201,
      toMetricSettingsResponseDTO(created.snapshot()),
      "Metric settings created successfully",
    );
  });

const getAllMetricSettingsViaCursor = (feature: Feature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { query } = pickValidated(listMetricSettingsViaCursorSchema)(req);
    const result = await feature.listSettings.execute({
      userId: req.user.id,
      organizationId: req.user.organizationId,
      ...query,
    });

    const dto = {
      items: result.items.map((item) =>
        toMetricSettingsResponseDTO(item.snapshot()),
      ),
      nextCursor: result.nextCursor ?? null,
      sort: result.sort,
      limit: result.limit,
      ...(result.q ? { q: result.q } : {}),
      ...(result.filter ? { filter: result.filter } : {}),
      ...(query.includeTotal ? { totalCount: result.totalCount ?? 0 } : {}),
    };

    successResponse(res, 200, dto, "Metric settings fetched successfully");
  });

const getMetricSettingsById = (feature: Feature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { params } = pickValidated(getMetricSettingsSchema)(req);
    const settings = await feature.getSettings.execute(
      req.user.id,
      req.user.organizationId,
      params.id,
    );
    successResponse(res, 200, toMetricSettingsResponseDTO(settings.snapshot()));
  });

const updateMetricSettings = (feature: Feature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { body, params } = pickValidated(updateMetricSettingsSchema)(req);
    const updated = await feature.updateSettings.execute(
      req.user.id,
      req.user.organizationId,
      params.id,
      body,
    );
    successResponse(
      res,
      200,
      toMetricSettingsResponseDTO(updated.snapshot()),
      "Metric settings updated successfully",
    );
  });

const deleteMetricSettings = (feature: Feature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { params } = pickValidated(deleteMetricSettingsSchema)(req);
    await feature.deleteSettings.execute(
      req.user.id,
      req.user.organizationId,
      params.id,
    );
    successResponse(res, 200, null, "Metric settings deleted successfully");
  });

const updateGoalAchievement = (feature: Feature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { params } = pickValidated(getMetricSettingsSchema)(req);
    const updated = await feature.updateGoalAchievement.execute(
      req.user.id,
      req.user.organizationId,
      params.id,
    );
    successResponse(
      res,
      200,
      toMetricSettingsResponseDTO(updated.snapshot()),
      "Goal marked as achieved",
    );
  });

const updateDisplayOptions = (feature: Feature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { body, params } = pickValidated(updateDisplayOptionsSchema)(req);
    const { displayOptions } = body;
    const updated = await feature.updateDisplayOptions.execute(
      req.user.id,
      req.user.organizationId,
      params.id,
      displayOptions,
    );
    successResponse(
      res,
      200,
      toDisplayOptionsResponseDTO(updated.snapshot().displayOptions),
      "Display options updated",
    );
  });

/** Every handler, closed over the feature the router hands it (ADR-0072). */
export const createMetricSettingsController = (feature: Feature) => ({
  createMetricSettings: createMetricSettings(feature),
  getAllMetricSettingsViaCursor: getAllMetricSettingsViaCursor(feature),
  getMetricSettingsById: getMetricSettingsById(feature),
  updateMetricSettings: updateMetricSettings(feature),
  deleteMetricSettings: deleteMetricSettings(feature),
  updateGoalAchievement: updateGoalAchievement(feature),
  updateDisplayOptions: updateDisplayOptions(feature),
});
