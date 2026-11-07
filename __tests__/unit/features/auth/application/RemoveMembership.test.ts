import { jest } from "@jest/globals";
import { RemoveMembership } from "@/features/auth/application/use-cases/RemoveMembership.js";
import { MembershipRepository } from "@/features/auth/domain/repositories/MembershipRepository.js";
import { Membership } from "@/features/auth/domain/entities/Membership.js";

const makeMembership = (
  overrides: Partial<{
    userId: string;
    role: "owner" | "admin" | "member";
  }> = {},
) =>
  Membership.fromPersistence({
    id: "mem-target",
    userId: overrides.userId ?? "user-target",
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
  const sut = new RemoveMembership(membershipRepo);
  return { sut, membershipRepo };
};

describe("RemoveMembership", () => {
  beforeEach(() => jest.resetAllMocks());

  it("removes a member when actor is owner", async () => {
    const { sut, membershipRepo } = build();
    membershipRepo.findById.mockResolvedValue(makeMembership());
    membershipRepo.delete.mockResolvedValue(undefined);

    await sut.execute({
      membershipId: "mem-target",
      organizationId: "org-1",
      actorRole: "owner",
      actorUserId: "user-owner",
    });

    expect(membershipRepo.delete).toHaveBeenCalledWith("mem-target");
  });

  it("throws 403 when actor is not an owner", async () => {
    const { sut } = build();

    await expect(
      sut.execute({
        membershipId: "mem-target",
        organizationId: "org-1",
        actorRole: "admin",
        actorUserId: "user-admin",
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
        actorRole: "owner",
        actorUserId: "user-owner",
      }),
    ).rejects.toMatchObject({ kind: "not_found" });
  });

  it("throws 404 when membership belongs to a different org", async () => {
    const { sut, membershipRepo } = build();
    membershipRepo.findById.mockResolvedValue(makeMembership());

    await expect(
      sut.execute({
        membershipId: "mem-target",
        organizationId: "org-other",
        actorRole: "owner",
        actorUserId: "user-owner",
      }),
    ).rejects.toMatchObject({ kind: "not_found" });
  });

  it("throws 400 when trying to remove yourself", async () => {
    const { sut, membershipRepo } = build();
    membershipRepo.findById.mockResolvedValue(
      makeMembership({ userId: "user-owner" }),
    );

    await expect(
      sut.execute({
        membershipId: "mem-target",
        organizationId: "org-1",
        actorRole: "owner",
        actorUserId: "user-owner",
      }),
    ).rejects.toMatchObject({ kind: "validation" });
  });

  it("throws 400 when removing the last owner", async () => {
    const { sut, membershipRepo } = build();
    membershipRepo.findById.mockResolvedValue(
      makeMembership({ role: "owner" }),
    );
    membershipRepo.countByOrgAndRole.mockResolvedValue(1);

    await expect(
      sut.execute({
        membershipId: "mem-target",
        organizationId: "org-1",
        actorRole: "owner",
        actorUserId: "user-owner",
      }),
    ).rejects.toMatchObject({ kind: "validation" });
  });

  it("allows removing an owner when there are multiple owners", async () => {
    const { sut, membershipRepo } = build();
    membershipRepo.findById.mockResolvedValue(
      makeMembership({ role: "owner" }),
    );
    membershipRepo.countByOrgAndRole.mockResolvedValue(2);
    membershipRepo.delete.mockResolvedValue(undefined);

    await sut.execute({
      membershipId: "mem-target",
      organizationId: "org-1",
      actorRole: "owner",
      actorUserId: "user-owner",
    });

    expect(membershipRepo.delete).toHaveBeenCalledWith("mem-target");
  });
});
