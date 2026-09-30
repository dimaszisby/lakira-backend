import { MembershipRepositorySequelize } from "@/features/auth/infrastructure/persistence/MembershipRepositorySequelize.js";
import { models } from "@/infrastructure/db/models.js";
import { createUserRow, truncateAllTables } from "../../helpers/db-fixtures.js";

const repo = new MembershipRepositorySequelize();

// Explicit ids so the expected order is known. Without an `id` tie-breaker
// Postgres returns tied rows in whatever order it reads them: insertion order
// from the heap, or key order from the (user_id, organization_id) unique index.
// Both are arranged to disagree with id order: the larger membership id is
// inserted first, in the organization and for the user with the smaller id.
const LOW_ID = "00000000-0000-4000-8000-00000000000a";
const HIGH_ID = "ffffffff-ffff-4fff-bfff-fffffffffffa";
const ORG_A = "00000000-0000-4000-8000-0000000000a1";
const ORG_B = "00000000-0000-4000-8000-0000000000b1";
const USER_ID = "00000000-0000-4000-8000-0000000000d1";
const OTHER_USER_ID = "ffffffff-ffff-4fff-bfff-ffffffffffd1";
// Earlier than the TEST_ORG_ID membership createUserRow adds with `new Date()`.
const SAME_JOINED_AT = new Date("2020-01-01T00:00:00Z");

/**
 * Kit deterministic-query-ordering, D-01. `findDefaultByUser` picks the
 * organization a user lands in at login, so a tie on `joinedAt` must resolve
 * the same way every time.
 */
describe("MembershipRepositorySequelize (integration)", () => {
  let userId: string;

  beforeEach(async () => {
    await truncateAllTables();
    userId = (await createUserRow({ id: USER_ID })).id;
    for (const [id, name] of [
      [ORG_B, "Org B"],
      [ORG_A, "Org A"],
    ]) {
      await models.Organization.create({ id, name, slug: `slug-${id}` });
    }
    await models.Membership.create({
      id: HIGH_ID,
      userId,
      organizationId: ORG_A,
      role: "member",
      status: "active",
      joinedAt: SAME_JOINED_AT,
    });
    await models.Membership.create({
      id: LOW_ID,
      userId,
      organizationId: ORG_B,
      role: "member",
      status: "active",
      joinedAt: SAME_JOINED_AT,
    });
  });

  it("findDefaultByUser breaks a joinedAt tie by id", async () => {
    const membership = await repo.findDefaultByUser(userId);

    expect(membership?.id).toBe(LOW_ID);
  });

  it("findAllByUser breaks a joinedAt tie by id", async () => {
    const memberships = await repo.findAllByUser(userId);

    expect(memberships.slice(0, 2).map((m) => m.id)).toEqual([LOW_ID, HIGH_ID]);
  });

  it("findAllByOrganization breaks a joinedAt tie by id", async () => {
    await createUserRow({ id: OTHER_USER_ID });
    // Org A already holds HIGH_ID for the smaller user id; this smaller
    // membership id, for the larger user id, is inserted after it.
    const lowerInOrgA = "11111111-1111-4111-8111-11111111111a";
    await models.Membership.create({
      id: lowerInOrgA,
      userId: OTHER_USER_ID,
      organizationId: ORG_A,
      role: "member",
      status: "active",
      joinedAt: SAME_JOINED_AT,
    });

    const memberships = await repo.findAllByOrganization(ORG_A);

    expect(memberships.map((m) => m.id)).toEqual([lowerInOrgA, HIGH_ID]);
  });
});
