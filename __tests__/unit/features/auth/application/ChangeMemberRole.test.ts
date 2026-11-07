import { jest } from "@jest/globals";
import { ChangeMemberRole } from "@/features/auth/application/use-cases/ChangeMemberRole.js";
import { MembershipRepository } from "@/features/auth/domain/repositories/MembershipRepository.js";
import { Membership } from "@/features/auth/domain/entities/Membership.js";

const makeMembership = (
  overrides: Partial<{ role: "owner" | "admin" | "member" }> = {},
) =>
  Membership.fromPersistence({
    id: "mem-1",
    userId: "user-target",
    organizationId: "org-1",
    role: overrides.role ?? "member",
    status: "active",
    joinedAt: new Date(),
  });

const build = () => {
  const membershipRepo: jest.Mocked<MembershipRepository> = {
    findById: jest.fn(),
    findByUserAndOrg: jest.fn(),
    findDefaultByUser: jest.fn(),
    findAllByUser: jest.fn(),
    findAllByOrganization: jest.fn(),
    findActivePageByUser: jest.fn(),
    findPageByOrganization: jest.fn(),
    countByOrgAndRole: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const sut = new ChangeMemberRole(membershipRepo);
  return { sut, membershipRepo };
};

describe("ChangeMemberRole", () => {
  beforeEach(() => jest.resetAllMocks());

  it("changes member role when actor is owner", async () => {
    const { sut, membershipRepo } = build();
    const membership = makeMembership({ role: "member" });
    membershipRepo.findById.mockResolvedValue(membership);
    membershipRepo.save.mockResolvedValue(membership);

    await sut.execute({
      membershipId: "mem-1",
      organizationId: "org-1",
      newRole: "admin",
      actorRole: "owner",
    });

    expect(membershipRepo.save).toHaveBeenCalled();
    expect(membership.role).toBe("admin");
  });

  it("throws 403 when actor is not an owner", async () => {
    const { sut } = build();

    await expect(
      sut.execute({
        membershipId: "mem-1",
        organizationId: "org-1",
        newRole: "admin",
        actorRole: "admin",
      }),
    ).rejects.toMatchObject({ kind: "forbidden" });
  });

  it("throws 404 when membership does not exist", async () => {
    const { sut, membershipRepo } = build();
    membershipRepo.findById.mockResolvedValue(null);

    await expect(
      sut.execute({
        membershipId: "mem-missing",
        organizationId: "org-1",
        newRole: "admin",
        actorRole: "owner",
      }),
    ).rejects.toMatchObject({ kind: "not_found" });
  });

  it("throws 404 when membership belongs to a different org", async () => {
    const { sut, membershipRepo } = build();
    membershipRepo.findById.mockResolvedValue(makeMembership());

    await expect(
      sut.execute({
        membershipId: "mem-1",
        organizationId: "org-other",
        newRole: "admin",
        actorRole: "owner",
      }),
    ).rejects.toMatchObject({ kind: "not_found" });
  });

  it("no-ops when role is already the same", async () => {
    const { sut, membershipRepo } = build();
    membershipRepo.findById.mockResolvedValue(
      makeMembership({ role: "admin" }),
    );

    await sut.execute({
      membershipId: "mem-1",
      organizationId: "org-1",
      newRole: "admin",
      actorRole: "owner",
    });

    expect(membershipRepo.save).not.toHaveBeenCalled();
  });

  it("throws 400 when demoting the last owner", async () => {
    const { sut, membershipRepo } = build();
    membershipRepo.findById.mockResolvedValue(
      makeMembership({ role: "owner" }),
    );
    membershipRepo.countByOrgAndRole.mockResolvedValue(1);

    await expect(
      sut.execute({
        membershipId: "mem-1",
        organizationId: "org-1",
        newRole: "admin",
        actorRole: "owner",
      }),
    ).rejects.toMatchObject({ kind: "validation" });
  });

  it("allows demoting an owner when there are multiple owners", async () => {
    const { sut, membershipRepo } = build();
    const membership = makeMembership({ role: "owner" });
    membershipRepo.findById.mockResolvedValue(membership);
    membershipRepo.countByOrgAndRole.mockResolvedValue(2);
    membershipRepo.save.mockResolvedValue(membership);

    await sut.execute({
      membershipId: "mem-1",
      organizationId: "org-1",
      newRole: "member",
      actorRole: "owner",
    });

    expect(membershipRepo.save).toHaveBeenCalled();
    expect(membership.role).toBe("member");
  });
});
