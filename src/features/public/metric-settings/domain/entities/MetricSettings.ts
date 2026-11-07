import { ValidationError } from "@/shared/domain/errors/DomainError.js";

export type DisplayOptionsProps = {
  showOnDashboard: boolean;
  priority: number | null;
  chartType: string | null;
  color: string | null;
};

export type MetricSettingsProps = {
  id: string;
  metricId: string;
  isActive: boolean;
  goalEnabled: boolean;
  goalType: "cumulative" | "incremental" | null;
  goalValue: number | null;
  timeFrameEnabled: boolean;
  startDate: Date | null;
  deadlineDate: Date | null;
  alertEnabled: boolean;
  alertThresholds: number | null;
  isAchieved: boolean;
  displayOptions: DisplayOptionsProps;
  createdAt: Date;
  updatedAt: Date;
};

export type UpdateMetricSettingsProps = Partial<
  Pick<
    MetricSettingsProps,
    | "goalEnabled"
    | "goalType"
    | "goalValue"
    | "timeFrameEnabled"
    | "startDate"
    | "deadlineDate"
    | "alertEnabled"
    | "alertThresholds"
    | "displayOptions"
    | "isActive"
  >
>;

export class MetricSettings {
  private constructor(private props: MetricSettingsProps) {}

  static fromPersistence(props: MetricSettingsProps) {
    return new MetricSettings({ ...props });
  }

  snapshot(): MetricSettingsProps {
    return { ...this.props, displayOptions: { ...this.props.displayOptions } };
  }

  get id() {
    return this.props.id;
  }

  get metricId() {
    return this.props.metricId;
  }

  get isAchieved() {
    return this.props.isAchieved;
  }

  touch() {
    this.props.updatedAt = new Date();
  }

  updateDetails(update: UpdateMetricSettingsProps) {
    if (update.displayOptions) {
      update.displayOptions.showOnDashboard = Boolean(
        update.displayOptions.showOnDashboard,
      );
    }

    if (update.goalEnabled === false) {
      update.goalType = null;
      update.goalValue = null;
    } else if (update.goalEnabled === true) {
      if (update.goalType == null || update.goalValue == null) {
        throw new ValidationError(
          "goalType and goalValue are required when goalEnabled is true",
        );
      }
    }

    if (update.timeFrameEnabled === false) {
      update.startDate = null;
      update.deadlineDate = null;
    } else if (update.timeFrameEnabled === true) {
      if (!update.startDate || !update.deadlineDate) {
        throw new ValidationError(
          "Valid startDate and deadlineDate required when timeFrameEnabled is true",
        );
      }
      if (update.deadlineDate <= update.startDate) {
        throw new ValidationError("deadlineDate must be after startDate");
      }
    }

    if (update.alertEnabled === false) {
      update.alertThresholds = null;
    } else if (update.alertEnabled === true && update.alertThresholds == null) {
      throw new ValidationError(
        "alertThresholds is required when alertEnabled is true",
      );
    }

    this.props = {
      ...this.props,
      ...update,
      displayOptions: {
        ...this.props.displayOptions,
        ...update.displayOptions,
      },
    };
    this.touch();
  }

  markAchieved() {
    this.props.isAchieved = true;
    this.touch();
  }

  updateDisplayOptions(display: DisplayOptionsProps) {
    this.props.displayOptions = {
      showOnDashboard: Boolean(display.showOnDashboard),
      priority: display.priority ?? null,
      chartType: display.chartType ?? null,
      color: display.color ?? null,
    };
    this.touch();
  }
}
