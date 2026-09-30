import { QueryTypes } from "sequelize";
import { sequelize } from "@/infrastructure/db/models.js";
import { models } from "@/infrastructure/db/models.js";
import AppError from "@/utils/AppError.js";
import { env } from "@/config/envManager.js";
import {
  buildDashboardLifecycleSQL,
  buildDashboardSQL,
} from "../sql/visualization.dashboard.sql.js";
import { buildVisualizationSQL } from "../sql/visualization.sql.js";
import {
  computeFallbackRange,
  type RangeDescriptor,
} from "../../domain/fallback-range.js";
import type {
  VisualizationReadRepository,
  VisualizationQueryParams,
  DashboardVisualizationParams,
  DashboardVizResponse,
  DashboardVizItem,
} from "../../application/ports/VisualizationReadRepository.js";
import type {
  VisualizationCachePort,
  SingleVizCacheKey,
  DashboardVizCacheKey,
} from "../../application/ports/VisualizationCachePort.js";
import type { VizResponse } from "../../domain/types.js";
import { createHash } from "node:crypto";

type VizRow = {
  bucket_start: string;
  avg_value: number | null;
  min_value: number | null;
  max_value: number | null;
  cnt: number | null;
};

type DashboardSeriesRow = {
  metric_id: string;
  bucket_start: string;
  avg_value: number | string | null;
  min_value: number | string | null;
  max_value: number | string | null;
  cnt: number | string | null;
};

type LifecycleRow = {
  metric_id: string;
  first_log_at: string | null;
  last_log_at: string | null;
  total_logs: number | string | null;
  latest_value: number | string | null;
  latest_bucket_start: string | null;
};

type DashboardMetricRow = {
  metric_id: string;
  name: string;
  unit: string;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  priority: number | null;
  total_count: number | string | null;
  metric_updated_at: string | null;
  metric_settings_updated_at: string | null;
  category_updated_at: string | null;
};

export class VisualizationReadRepoSequelize implements VisualizationReadRepository {
  constructor(private cache: VisualizationCachePort) {}

  async fetchVisualization({
    userId,
    organizationId,
    metricId,
    startISO,
    endISO,
    bucketSpec,
    bucket,
    tz,
    fill,
  }: VisualizationQueryParams): Promise<VizResponse> {
    const metric = await this.assertOwnership(userId, organizationId, metricId);
    const cacheKey: SingleVizCacheKey = {
      userId,
      organizationId,
      metricId,
      startISO,
      endISO,
      bucket,
      bucketIso: bucketSpec.iso,
      tz,
      fill,
    };
    const cached = await this.cache.getSingleVisualization(cacheKey);
    if (cached) return cached;

    const sql = buildVisualizationSQL(bucketSpec);
    const rows = (await sequelize.query<VizRow>(sql, {
      type: QueryTypes.SELECT,
      replacements: {
        metricId,
        start: startISO,
        end: endISO,
        tz,
      },
    })) as VizRow[];

    const series = rows.map((r: VizRow) => ({
      bucketStartISO: new Date(r.bucket_start).toISOString(),
      value: fill === "zero" ? (r.avg_value ?? 0) : (r.avg_value ?? null),
    }));

    const numeric = (x: number | null): x is number =>
      typeof x === "number" && Number.isFinite(x);

    const stats = {
      average: null as number | null,
      min: null as number | null,
      max: null as number | null,
      count: 0,
    };
    for (const row of rows) {
      const avg = row.avg_value ?? null;
      const min = row.min_value ?? null;
      const max = row.max_value ?? null;
      stats.count += Number(row.cnt ?? 0);
      if (numeric(avg)) stats.average = avg;
      if (numeric(min))
        stats.min = stats.min == null ? min : Math.min(stats.min, min);
      if (numeric(max))
        stats.max = stats.max == null ? max : Math.max(stats.max, max);
    }

    const result: VizResponse = {
      metricId,
      series,
      stats,
      meta: {
        metricId,
        unit: metric.defaultUnit ?? "",
        bucket,
        tz,
        range: { startISO, endISO },
        fill,
      },
    };

    await this.cache.setSingleVisualization(cacheKey, result);
    return result;
  }

  async fetchDashboardVisualization(
    params: DashboardVisualizationParams,
  ): Promise<DashboardVizResponse> {
    const metrics = await this.fetchDashboardMetrics(params);
    const metricIds = metrics.map((metric) => metric.metric_id).sort();
    const metricIdArrayLiteral = `{${metricIds
      .map((id) => `"${id}"`)
      .join(",")}}`;
    const versionFingerprint = buildVersionFingerprint(metrics);

    const cacheKey: DashboardVizCacheKey = {
      userId: params.userId,
      organizationId: params.organizationId,
      metricIds,
      startISO: params.startISO,
      endISO: params.endISO,
      bucket: params.bucket,
      bucketIso: params.bucketSpec.iso,
      tz: params.tz,
      fill: params.fill,
      versionCursor: versionFingerprint,
    };

    const cached = await this.cache.getDashboardVisualization(cacheKey);
    if (cached) return cached;

    if (!metrics.length) {
      const empty: DashboardVizResponse = {
        items: [],
        meta: {
          bucket: params.bucket,
          tz: params.tz,
          range: { startISO: params.startISO, endISO: params.endISO },
          count: 0,
          totalMetrics: 0,
          fallbackMetrics: 0,
        },
        sync: { etagSeed: deriveEtagSeed(cacheKey, versionFingerprint) },
      };
      return empty;
    }

    const { bucketSpec } = params;
    const seriesSQL = buildDashboardSQL(bucketSpec);
    const lifecycleSQL = buildDashboardLifecycleSQL(bucketSpec);

    const [seriesRows, lifecycleRows] = (await Promise.all([
      sequelize.query<DashboardSeriesRow>(seriesSQL, {
        type: QueryTypes.SELECT,
        replacements: {
          userId: params.userId,
          metricIds: metricIdArrayLiteral,
          start: params.startISO,
          end: params.endISO,
          tz: params.tz,
        },
      }),
      sequelize.query<LifecycleRow>(lifecycleSQL, {
        type: QueryTypes.SELECT,
        replacements: {
          metricIds: metricIdArrayLiteral,
          tz: params.tz,
        },
      }),
    ])) as [DashboardSeriesRow[], LifecycleRow[]];

    const lifecycleByMetric = new Map<string, LifecycleRow>(
      lifecycleRows.map<[string, LifecycleRow]>((row) => [row.metric_id, row]),
    );

    const items: DashboardVizItem[] = await Promise.all(
      metrics.map((metric) =>
        this.buildDashboardItem({
          metric,
          seriesRows,
          lifecycleByMetric,
          input: params,
          bucketSpec,
        }),
      ),
    );

    const response: DashboardVizResponse = {
      items,
      meta: {
        bucket: params.bucket,
        tz: params.tz,
        range: { startISO: params.startISO, endISO: params.endISO },
        count: items.length,
        totalMetrics:
          metrics.length > 0
            ? numberFrom(metrics[0].total_count, metrics.length)
            : 0,
        fallbackMetrics: items.filter((item) => item.fallbackRangeUsed).length,
      },
      sync: {
        etagSeed: deriveEtagSeed(cacheKey, versionFingerprint),
      },
    };

    await this.cache.setDashboardVisualization(cacheKey, response);
    return response;
  }

  private async assertOwnership(
    userId: string,
    organizationId: string,
    metricId: string,
  ) {
    const metric = await models.Metric.findOne({
      where: { id: metricId, userId, organizationId },
    });
    if (!metric) throw new AppError("Metric not found", 404);
    return metric;
  }

  private async fetchDashboardMetrics(
    params: DashboardVisualizationParams,
  ): Promise<DashboardMetricRow[]> {
    const rows = await sequelize.query<DashboardMetricRow>(
      `
      SELECT ms.metric_id,
             m.name AS name,
             m.default_unit AS unit,
             c.name as category_name,
             c.color as category_color,
             c.icon as category_icon,
             COALESCE((ms.display_options->>'priority')::int, NULL) AS priority,
             COUNT(*) OVER () AS total_count,
             m.updated_at AS metric_updated_at,
             ms.updated_at AS metric_settings_updated_at,
             c.updated_at AS category_updated_at
      FROM metric_settings ms
      JOIN metrics m ON m.id = ms.metric_id
      LEFT JOIN metric_categories c ON m.category_id = c.id AND c.deleted_at IS NULL
      WHERE m.user_id = :userId
        AND m.organization_id = :organizationId
        AND COALESCE((ms.display_options->>'showOnDashboard')::boolean, false) = true
        AND COALESCE(ms.is_active, true) = true
      ORDER BY priority NULLS LAST, ms.created_at DESC, ms.id DESC
      LIMIT :limit
    `,
      {
        type: QueryTypes.SELECT,
        replacements: {
          userId: params.userId,
          organizationId: params.organizationId,
          limit: params.limit,
        },
      },
    );
    return rows as DashboardMetricRow[];
  }

  private async buildDashboardItem({
    metric,
    seriesRows,
    lifecycleByMetric,
    input,
    bucketSpec,
  }: {
    metric: DashboardMetricRow;
    seriesRows: DashboardSeriesRow[];
    lifecycleByMetric: Map<string, LifecycleRow>;
    input: DashboardVisualizationParams;
    bucketSpec: DashboardVisualizationParams["bucketSpec"];
  }): Promise<DashboardVizItem> {
    const metricSeries = seriesRows.filter(
      (row) => row.metric_id === metric.metric_id,
    );

    const lifecycle = lifecycleByMetric.get(metric.metric_id);
    const baseRequestedRange: RangeDescriptor = {
      startISO: input.startISO,
      endISO: input.endISO,
      bucket: input.bucket,
    };

    const fallbackRange = computeFallbackRange({
      requested: baseRequestedRange,
      lastLogAt: lifecycle?.last_log_at ?? null,
      guardBuckets: env.VIZ_FALLBACK_GUARD_BUCKETS,
    });

    let fallbackApplied = false;
    let actualRange: RangeDescriptor = baseRequestedRange;
    let fallbackStrategy: string | null = null;

    const hasRequestedData = metricSeries.some(
      (row) => Number(row.cnt ?? 0) > 0,
    );

    let effectiveSeries: DashboardSeriesRow[] = metricSeries;
    if (!hasRequestedData && fallbackRange) {
      const fallbackRows = await this.fetchFallbackSeries({
        metricId: metric.metric_id,
        range: fallbackRange.range,
        bucketSpec,
        tz: input.tz,
      });
      effectiveSeries = fallbackRows;
      fallbackApplied = true;
      actualRange = fallbackRange.range;
      fallbackStrategy = fallbackRange.strategy ?? null;
    }

    const series: DashboardVizItem["series"] = effectiveSeries.map((row) => ({
      bucketStartISO: new Date(row.bucket_start).toISOString(),
      value:
        input.fill === "zero"
          ? Number(row.avg_value ?? 0)
          : Number(row.avg_value ?? 0) || null,
    }));

    const stats: DashboardVizItem["stats"] = {
      average: effectiveSeries.length
        ? numberFrom(effectiveSeries[0].avg_value, null)
        : null,
      min: effectiveSeries.length
        ? numberFrom(effectiveSeries[0].min_value, null)
        : null,
      max: effectiveSeries.length
        ? numberFrom(effectiveSeries[0].max_value, null)
        : null,
      count: effectiveSeries.length ? numberFrom(effectiveSeries[0].cnt, 0) : 0,
    };

    const item: DashboardVizItem = {
      metricId: metric.metric_id,
      name: metric.name,
      unit: metric.unit,
      category_name: metric.category_name,
      category_icon: metric.category_icon,
      category_color: metric.category_color,
      priority: metric.priority,
      series,
      stats,
      lastLogAt: lifecycle?.last_log_at ?? null,
      firstLogAt: lifecycle?.first_log_at ?? null,
      totalLogs: numberFrom(lifecycle?.total_logs, 0),
      latestValue: numberFrom(lifecycle?.latest_value, null),
      latestBucketStart: lifecycle?.latest_bucket_start ?? null,
      requestedRange: baseRequestedRange,
      actualRange,
      fallbackRangeUsed: fallbackApplied,
      fallbackStrategy,
    };

    return item;
  }

  private async fetchFallbackSeries({
    metricId,
    range,
    bucketSpec,
    tz,
  }: {
    metricId: string;
    range: RangeDescriptor;
    bucketSpec: DashboardVisualizationParams["bucketSpec"];
    tz: string;
  }): Promise<DashboardSeriesRow[]> {
    const vizSQL = buildVisualizationSQL(bucketSpec);
    const rows = (await sequelize.query<VizRow>(vizSQL, {
      type: QueryTypes.SELECT,
      replacements: {
        metricId,
        start: range.startISO,
        end: range.endISO,
        tz,
      },
    })) as VizRow[];

    return rows.map<DashboardSeriesRow>((row) => ({
      metric_id: metricId,
      bucket_start: row.bucket_start,
      avg_value: row.avg_value,
      min_value: row.min_value,
      max_value: row.max_value,
      cnt: row.cnt,
    }));
  }
}

function numberFrom<T>(
  value: number | string | null | undefined,
  fallback: T,
): number | T {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildVersionFingerprint(metrics: DashboardMetricRow[]) {
  const entries = metrics.map((m) => [
    m.metric_id,
    m.metric_updated_at ?? "",
    m.metric_settings_updated_at ?? "",
    m.category_updated_at ?? "",
  ]);
  return createHash("sha1").update(JSON.stringify(entries)).digest("base64url");
}

function deriveEtagSeed(
  params: DashboardVizCacheKey,
  versionFingerprint: string,
) {
  const raw = JSON.stringify({
    ...params,
    versionFingerprint,
  });
  return `"${createHash("sha1").update(raw).digest("base64url").slice(0, 27)}"`;
}
