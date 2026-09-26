import { jest } from "@jest/globals";
import { ListUserOrganizations } from "@/features/auth/application/queries/ListUserOrganizations.js";
import { MembershipRepository } from "@/features/auth/domain/repositories/MembershipRepository.js";
import { OrganizationRepository } from "@/features/auth/domain/repositories/OrganizationRepository.js";
import {
  Membership,
  MembershipRole,
  MembershipStatus,
} from "@/features/auth/domain/entities/Membership.js";
import { Organization } from "@/features/auth/domain/entities/Organization.js";

const makeMembership = (
  organizationId: string,
  opts: { role?: MembershipRole; status?: MembershipStatus } = {},
) =>
  Membership.fromPersistence({
    id: `m-${organizationId}`,
    userId: "user-1",
    organizationId,
    role: opts.role ?? "member",
    status: opts.status ?? "active",
    joinedAt: new Date("2026-09-01T00:00:00.000Z"),
  });

const makeOrg = (id: string) =>
  Organization.fromPersistence({
    id,
    name: `Org ${id}`,
    slug: `org-${id}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });

const build = () => {
  const membershipRepo: jest.Mocked<MembershipRepository> = {
    findById: jest.fn(),
    findByUserAndOrg: jest.fn(),
    findDefaultByUser: jest.fn(),
    findAllByUser: jest.fn(),
    findAllByOrganization: jest.fn(),
    countByOrgAndRole: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const orgRepo: jest.Mocked<OrganizationRepository> = {
    findById: jest.fn(),
    findByIds: jest.fn(),
    findBySlug: jest.fn(),
    existsBySlug: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const sut = new ListUserOrganizations(membershipRepo, orgRepo);
  return { sut, membershipRepo, orgRepo };
};

describe("ListUserOrganizations query", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("lists the user's organizations and marks the current one", async () => {
    const { sut, membershipRepo, orgRepo } = build();
    membershipRepo.findAllByUser.mockResolvedValue([
      makeMembership("a", { role: "owner" }),
      makeMembership("b"),
    ]);
    orgRepo.findByIds.mockResolvedValue([makeOrg("a"), makeOrg("b")]);

    const result = await sut.execute({
      userId: "user-1",
      currentOrganizationId: "b",
    });

    expect(membershipRepo.findAllByUser).toHaveBeenCalledWith("user-1");
    expect(result).toEqual([
      {
        organizationId: "a",
        name: "Org a",
        slug: "org-a",
        role: "owner",
        joinedAt: "2026-09-01T00:00:00.000Z",
        isCurrent: false,
      },
      {
        organizationId: "b",
        name: "Org b",
        slug: "org-b",
        role: "member",
        joinedAt: "2026-09-01T00:00:00.000Z",
        isCurrent: true,
      },
    ]);
  });

  it("excludes memberships that are not active", async () => {
    const { sut, membershipRepo, orgRepo } = build();
    membershipRepo.findAllByUser.mockResolvedValue([
      makeMembership("a"),
      makeMembership("b", { status: "invited" }),
      makeMembership("c", { status: "removed" }),
    ]);
    orgRepo.findByIds.mockResolvedValue([makeOrg("a")]);

    const result = await sut.execute({
      userId: "user-1",
      currentOrganizationId: "a",
    });

    expect(orgRepo.findByIds).toHaveBeenCalledWith(["a"]);
    expect(result.map((o) => o.organizationId)).toEqual(["a"]);
  });

  it("skips a membership whose organization is not found", async () => {
    const { sut, membershipRepo, orgRepo } = build();
    membershipRepo.findAllByUser.mockResolvedValue([
      makeMembership("a"),
      makeMembership("deleted"),
    ]);
    orgRepo.findByIds.mockResolvedValue([makeOrg("a")]);

    const result = await sut.execute({
      userId: "user-1",
      currentOrganizationId: "a",
    });

    expect(result.map((o) => o.organizationId)).toEqual(["a"]);
  });

  it("returns an empty list when the user has no memberships", async () => {
    const { sut, membershipRepo, orgRepo } = build();
    membershipRepo.findAllByUser.mockResolvedValue([]);
    orgRepo.findByIds.mockResolvedValue([]);

    const result = await sut.execute({
      userId: "user-1",
      currentOrganizationId: "a",
    });

    expect(result).toEqual([]);
    expect(orgRepo.findByIds).toHaveBeenCalledWith([]);
  });
});
