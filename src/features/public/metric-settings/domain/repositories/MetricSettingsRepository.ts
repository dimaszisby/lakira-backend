import {
  MetricSettings,
  type DisplayOptionsProps,
} from "../entities/MetricSettings.js";

export type CreateMetricSettingsDTO = {
  metricId: string;
  organizationId: string;
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
};

export interface MetricSettingsRepository {
  create(data: CreateMetricSettingsDTO): Promise<MetricSettings>;
  findByMetricId(
    organizationId: string,
    metricId: string,
  ): Promise<MetricSettings | null>;
  findById(
    userId: string,
    organizationId: string,
    settingsId: string,
  ): Promise<MetricSettings | null>;
  save(
    organizationId: string,
    settings: MetricSettings,
  ): Promise<MetricSettings>;
  delete(organizationId: string, settings: MetricSettings): Promise<void>;
  listByCursor(
    opts: ListMetricSettingsOptions,
  ): Promise<ListMetricSettingsResult>;
}

export type SortField = "createdAt" | "updatedAt" | "isActive";
export type SortParam = SortField | `-${SortField}`;

export type ListMetricSettingsOptions = {
  userId: string;
  organizationId: string;
  limit: number;
  sort: SortParam;
  q?: string;
  filter?: { metricId?: string; isActive?: boolean };
  after?: string;
  includeTotal?: boolean;
};

export type ListMetricSettingsResult = {
  items: MetricSettings[];
  nextCursor?: string;
  sort: SortParam;
  limit: number;
  q?: string;
  filter?: { metricId?: string; isActive?: boolean };
  totalCount?: number;
};
