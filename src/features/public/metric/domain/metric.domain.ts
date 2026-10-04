/**
 * @file src/types/domain/metric.domain.ts
 * @description Defines the domain model interfaces related to Metrics.
 * These represent metrics, library views of metrics, and extended metric details
 * within the core business logic, decoupled from database or API specifics.
 * Domain models are often immutable.
 */

import type { MetricCategory } from "@/features/metric-category/public.js";
import { MetricLogDomain } from "@/types/domain/metric-log.domain.js";
import { MetricSettingsDomain } from "@/types/domain/metric-settings.domain.js";

/**
 * @interface MetricDomain
 * @description Represents a core metric entity within the application's domain logic.
 * Contains essential metric information retrieved from the persistence layer.
 */
export interface MetricDomain {
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
   * @property {string | null} [categoryId] - The identifier of the category this metric belongs to, if any.
   * @readonly
   */
  readonly categoryId: string | null;

  /**
   * @property {string | null} [originalMetricId] - If this metric was created from a public template, this is the ID of the original template metric. Null otherwise.
   * @readonly
   */
  readonly originalMetricId: string | null;

  /**
   * @property {string} name - The user-defined name for the metric.
   * @readonly
   */
  readonly name: string;

  /**
   * @property {string | null} [description] - An optional description providing more details about the metric.
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
   * @property {Date | null} [deletedAt] - The timestamp when the metric was soft-deleted. Null if active.
   * @readonly
   */
  readonly deletedAt?: Date | null;

  /**
   * @property {Date} createdAt - The timestamp when the metric was created.
   * @readonly
   */
  readonly createdAt: Date;

  /**
   * @property {Date} updatedAt - The timestamp when the metric was last updated.
   * @readonly
   */
  readonly updatedAt: Date;
}

/**
 * @interface MetricLibraryCategoryInfo
 * @description Represents summarized category information used within the metric library view.
 */
export interface MetricLibraryCategoryInfoDomain {
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
 * @interface MetricLibraryDomain
 * @description Represents a simplified view of a metric, typically for display in a public library or template list.
 */
export interface MetricLibraryDomain {
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
   * @property {string | null} [description] - An optional description providing more details about the metric.
   * @readonly
   */
  readonly description: string | null;

  /**
   * @property {isPublic} - Flag indicating if this metric definition can be publicly discovered or used as a template.
   * @readonly
   */
  readonly isPublic: boolean;

  /**
   * @property {MetricLibraryCategoryInfo} [category] - Optional summarized information about the metric's category.
   * @readonly
   */
  readonly category: MetricLibraryCategoryInfoDomain | null;

  /**
   * @property {string} [goalType] - Optional goal type associated with the metric's settings (e.g., 'cumulative', 'incremental').
   * @readonly
   */
  readonly goalType: string; // Consider using the specific ENUM type if available/stable

  /**
   * @property {Date} createdAt - The timestamp when the metric was created.
   * @readonly
   */
  readonly createdAt: Date;

  /**
   * @property {Date} updatedAt - The timestamp when the metric was last updated.
   * @readonly
   */
  readonly updatedAt: Date;

  /**
   * @property {number} logCount - The number of logs associated with the metric.
   * @readonly
   * @example 10
   */
  readonly logCount: number;
}

/**
 * @type MetricLibraryListDomain
 * @description Represents a list (array) of metrics formatted for the library view.
 */
export type MetricLibraryListDomain = MetricLibraryDomain[];

/**
 * @interface MetricDomainExtended
 * @description Extends the core MetricDomain with potentially loaded relational data (category, settings, logs).
 * Useful for scenarios where related entities are needed alongside the metric itself.
 */
export interface MetricDomainExtended extends MetricDomain {
  /**
   * @property {MetricCategory} [category] - The associated metric category domain object, if loaded.
   * @readonly
   */
  readonly category?: MetricCategory | null;

  /**
   * @property {MetricSettingsDomain} [settings] - The associated metric settings domain object, if loaded.
   * @readonly
   */
  readonly settings?: MetricSettingsDomain | null;

  /**
   * @property {MetricLogDomain[]} [logs] - An array of associated metric log domain objects, if loaded.
   * @readonly
   */
  readonly logs?: MetricLogDomain[] | null;
}
