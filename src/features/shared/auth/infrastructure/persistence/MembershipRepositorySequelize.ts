import {
  Op,
  Transaction,
  col,
  fn,
  where as sqlWhere,
  type OrderItem,
  type WhereOptions,
} from "sequelize";
import { models } from "@/infrastructure/db/models.js";
import {
  Membership,
  MembershipRole,
} from "../../domain/entities/Membership.js";
import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";
import {
  CreateMembershipDTO,
  MembershipPage,
  MembershipPageRequest,
  MembershipRepository,
} from "../../domain/repositories/MembershipRepository.js";
import type { Membership as MembershipModel } from "./models/membership.sequelize.js";

const toDomain = (row: MembershipModel): Membership =>
  Membership.fromPersistence({
    id: row.id,
    userId: row.userId,
    organizationId: row.organizationId,
    role: row.role,
    status: row.status,
    joinedAt: row.joinedAt,
  });

// Oldest membership first. `id` settles a tie on `joinedAt`, so the default
// organization chosen at login cannot flip (kit deterministic-query-ordering).
const ORDER_BY_JOINED: OrderItem[] = [
  ["joinedAt", "ASC"],
  ["id", "ASC"],
];

// A page's position is `joinedAt` to the millisecond, the precision of the Date its
// cursor carries. Postgres keeps microseconds, and the backfill wrote `NOW()`: compared
// at full precision, such a row sorted after its own cursor and was read again, page
// after page (api-tooling-residuals D-09).
const joinedAtMs = fn("date_trunc", "milliseconds", col("joined_at"));
const ORDER_BY_JOINED_MS: OrderItem[] = [
  [joinedAtMs, "ASC"],
  ["id", "ASC"],
];

// One page, after `page.after` when given. One row past the limit is read to learn
// whether another page follows.
const findPage = async (
  where: WhereOptions,
  page: MembershipPageRequest,
): Promise<MembershipPage> => {
  const after = page.after
    ? {
        [Op.or]: [
          sqlWhere(joinedAtMs, Op.gt, page.after.joinedAt),
          {
            [Op.and]: [
              sqlWhere(joinedAtMs, Op.eq, page.after.joinedAt),
              { id: { [Op.gt]: page.after.id } },
            ],
          },
        ],
      }
    : {};
  const rows = await models.Membership.findAll({
    where: { [Op.and]: [where, after] },
    order: ORDER_BY_JOINED_MS,
    limit: page.limit + 1,
  });
  const items = rows.slice(0, page.limit).map(toDomain);
  const last = items[items.length - 1];
  return {
    items,
    next:
      rows.length > page.limit && last
        ? { joinedAt: last.joinedAt, id: last.id }
        : null,
  };
};

export class MembershipRepositorySequelize implements MembershipRepository {
  async findById(id: string): Promise<Membership | null> {
    const row = await models.Membership.findByPk(id);
    return row ? toDomain(row) : null;
  }

  async findByUserAndOrg(
    userId: string,
    organizationId: string,
  ): Promise<Membership | null> {
    const row = await models.Membership.findOne({
      where: { userId, organizationId, status: "active" },
    });
    return row ? toDomain(row) : null;
  }

  async findDefaultByUser(userId: string): Promise<Membership | null> {
    const row = await models.Membership.findOne({
      where: { userId, status: "active" },
      order: ORDER_BY_JOINED,
    });
    return row ? toDomain(row) : null;
  }

  async findAllByUser(userId: string): Promise<Membership[]> {
    const rows = await models.Membership.findAll({
      where: { userId },
      order: ORDER_BY_JOINED,
    });
    return rows.map(toDomain);
  }

  async findActivePageByUser(
    userId: string,
    page: MembershipPageRequest,
  ): Promise<MembershipPage> {
    return findPage({ userId, status: "active" }, page);
  }

  async findPageByOrganization(
    organizationId: string,
    page: MembershipPageRequest,
  ): Promise<MembershipPage> {
    return findPage({ organizationId }, page);
  }

  async findAllByOrganization(organizationId: string): Promise<Membership[]> {
    const rows = await models.Membership.findAll({
      where: { organizationId },
      order: ORDER_BY_JOINED,
    });
    return rows.map(toDomain);
  }

  async create(
    data: CreateMembershipDTO,
    tx?: PersistenceTransaction,
  ): Promise<Membership> {
    const transaction = tx as Transaction | undefined;
    const created = await models.Membership.create(
      {
        userId: data.userId,
        organizationId: data.organizationId,
        role: data.role,
        status: data.status ?? "active",
        joinedAt: new Date(),
      },
      { transaction },
    );
    await created.reload({ transaction });
    return toDomain(created);
  }

  async save(membership: Membership): Promise<Membership> {
    const row = await models.Membership.findByPk(membership.id);
    if (!row) throw new Error("Membership not found");
    await row.update({
      role: membership.role,
    });
    await row.reload();
    return toDomain(row);
  }

  async countByOrgAndRole(
    organizationId: string,
    role: MembershipRole,
  ): Promise<number> {
    return models.Membership.count({
      where: { organizationId, role, status: "active" },
    });
  }

  async delete(id: string): Promise<void> {
    const row = await models.Membership.findByPk(id);
    if (!row) throw new Error("Membership not found");
    await row.destroy();
  }
}
