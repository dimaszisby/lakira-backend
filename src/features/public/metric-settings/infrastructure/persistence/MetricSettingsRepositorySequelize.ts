import { models } from "@/infrastructure/db/models.js";
import AppError from "@/utils/AppError.js";
import { MetricSettings } from "../../domain/entities/MetricSettings.js";
import {
  CreateMetricSettingsDTO,
  ListMetricSettingsOptions,
  ListMetricSettingsResult,
  MetricSettingsRepository,
  SortField,
  SortParam,
} from "../../domain/repositories/MetricSettingsRepository.js";
import { Op, OrderItem, UniqueConstraintError, WhereOptions } from "sequelize";
import type { MetricSettingsAttributes } from "./models/metric-settings.sequelize.js";

const includeMetric = () => [
  {
    model: models.Metric,
    as: "metric",
    attributes: ["id", "userId"],
  },
];

type MetricSettingsRow = MetricSettingsAttributes & {
  metric?: { userId?: string } | null;
  displayOptions?: MetricSettingsAttributes["displayOptions"] | null;
};

const toEntity = (row: MetricSettingsRow): MetricSettings =>
  MetricSettings.fromPersistence({
    id: row.id,
    metricId: row.metricId,
    isActive: row.isActive,
    goalEnabled: row.goalEnabled,
    goalType: row.goalType,
    goalValue: row.goalValue,
    timeFrameEnabled: row.timeFrameEnabled,
    startDate: row.startDate ? new Date(row.startDate) : null,
    deadlineDate: row.deadlineDate ? new Date(row.deadlineDate) : null,
    alertEnabled: row.alertEnabled,
    alertThresholds: row.alertThresholds,
    isAchieved: row.isAchieved,
    displayOptions: {
      showOnDashboard: row.displayOptions?.showOnDashboard ?? false,
      priority:
        row.displayOptions?.priority === undefined
          ? 1
          : row.displayOptions.priority,
      chartType: row.displayOptions?.chartType ?? "line",
      color: row.displayOptions?.color ?? "#E897A3",
    },
    createdAt: row.createdAt ?? new Date(0),
    updatedAt: row.updatedAt ?? new Date(0),
  });

export class MetricSettingsRepositorySequelize implements MetricSettingsRepository {
  async create(data: CreateMetricSettingsDTO): Promise<MetricSettings> {
    try {
      const created = await models.MetricSettings.create({
        ...data,
        displayOptions: data.displayOptions,
      });
      await created.reload({ include: includeMetric() });
      return toEntity(created);
    } catch (err) {
      if (
        err instanceof UniqueConstraintError &&
        err.errors.some((e) => e.path === "metric_id" || e.path === "metricId")
      ) {
        throw new AppError(
          "Metric settings already exist for this metric",
          409,
        );
      }
      throw err;
    }
  }

  async findByMetricId(
    organizationId: string,
    metricId: string,
  ): Promise<MetricSettings | null> {
    const row = await models.MetricSettings.findOne({
      where: { metricId, organizationId },
      include: includeMetric(),
    });
    return row ? toEntity(row) : null;
  }

  async findById(
    userId: string,
    organizationId: string,
    settingsId: string,
  ): Promise<MetricSettings | null> {
    // Authorization is enforced by the INNER JOIN: the Metric WHERE clause
    // { userId, organizationId } ensures only settings whose parent metric is
    // owned by this user in this org are returned. A non-matching join yields
    // null, which the caller treats as not found / unauthorized.
    const row = await models.MetricSettings.findOne({
      where: { id: settingsId, organizationId },
      include: [
        {
          model: models.Metric,
          as: "metric",
          attributes: ["id", "userId"],
          where: { userId, organizationId },
        },
      ],
    });
    if (!row) return null;
    return toEntity(row);
  }

  async save(
    organizationId: string,
    settings: MetricSettings,
  ): Promise<MetricSettings> {
    const snapshot = settings.snapshot();
    const [affectedCount] = await models.MetricSettings.update(
      {
        isActive: snapshot.isActive,
        goalEnabled: snapshot.goalEnabled,
        goalType: snapshot.goalType,
        goalValue: snapshot.goalValue,
        timeFrameEnabled: snapshot.timeFrameEnabled,
        startDate: snapshot.startDate,
        deadlineDate: snapshot.deadlineDate,
        alertEnabled: snapshot.alertEnabled,
        alertThresholds: snapshot.alertThresholds,
        isAchieved: snapshot.isAchieved,
        displayOptions: snapshot.displayOptions,
      },
      { where: { id: snapshot.id, organizationId } },
    );
    if (affectedCount === 0)
      throw new AppError("Metric Settings not found", 404);

    const updated = await models.MetricSettings.findOne({
      where: { id: snapshot.id, organizationId },
      include: includeMetric(),
    });
    if (!updated) throw new AppError("Metric Settings not found", 404);
    return toEntity(updated);
  }

  async delete(
    organizationId: string,
    settings: MetricSettings,
  ): Promise<void> {
    await models.MetricSettings.destroy({
      where: { id: settings.id, organizationId },
    });
  }

  async listByCursor(
    opts: ListMetricSettingsOptions,
  ): Promise<ListMetricSettingsResult> {
    const { field, dir } = normalizeSort(opts.sort);
    const pageSize = Math.min(Math.max(opts.limit || 20, 1), 100);

    const include = baseIncludeForOwnership(opts.userId, opts.organizationId);
    const baseWhere = buildWhere(opts.filter);

    const totalCount = opts.includeTotal
      ? await models.MetricSettings.count({ where: baseWhere, include })
      : undefined;

    let where: WhereOptions = baseWhere;
    if (opts.after) {
      const cursor = decodeCursor(opts.after);
      if (cursor && cursor.sort === opts.sort) {
        where = {
          [Op.and]: [baseWhere, buildCursorPredicate(cursor, field, dir)],
        };
      }
    }

    const order = buildOrder(field, dir);

    const rows = await models.MetricSettings.findAll({
      where,
      include,
      limit: pageSize + 1,
      order,
      raw: true,
      nest: true,
    });

    const hasMore = rows.length > pageSize;
    const itemsRaw = hasMore ? rows.slice(0, pageSize) : rows;
    const items = itemsRaw.map(toEntity);

    let nextCursor: string | undefined;
    if (hasMore && items.length > 0) {
      const last = items[items.length - 1];
      const snap = last.snapshot();
      const payload: CursorPayload = { sort: opts.sort, id: snap.id };
      if (field === "createdAt")
        payload.createdAt = snap.createdAt.toISOString();
      if (field === "updatedAt")
        payload.updatedAt = snap.updatedAt.toISOString();
      if (field === "isActive") payload.isActive = snap.isActive;
      nextCursor = encodeCursor(payload);
    }

    return {
      items,
      nextCursor,
      sort: opts.sort,
      limit: pageSize,
      ...(opts.q ? { q: opts.q } : {}),
      ...(opts.filter ? { filter: opts.filter } : {}),
      ...(opts.includeTotal ? { totalCount } : {}),
    };
  }
}

type CursorPayload = {
  sort: SortParam;
  id: string;
  createdAt?: string;
  updatedAt?: string;
  isActive?: boolean;
};

const normalizeSort = (
  sort: SortParam,
): { field: SortField; dir: "ASC" | "DESC" } => {
  const dir = sort.startsWith("-") ? "DESC" : "ASC";
  const field = (sort.startsWith("-") ? sort.slice(1) : sort) as SortField;
  return ["createdAt", "updatedAt", "isActive"].includes(field)
    ? { field, dir }
    : { field: "createdAt", dir: "DESC" };
};

const buildWhere = (filter?: {
  metricId?: string;
  isActive?: boolean;
}): WhereOptions => {
  const and: WhereOptions[] = [];
  if (filter?.metricId) and.push({ metricId: filter.metricId });
  if (filter?.isActive !== undefined) and.push({ isActive: filter.isActive });
  return and.length ? { [Op.and]: and } : {};
};

const buildCursorPredicate = (
  cursor: CursorPayload,
  field: SortField,
  dir: "ASC" | "DESC",
): WhereOptions => {
  const ltgt = dir === "DESC" ? Op.lt : Op.gt;
  const eq = Op.eq;

  if (field === "createdAt") {
    const C = new Date(cursor.createdAt!);
    return {
      [Op.or]: [
        { createdAt: { [ltgt]: C } },
        {
          [Op.and]: [{ createdAt: { [eq]: C } }, { id: { [ltgt]: cursor.id } }],
        },
      ],
    };
  }
  if (field === "updatedAt") {
    const U = new Date(cursor.updatedAt!);
    return {
      [Op.or]: [
        { updatedAt: { [ltgt]: U } },
        {
          [Op.and]: [{ updatedAt: { [eq]: U } }, { id: { [ltgt]: cursor.id } }],
        },
      ],
    };
  }
  return {
    [Op.or]: [
      { isActive: { [ltgt]: cursor.isActive! } },
      {
        [Op.and]: [
          { isActive: { [eq]: cursor.isActive! } },
          { id: { [ltgt]: cursor.id } },
        ],
      },
    ],
  };
};

const buildOrder = (field: SortField, dir: "ASC" | "DESC"): OrderItem[] => {
  switch (field) {
    case "isActive":
      return [
        ["isActive", dir],
        ["id", dir],
      ];
    case "updatedAt":
      return [
        ["updatedAt", dir],
        ["id", dir],
      ];
    case "createdAt":
    default:
      return [
        ["createdAt", dir],
        ["id", dir],
      ];
  }
};

const baseIncludeForOwnership = (userId: string, organizationId: string) => [
  {
    model: models.Metric,
    as: "metric",
    attributes: [],
    required: true,
    where: { userId, organizationId, deletedAt: null },
  },
];

const encodeCursor = (c: CursorPayload): string =>
  Buffer.from(JSON.stringify(c)).toString("base64url");

const decodeCursor = (s: string): CursorPayload | null => {
  try {
    return JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
  } catch {
    return null;
  }
};
