import {
  MetricLibraryDomain,
  MetricDomainExtended,
} from "../../domain/metric.domain.js";

export type SortField = "createdAt" | "updatedAt" | "name" | "logCount";
export type SortParam = SortField | `-${SortField}`;
export type Dir = "ASC" | "DESC";

export interface ListMetricsResult {
  items: MetricLibraryDomain[];
  nextCursor?: string;
  sort: SortParam;
  limit: number;
  q?: string;
  filter?: { name?: string; categoryId?: string };
  totalCount?: number;
}

export interface ListOpts {
  userId: string;
  organizationId: string;
  limit: number;
  sort: SortParam;
  q?: string;
  filter?: { name?: string; categoryId?: string };
  after?: string;
  includeTotal?: boolean;
}

export type IncludeKey = "settings" | "category" | "logs";

export interface MetricDetailQuery {
  userId: string;
  organizationId: string;
  metricId: string;
  includes?: IncludeKey[];
  logsLimit?: number;
}

export interface MetricReadRepository {
  listMetrics(opts: ListOpts): Promise<ListMetricsResult>;
  findDetailedMetric(
    params: MetricDetailQuery,
  ): Promise<MetricDomainExtended | null>;
}
