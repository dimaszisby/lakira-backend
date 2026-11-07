import { models } from "@/infrastructure/db/models.js";
import {
  MetricLibraryDomain,
  MetricDomainExtended,
} from "../../../domain/metric.domain.js";
import {
  MetricReadRepository,
  ListMetricsResult,
  ListOpts,
  SortField,
  SortParam,
  MetricDetailQuery,
  Dir,
} from "../../../application/ports/MetricReadRepository.js";
import {
  toDomainMetricLibrary,
  toExtendedMetricDomain,
} from "../mappers/MetricReadMapper.js";
import {
  FindAttributeOptions,
  ProjectionAlias,
  Sequelize,
  WhereOptions,
  Op,
  OrderItem,
  Includeable,
  FindOptions,
} from "sequelize";
import type { Metric as MetricModel } from "../models/metric.sequelize.js";

export class MetricReadRepoSequelize implements MetricReadRepository {
  async listMetrics(opts: ListOpts): Promise<ListMetricsResult> {
    const {
      userId,
      organizationId,
      limit,
      sort,
      q,
      filter,
      after,
      includeTotal,
    } = opts;
    const { field, dir } = normalizeSort(sort);
    const cursor = after ? decodeCursor(after) : null;
    const where = buildWhere(userId, organizationId, q, filter);

    const attributes = baseAttributesWithLogCount() as FindAttributeOptions;
    const order = buildOrder(field, dir);
    const pageSize = Math.min(Math.max(limit || 20, 1), 100);

    const scope: FindOptions = {
      attributes,
      where,
      order,
      limit: pageSize + 1,
      paranoid: false,
      include: [
        {
          model: models.MetricCategory,
          as: "category",
          attributes: ["id", "userId", "name", "color", "icon"],
          required: false,
        },
      ],
    };

    if (cursor && cursor.sort === sort) {
      scope.where = {
        [Op.and]: [where, buildCursorPredicate(cursor, field, dir)],
      };
    }

    const rows = await models.Metric.findAll(scope);
    const hasMore = rows.length > pageSize;
    const slice = hasMore ? rows.slice(0, pageSize) : rows;

    const items: MetricLibraryDomain[] = slice.map((row: MetricModel) =>
      toDomainMetricLibrary(row),
    );

    let nextCursor: string | undefined;
    if (hasMore && slice.length) {
      const last = slice[slice.length - 1];
      const logCountValue =
        typeof (last as { get?: unknown }).get === "function"
          ? (last as MetricModel & { get: (k: string) => unknown }).get(
              "logCount",
            )
          : (last as MetricModel & { logCount?: unknown }).logCount;
      const payload: CursorPayload = {
        sort,
        id: last.id,
        createdAt: last.createdAt?.toISOString(),
        updatedAt: last.updatedAt?.toISOString(),
        nameLower: last.name?.toLowerCase(),
        // Access literal value when rows are plain objects (unit tests) or Sequelize instances.
        logCount: Number((logCountValue as number | string | undefined) ?? 0),
      };
      nextCursor = encodeCursor(payload);
    }

    let totalCount: number | undefined;
    if (includeTotal) {
      totalCount = await models.Metric.count({
        where,
        paranoid: false,
      });
    }

    return {
      items,
      nextCursor,
      sort,
      limit,
      ...(q ? { q } : {}),
      ...(filter ? { filter } : {}),
      ...(includeTotal ? { totalCount } : {}),
    };
  }

  async findDetailedMetric({
    userId,
    organizationId,
    metricId,
    includes = [],
    logsLimit = 20,
  }: MetricDetailQuery): Promise<MetricDomainExtended | null> {
    const includeArr: Includeable[] = [];

    if (includes.includes("category")) {
      includeArr.push({
        model: models.MetricCategory,
        as: "category",
        attributes: [
          "id",
          "userId",
          "name",
          "color",
          "icon",
          "createdAt",
          "updatedAt",
        ],
      });
    }

    if (includes.includes("settings")) {
      includeArr.push({
        model: models.MetricSettings,
        as: "settings",
        attributes: [
          "id",
          "metricId",
          "isActive",
          "goalEnabled",
          "goalType",
          "goalValue",
          "timeFrameEnabled",
          "startDate",
          "deadlineDate",
          "alertEnabled",
          "alertThresholds",
          "isAchieved",
          "displayOptions",
          "createdAt",
          "updatedAt",
        ],
      });
    }

    if (includes.includes("logs")) {
      includeArr.push({
        model: models.MetricLog,
        as: "logs",
        attributes: [
          "id",
          "metricId",
          "logValue",
          "type",
          "loggedAt",
          "createdAt",
          "updatedAt",
        ],
        // The latest by when the value was logged, not when the row was inserted,
        // with `id` so ties cannot reorder (kit deterministic-query-ordering, ADR-0052).
        order: [
          ["loggedAt", "DESC"],
          ["id", "DESC"],
        ],
        limit: logsLimit,
      });
    }

    const metric = await models.Metric.findOne({
      where: { id: metricId, userId, organizationId },
      include: includeArr,
    });

    if (!metric) {
      return null;
    }

    return toExtendedMetricDomain(metric);
  }
}

type CursorPayload = {
  sort: SortParam;
  id: string;
  createdAt?: string;
  updatedAt?: string;
  nameLower?: string;
  logCount?: number;
};

const LOG_COUNT_SQL =
  '(SELECT COUNT(*) FROM "public"."metric_logs" ml ' +
  'WHERE ml."metric_id" = "Metric"."id")';

function baseAttributesWithLogCount(): (string | ProjectionAlias)[] {
  const logCount: ProjectionAlias = [
    Sequelize.literal(LOG_COUNT_SQL),
    "logCount",
  ];
  return [
    "id",
    "createdAt",
    "updatedAt",
    "defaultUnit",
    "description",
    "name",
    "userId",
    "categoryId",
    "deletedAt",
    "isPublic",
    logCount,
  ];
}

function normalizeSort(sort: SortParam): {
  field: SortField;
  dir: Dir;
} {
  const s = sort ?? "-createdAt";
  const dir: Dir = s.startsWith("-") ? "DESC" : "ASC";
  const field = (s.startsWith("-") ? s.slice(1) : s) as SortField;

  return ["createdAt", "updatedAt", "name", "logCount"].includes(field)
    ? { field, dir }
    : { field: "createdAt", dir: "DESC" };
}

function buildWhere(
  userId: string,
  organizationId: string,
  q?: string,
  filter?: { name?: string; categoryId?: string },
): WhereOptions {
  const like = (v: string) => ({ [Op.iLike]: `%${v}%` });
  const and: Array<Record<string, unknown>> = [
    { userId },
    { organizationId },
    { deletedAt: null },
  ];

  if (q) and.push({ name: like(q) });
  if (filter?.name) and.push({ name: like(filter.name) });
  if (filter?.categoryId) and.push({ categoryId: filter.categoryId }); // WIP

  return { [Op.and]: and };
}

function buildCursorPredicate(
  cursor: CursorPayload,
  field: SortField,
  dir: Dir,
): WhereOptions {
  const ltgt = dir === "DESC" ? Op.lt : Op.gt;
  const eq = Op.eq;

  switch (field) {
    case "createdAt": {
      const C = cursor.createdAt ? new Date(cursor.createdAt) : new Date();
      return {
        [Op.or]: [
          { createdAt: { [ltgt]: C } },
          {
            [Op.and]: [
              { createdAt: { [eq]: C } },
              { id: { [ltgt]: cursor.id } },
            ],
          },
        ],
      };
    }
    case "updatedAt": {
      const U = cursor.updatedAt ? new Date(cursor.updatedAt) : new Date();
      return {
        [Op.or]: [
          { updatedAt: { [ltgt]: U } },
          {
            [Op.and]: [
              { updatedAt: { [eq]: U } },
              { id: { [ltgt]: cursor.id } },
            ],
          },
        ],
      };
    }
    case "name": {
      const N = cursor.nameLower ?? "";
      const lowerColumn = Sequelize.fn("LOWER", Sequelize.col("Metric.name"));
      return {
        [Op.or]: [
          Sequelize.where(lowerColumn, {
            [ltgt]: N,
          }),
          {
            [Op.and]: [
              Sequelize.where(lowerColumn, { [eq]: N }),
              { id: { [ltgt]: cursor.id } },
            ],
          },
        ],
      };
    }
    case "logCount": {
      const L = cursor.logCount ?? 0;
      const literal = Sequelize.literal(LOG_COUNT_SQL);
      return {
        [Op.or]: [
          Sequelize.where(literal, { [ltgt]: L }),
          {
            [Op.and]: [
              Sequelize.where(literal, { [eq]: L }),
              { id: { [ltgt]: cursor.id } },
            ],
          },
        ],
      };
    }
  }
}

function buildOrder(field: SortField, dir: Dir): OrderItem[] {
  switch (field) {
    case "name":
      return [
        [Sequelize.fn("lower", Sequelize.col("Metric.name")), dir],
        ["id", dir],
      ];
    case "logCount":
      return [
        [Sequelize.literal(LOG_COUNT_SQL), dir],
        ["id", dir],
      ];
    case "updatedAt":
      return [
        ["updatedAt", dir],
        ["id", dir],
      ];
    default:
      return [
        ["createdAt", dir],
        ["id", dir],
      ];
  }
}

function encodeCursor(c: CursorPayload): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

function decodeCursor(s: string): CursorPayload | null {
  try {
    return JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
