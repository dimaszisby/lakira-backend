/**
 * @file src/types/dtos/metric-category.dto.ts
 * @description Defines the Data Transfer Objects (DTOs) for MetricCategory.
 * These interfaces and types are used for incoming and outgoing API contracts,
 * defining the structure of data exchanged between the client and server.
 * DTOs are often immutable.
 */

/**
 * @interface MetricCategoryResponseDTO
 * @description Represents the structure of a MetricCategory object as returned in API responses.
 */
export interface MetricCategoryResponseDTO {
  /**
   * @property {string} id - The unique identifier for the metric category (typically a UUID).
   * @readonly
   */
  readonly id: string;

  /**
   * @property {string} name - The user-defined name for the metric category.
   * @readonly
   */
  readonly name: string;

  /**
   * @property {string} color - The color code associated with the category for UI display.
   * @readonly
   */
  readonly color: string;

  /**
   * @property {string} icon - The icon identifier associated with the category.
   * @readonly
   */
  readonly icon: string;

  /**
   * @property {string} userId - Owner identifier (needed by contract tests & OpenAPI schema).
   * @readonly
   */
  readonly userId: string;

  /**
   * @property {string} createdAt - The timestamp when the category was created, formatted as an ISO string.
   * @readonly
   */
  readonly createdAt: string;

  /**
   * @property {string} updatedAt - The timestamp when the category was last updated, formatted as an ISO string.
   * @readonly
   */
  readonly updatedAt: string;

  /**
   * @property {string | null} [deletedAt] - The timestamp when the category was soft-deleted, formatted as an ISO string. Null if active.
   * @readonly
   */
  readonly deletedAt?: string | null;

  // Dev note: Type Added recently
  /**
   * @property {number} metricCount - The number of metrics associated with the category.
   * @readonly
   * @example 10
   */
  readonly metricCount: number;
}
