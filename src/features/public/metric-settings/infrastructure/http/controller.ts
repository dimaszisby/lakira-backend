import { Response } from "express";
import { buildMetricSettingsFeature } from "../../feature.js";
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

type Feature = ReturnType<typeof buildMetricSettingsFeature>;
// Built on first use, never at import (ADR-0045).
let feature: Feature | undefined;
const getFeature = (): Feature => (feature ??= buildMetricSettingsFeature());

export const overrideMetricSettingsFeatureForTest = (custom: Feature) => {
  feature = custom;
};

export const createMetricSettings = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { body } = pickValidated(createMetricSettingsSchema)(req);
    const payload = body;
    const created = await getFeature().createSettings.execute({
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
  },
);

export const getAllMetricSettingsViaCursor = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { query } = pickValidated(listMetricSettingsViaCursorSchema)(req);
    const result = await getFeature().listSettings.execute({
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
  },
);

export const getMetricSettingsById = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { params } = pickValidated(getMetricSettingsSchema)(req);
    const settings = await getFeature().getSettings.execute(
      req.user.id,
      req.user.organizationId,
      params.id,
    );
    successResponse(res, 200, toMetricSettingsResponseDTO(settings.snapshot()));
  },
);

export const updateMetricSettings = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { body, params } = pickValidated(updateMetricSettingsSchema)(req);
    const updated = await getFeature().updateSettings.execute(
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
  },
);

export const deleteMetricSettings = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { params } = pickValidated(deleteMetricSettingsSchema)(req);
    await getFeature().deleteSettings.execute(
      req.user.id,
      req.user.organizationId,
      params.id,
    );
    successResponse(res, 200, null, "Metric settings deleted successfully");
  },
);

export const updateGoalAchievement = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { params } = pickValidated(getMetricSettingsSchema)(req);
    const updated = await getFeature().updateGoalAchievement.execute(
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
  },
);

export const updateDisplayOptions = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { body, params } = pickValidated(updateDisplayOptionsSchema)(req);
    const { displayOptions } = body;
    const updated = await getFeature().updateDisplayOptions.execute(
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
  },
);
