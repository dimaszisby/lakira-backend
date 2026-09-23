import {
  MetricDomain,
  MetricDomainExtended,
  MetricLibraryDomain,
} from "@/types/domain/metric.domain.js";
import {
  MetricPreviewResponseDTO,
  MetricResponseDTO,
  UserMetricDetailResponseDTO,
} from "@/types/dtos/metric.dto.js";
import { toMetricCategoryResponseDTO } from "@/features/metric-category/public.js";
import { toMetricSettingsResponseDTO } from "@/features/metric-settings/public.js";
import { toMetricLogResponseDTO } from "@/features/metric-log/public.js";

export const toMetricResponseDTO = (
  metric: MetricDomain,
): MetricResponseDTO => ({
  id: metric.id,
  userId: metric.userId,
  categoryId: metric.categoryId,
  originalMetricId: metric.originalMetricId,
  name: metric.name,
  description: metric.description,
  defaultUnit: metric.defaultUnit,
  isPublic: metric.isPublic,
  createdAt: metric.createdAt.toISOString(),
  updatedAt: metric.updatedAt.toISOString(),
});

export const toUserMetricDetailResponseDTO = (
  metric: MetricDomainExtended,
): UserMetricDetailResponseDTO => ({
  id: metric.id,
  userId: metric.userId,
  categoryId: metric.categoryId,
  originalMetricId: metric.originalMetricId,
  name: metric.name,
  description: metric.description,
  defaultUnit: metric.defaultUnit,
  isPublic: metric.isPublic,
  createdAt: metric.createdAt.toISOString(),
  updatedAt: metric.updatedAt.toISOString(),
  category: metric.category
    ? toMetricCategoryResponseDTO(metric.category)
    : null,
  settings: metric.settings
    ? toMetricSettingsResponseDTO(metric.settings)
    : null,
  logs: metric.logs ? metric.logs?.map(toMetricLogResponseDTO) : null,
});

export const toMetricLibraryResponseDTO = (
  metric: MetricLibraryDomain,
): MetricPreviewResponseDTO => ({
  id: metric.id,
  name: metric.name,
  category: metric.category,
  goalType: metric.goalType,
  defaultUnit: metric.defaultUnit,
  description: metric.description,
  isPublic: metric.isPublic,
  logCount: metric.logCount,
});
