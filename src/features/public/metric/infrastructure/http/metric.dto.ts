import { z } from "zod";

// Internal validation schemas
import {
  createMetricSchema,
  updateMetricSchema,
  generateDummyMetricsSchema,
} from "./schema.zod.js";

// DTOs of the associations, through each feature's public surface
import type { MetricCategoryResponseDTO } from "@/features/metric-category/public.js";
import type { MetricSettingsResponseDTO } from "@/features/metric-settings/public.js";
import type { MetricLogResponseDTO } from "@/features/metric-log/public.js";

/**
 * @file src/features/public/metric/infrastructure/http/metric.dto.ts
 * @description Defines the Data Transfer Objects (DTOs) for Metric-related API contracts.
 * These interfaces and types are used for incoming and outgoing API requests and responses,
 * defining the structure of data exchanged between the client and server.
 */

/**
 * @interface MetricResponseDTO
 * @description Represents the structure of a Metric object as returned in basic API responses (e.g., after create/update).
 */
export interface MetricResponseDTO {
  /**
   * @property {string} id - The unique identifier for the metric (typically a UUID).
   * @readonly
   */
  readonly id: string;

  /**
   * @property {string} userId - The identifier of the user who owns this metric instance.
   * @readonly
   */
  readonly userId: string;

  /**
   * @property {string | null} categoryId - The identifier of the category this metric belongs to, if any. Null if uncategorized.
   * @readonly
   */
  readonly categoryId: string | null;

  /**
   * @property {string | null} originalMetricId - If this metric was created from a public template, this is the ID of the original template metric. Null otherwise.
   * @readonly
   */
  readonly originalMetricId: string | null;

  /**
   * @property {string} name - The user-defined name for the metric.
   * @readonly
   */
  readonly name: string;

  /**
   * @property {string | null} description - An optional description providing more details about the metric.
   * @readonly
   */
  readonly description: string | null;

  /**
   * @property {string} defaultUnit - The default unit of measurement for this metric (e.g., 'kg', 'steps', 'ml').
   * @readonly
   */
  readonly defaultUnit: string;

  /**
   * @property {boolean} isPublic - Flag indicating if this metric definition can be publicly discovered or used as a template.
   * @readonly
   */
  readonly isPublic: boolean;

  /**
   * @property {string} createdAt - The timestamp when the metric was created, formatted as an ISO string.
   * @readonly
   */
  readonly createdAt: string; // ISO Date string

  /**
   * @property {string} updatedAt - The timestamp when the metric was last updated, formatted as an ISO string.
   * @readonly
   */
  readonly updatedAt: string; // ISO Date string
}

/**
 * @interface MetricPreviewCategoryDTO
 * @description Represents summarized category information for a metric preview.
 */
interface MetricPreviewCategoryDTO {
  /**
   * @property {string} id - The unique identifier of the category.
   * @readonly
   */
  readonly id: string;
  /**
   * @property {string} name - The name of the category.
   * @readonly
   */
  readonly name: string;
  /**
   * @property {string} icon - The icon identifier of the category.
   * @readonly
   */
  readonly icon: string;
  /**
   * @property {string} color - The color code of the category.
   * @readonly
   */
  readonly color: string;
}

/**
 * @interface MetricPreviewResponseDTO
 * @description Represents a simplified view of a metric, typically for list displays or previews.
 */
export interface MetricPreviewResponseDTO {
  /**
   * @property {string} id - The unique identifier of the metric.
   * @readonly
   */
  readonly id: string;

  /**
   * @property {string} name - The name of the metric.
   * @readonly
   */
  readonly name: string;

  /**
   * @property {string} defaultUnit - The default unit of measurement for this metric (e.g., 'kg', 'steps', 'ml').
   * @readonly
   */
  readonly defaultUnit: string;

  /**
   * @property {string | null} description - An optional description providing more details about the metric.
   * @readonly
   */
  readonly description: string | null;

  /**
   * @property {isPublic} - Flag indicating if this metric definition can be publicly discovered or used as a template.
   * @readonly
   */
  readonly isPublic: boolean;

  /**
   * @property {MetricPreviewCategoryDTO} [category] - Optional summarized information about the metric's category.
   * @readonly
   */
  readonly category: MetricPreviewCategoryDTO | null;

  /**
   * @property {string} [goalType] - Optional goal type associated with the metric's settings (e.g., 'cumulative', 'incremental').
   * @readonly
   */
  readonly goalType: string | null;

  /**
   * @property {number} logCount - The number of logs associated with the metric.
   * @readonly
   * @example 10
   */
  readonly logCount: number;
}

/**
 * @typedef MetricListResponseDTO
 * @description Represents a list (array) of MetricPreviewResponseDTO objects, typically returned in API responses for lists of metrics.
 */
export type MetricListResponseDTO = MetricPreviewResponseDTO[];

// TODO: This should be a deprecated interface, as it is not used in the current API.
/**
 * @interface UserMetricDetailResponseDTO
 * @description Represents a detailed view of a metric, including associated category, settings, and logs.
 */
export interface UserMetricDetailResponseDTO {
  /**
   * @property {string} id - The unique identifier for the metric (typically a UUID).
   * @readonly
   */
  readonly id: string;

  /**
   * @property {string} userId - The identifier of the user who owns this metric instance.
   * @readonly
   */
  readonly userId: string;

  /**
   * @property {string | null} categoryId - The identifier of the category this metric belongs to, if any. Null if uncategorized.
   * @readonly
   */
  readonly categoryId: string | null;

  /**
   * @property {string | null} originalMetricId - If this metric was created from a public template, this is the ID of the original template metric. Null otherwise.
   * @readonly
   */
  readonly originalMetricId: string | null;

  /**
   * @property {string} name - The user-defined name for the metric.
   * @readonly
   */
  readonly name: string;

  /**
   * @property {string | null} description - An optional description providing more details about the metric.
   * @readonly
   */
  readonly description: string | null;

  /**
   * @property {string} defaultUnit - The default unit of measurement for this metric (e.g., 'kg', 'steps', 'ml').
   * @readonly
   */
  readonly defaultUnit: string;

  /**
   * @property {boolean} isPublic - Flag indicating if this metric definition can be publicly discovered or used as a template.
   * @readonly
   */
  readonly isPublic: boolean;

  /**
   * @property {string} createdAt - The timestamp when the metric was created, formatted as an ISO string.
   * @readonly
   */
  readonly createdAt: string; // ISO Date string

  /**
   * @property {string} updatedAt - The timestamp when the metric was last updated, formatted as an ISO string.
   * @readonly
   */
  readonly updatedAt: string; // ISO Date string

  /**
   * @property {MetricCategoryResponseDTO | null} [category] - The associated metric category DTO, if loaded. Null if uncategorized.
   * @readonly
   */
  readonly category: MetricCategoryResponseDTO | null;

  /**
   * @property {MetricSettingsResponseDTO | null} [settings] - The associated metric settings DTO, if loaded.
   * @readonly
   */
  readonly settings: MetricSettingsResponseDTO | null;

  /**
   * @property {MetricLogResponseDTO[] | null} [logs] - An array of associated metric log DTOs, if loaded.
   * @readonly
   */
  readonly logs: MetricLogResponseDTO[] | null;
}

/**
 * @typedef CreateMetricRequestDTO
 * @description Represents the expected structure of the request body when creating a new metric.
 * Inferred from the Zod schema for validation.
 */
export type CreateMetricRequestDTO = z.infer<
  typeof createMetricSchema.shape.body
>;

/**
 * @typedef UpdateMetricRequestDTO
 * @description Represents the expected structure of the request body when updating an existing metric.
 * Inferred from the Zod schema for validation.
 */
export type UpdateMetricRequestDTO = z.infer<
  typeof updateMetricSchema.shape.body
>;

/**
 * * ===== DTOs for Testing Purposes =====
 */

/**
 * @typedef GenerateDummyMetricsRequestDTO
 * @description Represents the expected structure of the request body when generating dummy metric entries.
 * Inferred from the Zod schema for validation.
 */
export type GenerateDummyMetricsRequestDTO = z.infer<
  typeof generateDummyMetricsSchema.shape.body
>;
