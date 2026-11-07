import { ForbiddenError } from "@/shared/domain/errors/DomainError.js";
import type {
  MetricLogQueryPort,
  ListLogsResult,
  ListOpts,
  SortField,
  SortParam,
} from "../ports/MetricLogQueryPort.js";

export class ListMetricLogs {
  constructor(private repo: MetricLogQueryPort) {}

  async execute(options: ListOpts): Promise<ListLogsResult> {
    if (!options.userId) throw new ForbiddenError("User not authenticated");
    return this.repo.listLogs(options);
  }
}

export type {
  MetricLogQueryPort,
  ListLogsResult,
  ListOpts,
  SortField,
  SortParam,
};
