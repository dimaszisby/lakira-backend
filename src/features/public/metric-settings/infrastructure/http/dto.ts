export interface DisplayOptionsDTO {
  readonly showOnDashboard: boolean | null;
  readonly priority: number | null;
  readonly chartType: string | null;
  readonly color: string | null;
}

export interface MetricSettingsResponseDTO {
  readonly id: string;
  readonly metricId: string;
  readonly isActive: boolean | null;
  readonly goalEnabled: boolean | null;
  readonly goalType: "cumulative" | "incremental" | null;
  readonly goalValue: number | null;
  readonly timeFrameEnabled: boolean | null;
  readonly startDate: string | null;
  readonly deadlineDate: string | null;
  readonly alertEnabled: boolean | null;
  readonly alertThresholds: number | null;
  readonly isAchieved: boolean | null;
  readonly displayOptions: DisplayOptionsDTO | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
