import { jest } from "@jest/globals";
import { SwitchOrganization } from "@/features/auth/application/use-cases/SwitchOrganization.js";
import { IssueRefreshToken } from "@/features/auth/application/use-cases/IssueRefreshToken.js";
import { UserRepository } from "@/features/auth/domain/repositories/UserRepository.js";
import { MembershipRepository } from "@/features/auth/domain/repositories/MembershipRepository.js";
import { RefreshTokenRepository } from "@/features/auth/domain/repositories/RefreshTokenRepository.js";
import { TokenProvider } from "@/features/auth/application/ports/TokenProvider.js";
import { TokenHasher } from "@/features/auth/application/ports/TokenHasher.js";
import { AuthUser } from "@/features/auth/domain/entities/AuthUser.js";
import { Membership } from "@/features/auth/domain/entities/Membership.js";
import { RefreshToken } from "@/features/auth/domain/entities/RefreshToken.js";

const makeUser = () =>
  AuthUser.fromPersistence({
    id: "user-1",
    email: "user@example.com",
    username: "tester",
    passwordHash: "hash",
    isPublicProfile: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });

const makeMembership = (
  overrides: Partial<Parameters<typeof Membership.fromPersistence>[0]> = {},
) =>
  Membership.fromPersistence({
    id: "mem-1",
    userId: "user-1",
    organizationId: "org-2",
    role: "admin",
    status: "active",
    joinedAt: new Date(),
    ...overrides,
  });

const makeActiveToken = (familyId: string) =>
  RefreshToken.fromPersistence({
    id: `rt-${familyId}`,
    userId: "user-1",
    organizationId: "org-1",
    familyId,
    tokenHash: `hash-${familyId}`,
    issuedAt: new Date("2026-01-01"),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    replacedById: null,
    userAgent: null,
    ip: null,
  });

const build = () => {
  const membershipRepo: jest.Mocked<MembershipRepository> = {
    findById: jest.fn(),
    findByUserAndOrg: jest.fn(),
    findDefaultByUser: jest.fn(),
    findAllByUser: jest.fn(),
    findAllByOrganization: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    countByOrgAndRole: jest.fn(),
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
  const refreshTokenRepo: jest.Mocked<RefreshTokenRepository> = {
    save: jest
      .fn<RefreshTokenRepository["save"]>()
      .mockResolvedValue(undefined),
    findByTokenHash: jest.fn(),
    findByTokenHashForUpdate: jest.fn(),
    revokeFamily: jest
      .fn<RefreshTokenRepository["revokeFamily"]>()
      .mockResolvedValue(undefined),
    findActiveByUser: jest
      .fn<RefreshTokenRepository["findActiveByUser"]>()
      .mockResolvedValue([]),
  };
  const tokenProvider: jest.Mocked<TokenProvider> = {
    sign: jest.fn<TokenProvider["sign"]>().mockReturnValue("new-access-jwt"),
    verify: jest.fn(),
  };
  const tokenHasher: jest.Mocked<TokenHasher> = {
    generate: jest
      .fn<TokenHasher["generate"]>()
      .mockReturnValue("raw-refresh-token"),
    hash: jest.fn<TokenHasher["hash"]>().mockReturnValue("hashed-token"),
  };
  const issueRefreshToken = new IssueRefreshToken(
    refreshTokenRepo,
    tokenHasher,
    30,
  );
  const sut = new SwitchOrganization(
    membershipRepo,
    userRepo,
    refreshTokenRepo,
    tokenProvider,
    issueRefreshToken,
  );
  return { sut, membershipRepo, userRepo, refreshTokenRepo, tokenProvider };
};

const INPUT = {
  userId: "user-1",
  organizationId: "org-2",
  userAgent: "Mozilla/5.0",
  ip: "127.0.0.1",
};

describe("SwitchOrganization use case", () => {
  beforeEach(() => jest.resetAllMocks());

  it("switches org and returns new token pair", async () => {
    const { sut, membershipRepo, userRepo, refreshTokenRepo, tokenProvider } =
      build();
    membershipRepo.findByUserAndOrg.mockResolvedValue(makeMembership());
    userRepo.findById.mockResolvedValue(makeUser());
    refreshTokenRepo.findActiveByUser.mockResolvedValue([]);

    const result = await sut.execute(INPUT);

    expect(result.accessToken).toBe("new-access-jwt");
    expect(result.rawRefreshToken).toBeDefined();
    expect(tokenProvider.sign).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-2" }),
    );
    expect(refreshTokenRepo.save).toHaveBeenCalled();
  });

  it("throws 403 when no membership in target org", async () => {
    const { sut, membershipRepo } = build();
    membershipRepo.findByUserAndOrg.mockResolvedValue(null);

    await expect(sut.execute(INPUT)).rejects.toMatchObject({
      kind: "forbidden",
    });
  });

  it("throws 403 when membership is inactive", async () => {
    const { sut, membershipRepo } = build();
    membershipRepo.findByUserAndOrg.mockResolvedValue(
      makeMembership({ status: "removed" }),
    );

    await expect(sut.execute(INPUT)).rejects.toMatchObject({
      kind: "forbidden",
    });
  });

  it("throws 401 when user not found", async () => {
    const { sut, membershipRepo, userRepo } = build();
    membershipRepo.findByUserAndOrg.mockResolvedValue(makeMembership());
    userRepo.findById.mockResolvedValue(null);

    await expect(sut.execute(INPUT)).rejects.toMatchObject({
      kind: "unauthorized",
    });
  });

  it("revokes all active refresh families before issuing new tokens", async () => {
    const { sut, membershipRepo, userRepo, refreshTokenRepo } = build();
    membershipRepo.findByUserAndOrg.mockResolvedValue(makeMembership());
    userRepo.findById.mockResolvedValue(makeUser());
    refreshTokenRepo.findActiveByUser.mockResolvedValue([
      makeActiveToken("fam-1"),
      makeActiveToken("fam-2"),
    ]);

    await sut.execute(INPUT);

    expect(refreshTokenRepo.revokeFamily).toHaveBeenCalledWith("fam-1");
    expect(refreshTokenRepo.revokeFamily).toHaveBeenCalledWith("fam-2");
    expect(refreshTokenRepo.revokeFamily).toHaveBeenCalledTimes(2);
  });

  it("deduplicates family IDs when revoking", async () => {
    const { sut, membershipRepo, userRepo, refreshTokenRepo } = build();
    membershipRepo.findByUserAndOrg.mockResolvedValue(makeMembership());
    userRepo.findById.mockResolvedValue(makeUser());
    refreshTokenRepo.findActiveByUser.mockResolvedValue([
      makeActiveToken("fam-1"),
      makeActiveToken("fam-1"),
    ]);

    await sut.execute(INPUT);

    expect(refreshTokenRepo.revokeFamily).toHaveBeenCalledTimes(1);
  });

  it("works when user has no existing refresh tokens", async () => {
    const { sut, membershipRepo, userRepo, refreshTokenRepo } = build();
    membershipRepo.findByUserAndOrg.mockResolvedValue(makeMembership());
    userRepo.findById.mockResolvedValue(makeUser());
    refreshTokenRepo.findActiveByUser.mockResolvedValue([]);

    const result = await sut.execute(INPUT);

    expect(refreshTokenRepo.revokeFamily).not.toHaveBeenCalled();
    expect(result.accessToken).toBeDefined();
  });
});
