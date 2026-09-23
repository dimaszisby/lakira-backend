import { randomUUID } from "node:crypto";
import { MetricDomain } from "@/types/domain/metric.domain.js";
import { ValidationError } from "@/shared/domain/errors/DomainError.js";
import { ZodMessages } from "@/constants/zod/zod-messages.js";
import {
  METRIC_DESCRIPTION_RULE,
  METRIC_NAME_RULE,
  METRIC_UNIT_RULE,
} from "@/shared/constants/metric-constraints.js";
import {
  getUnicodeLength,
  hasInvalidControlChars,
  hasUnpairedSurrogates,
} from "@/shared/utils/text-validation.js";

export type MetricProps = {
  id: string;
  userId: string;
  name: string;
  defaultUnit: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  categoryId?: string | null;
  originalMetricId?: string | null;
  description?: string | null;
  deletedAt?: Date | null;
};

const hasInvalidMetricChars = (value: string, allowNewlines = false) =>
  hasInvalidControlChars(value, allowNewlines) || hasUnpairedSurrogates(value);

export class Metric implements MetricDomain {
  private constructor(private props: MetricProps) {}

  static fromProps(props: MetricProps) {
    return new Metric(props);
  }

  static createDraft(
    props: Omit<MetricProps, "id" | "createdAt" | "updatedAt">,
  ) {
    const now = new Date();
    return new Metric({
      ...props,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
  }

  rename(next: string) {
    const value = next.trim();
    const length = getUnicodeLength(value);
    if (length < METRIC_NAME_RULE.min) {
      throw new ValidationError(ZodMessages.metric.nameRequired);
    }
    if (length > METRIC_NAME_RULE.max) {
      throw new ValidationError(ZodMessages.metric.nameTooLong);
    }
    if (hasInvalidMetricChars(value)) {
      throw new ValidationError(ZodMessages.metric.invalidCharacters);
    }
    this.props.name = value;
    this.touch();
  }

  describe(next: string | null) {
    if (next !== null) {
      if (getUnicodeLength(next) > METRIC_DESCRIPTION_RULE.max) {
        throw new ValidationError(ZodMessages.metric.descriptionTooLong);
      }
      if (hasInvalidMetricChars(next, true)) {
        throw new ValidationError(ZodMessages.metric.invalidCharacters);
      }
    }
    this.props.description = next ?? null;
    this.touch();
  }

  setDefaultUnit(unit: string) {
    const normalized = unit.trim();
    const length = getUnicodeLength(normalized);
    if (length < METRIC_UNIT_RULE.min) {
      throw new ValidationError(ZodMessages.metric.unitRequired);
    }
    if (length > METRIC_UNIT_RULE.max) {
      throw new ValidationError(ZodMessages.metric.unitTooLong);
    }
    if (hasInvalidMetricChars(normalized)) {
      throw new ValidationError(ZodMessages.metric.invalidCharacters);
    }
    this.props.defaultUnit = normalized;
    this.touch();
  }

  moveToCategory(categoryId: string | null) {
    this.props.categoryId = categoryId;
    this.touch();
  }

  setOriginalMetric(metricId: string | null) {
    this.props.originalMetricId = metricId;
    this.touch();
  }

  togglePublic(value: boolean) {
    this.props.isPublic = value;
    this.touch();
  }

  softDelete() {
    this.props.deletedAt = new Date();
  }

  update(
    data: Partial<{
      name: string;
      description: string | null;
      defaultUnit: string;
      categoryId: string | null;
      originalMetricId: string | null;
      isPublic: boolean;
    }>,
  ) {
    if (data.name !== undefined) this.rename(data.name);
    if (data.description !== undefined) this.describe(data.description);
    if (data.defaultUnit !== undefined) this.setDefaultUnit(data.defaultUnit);
    if (data.categoryId !== undefined) this.moveToCategory(data.categoryId);
    if (data.originalMetricId !== undefined)
      this.setOriginalMetric(data.originalMetricId);
    if (data.isPublic !== undefined) this.togglePublic(data.isPublic);
  }

  snapshot() {
    return { ...this.props };
  }

  get id() {
    return this.props.id;
  }
  get userId() {
    return this.props.userId;
  }
  get name() {
    return this.props.name;
  }
  get description() {
    return this.props.description ?? null;
  }
  get defaultUnit() {
    return this.props.defaultUnit;
  }
  get isPublic() {
    return this.props.isPublic;
  }
  get categoryId() {
    return this.props.categoryId ?? null;
  }
  get originalMetricId() {
    return this.props.originalMetricId ?? null;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }
  get deletedAt() {
    return this.props.deletedAt ?? null;
  }

  private touch() {
    this.props.updatedAt = new Date();
  }
}
