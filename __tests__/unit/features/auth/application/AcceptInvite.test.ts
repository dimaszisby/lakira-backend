import { jest } from "@jest/globals";
import crypto from "node:crypto";
import { AcceptInvite } from "@/features/auth/application/use-cases/AcceptInvite.js";
import { OrganizationInviteRepository } from "@/features/auth/domain/repositories/OrganizationInviteRepository.js";
import { MembershipRepository } from "@/features/auth/domain/repositories/MembershipRepository.js";
import { UserRepository } from "@/features/auth/domain/repositories/UserRepository.js";
import { OrganizationInvite } from "@/features/auth/domain/entities/OrganizationInvite.js";
import { Membership } from "@/features/auth/domain/entities/Membership.js";
import { AuthUser } from "@/features/auth/domain/entities/AuthUser.js";
import AppError from "@/utils/AppError.js";

const RAW_TOKEN = "test-raw-token-value";
const TOKEN_HASH = crypto.createHash("sha256").update(RAW_TOKEN).digest("hex");

const NOW = new Date("2030-06-01T00:00:00Z");
const FUTURE = new Date("2030-06-08T00:00:00Z");
const PAST = new Date("2020-01-01T00:00:00Z");

const makeInvite = (
  overrides: Partial<{ expiresAt: Date; acceptedAt: Date | null }> = {},
) =>
  OrganizationInvite.fromPersistence({
    id: "invite-1",
    organizationId: "org-1",
    email: "user@example.com",
    role: "member",
    tokenHash: TOKEN_HASH,
    expiresAt: overrides.expiresAt ?? FUTURE,
    acceptedAt: overrides.acceptedAt ?? null,
    createdAt: NOW,
  });

const makeUser = (email = "user@example.com") =>
  AuthUser.fromPersistence({
    id: "user-1",
    email,
    username: "tester",
    passwordHash: "hash",
    isPublicProfile: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });

const makeMembership = () =>
  Membership.fromPersistence({
    id: "mem-1",
    userId: "user-1",
    organizationId: "org-1",
    role: "member",
    status: "active",
    joinedAt: new Date(),
  });

const build = () => {
  const inviteRepo: jest.Mocked<OrganizationInviteRepository> = {
    save: jest.fn(),
    findByTokenHash: jest.fn(),
    findPendingByEmailAndOrg: jest.fn(),
    deleteExpiredPendingByEmailAndOrg: jest.fn(),
    markAccepted: jest.fn(),
  };
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
  const userRepo: jest.Mocked<UserRepository> = {
    existsByEmail: jest.fn(),
    existsByUsername: jest.fn(),
    findById: jest.fn(),
    findByIds: jest.fn(),
    findByEmail: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const sut = new AcceptInvite(inviteRepo, membershipRepo, userRepo);
  return { sut, inviteRepo, membershipRepo, userRepo };
};

describe("AcceptInvite", () => {
  beforeEach(() => jest.resetAllMocks());

  it("creates membership and marks invite accepted", async () => {
    const { sut, inviteRepo, membershipRepo, userRepo } = build();
    inviteRepo.findByTokenHash.mockResolvedValue(makeInvite());
    userRepo.findById.mockResolvedValue(makeUser());
    membershipRepo.findByUserAndOrg.mockResolvedValue(null);
    membershipRepo.create.mockResolvedValue(makeMembership());
    inviteRepo.markAccepted.mockResolvedValue(undefined);

    await sut.execute({ rawToken: RAW_TOKEN, userId: "user-1" });

    expect(inviteRepo.findByTokenHash).toHaveBeenCalledWith(TOKEN_HASH);
    expect(membershipRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        organizationId: "org-1",
        role: "member",
        status: "active",
      }),
    );
    expect(inviteRepo.markAccepted).toHaveBeenCalledWith(
      "invite-1",
      expect.any(Date),
    );
  });

  it("throws generic 400 for invalid token", async () => {
    const { sut, inviteRepo } = build();
    inviteRepo.findByTokenHash.mockResolvedValue(null);

    await expect(
      sut.execute({ rawToken: "bogus-token", userId: "user-1" }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid or expired invitation",
    });
  });

  it("throws generic 400 for already accepted invite", async () => {
    const { sut, inviteRepo } = build();
    inviteRepo.findByTokenHash.mockResolvedValue(
      makeInvite({ acceptedAt: NOW }),
    );

    await expect(
      sut.execute({ rawToken: RAW_TOKEN, userId: "user-1" }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid or expired invitation",
    });
  });

  it("throws generic 400 for expired invite", async () => {
    const { sut, inviteRepo } = build();
    inviteRepo.findByTokenHash.mockResolvedValue(
      makeInvite({ expiresAt: PAST }),
    );

    await expect(
      sut.execute({ rawToken: RAW_TOKEN, userId: "user-1" }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid or expired invitation",
    });
  });

  it("throws generic 400 when user email does not match invite", async () => {
    const { sut, inviteRepo, userRepo } = build();
    inviteRepo.findByTokenHash.mockResolvedValue(makeInvite());
    userRepo.findById.mockResolvedValue(makeUser("other@example.com"));

    await expect(
      sut.execute({ rawToken: RAW_TOKEN, userId: "user-1" }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid or expired invitation",
    });
  });

  it("marks accepted without creating membership if user already a member", async () => {
    const { sut, inviteRepo, membershipRepo, userRepo } = build();
    inviteRepo.findByTokenHash.mockResolvedValue(makeInvite());
    userRepo.findById.mockResolvedValue(makeUser());
    membershipRepo.findByUserAndOrg.mockResolvedValue(makeMembership());
    inviteRepo.markAccepted.mockResolvedValue(undefined);

    await sut.execute({ rawToken: RAW_TOKEN, userId: "user-1" });

    expect(membershipRepo.create).not.toHaveBeenCalled();
    expect(inviteRepo.markAccepted).toHaveBeenCalled();
  });

  it("throws 404 when user not found", async () => {
    const { sut, inviteRepo, userRepo } = build();
    inviteRepo.findByTokenHash.mockResolvedValue(makeInvite());
    userRepo.findById.mockResolvedValue(null);

    await expect(
      sut.execute({ rawToken: RAW_TOKEN, userId: "user-1" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
