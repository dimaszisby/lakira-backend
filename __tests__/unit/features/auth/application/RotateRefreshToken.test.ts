import { jest } from "@jest/globals";
import { UnauthorizedError } from "@/shared/domain/errors/DomainError.js";
import { RotateRefreshToken } from "@/features/auth/application/use-cases/RotateRefreshToken.js";
import { IssueRefreshToken } from "@/features/auth/application/use-cases/IssueRefreshToken.js";
import { RefreshTokenRepository } from "@/features/auth/domain/repositories/RefreshTokenRepository.js";
import type { TransactionPort } from "@/shared/application/ports/TransactionPort.js";
import { UserRepository } from "@/features/auth/domain/repositories/UserRepository.js";
import { MembershipRepository } from "@/features/auth/domain/repositories/MembershipRepository.js";
import { TokenProvider } from "@/features/auth/application/ports/TokenProvider.js";
import { TokenHasher } from "@/features/auth/application/ports/TokenHasher.js";
import { RefreshToken } from "@/features/auth/domain/entities/RefreshToken.js";
import { AuthUser } from "@/features/auth/domain/entities/AuthUser.js";
import { Membership } from "@/features/auth/domain/entities/Membership.js";
import crypto from "node:crypto";

const RAW_TOKEN = "test-raw-token-base64url";
const TOKEN_HASH = crypto.createHash("sha256").update(RAW_TOKEN).digest("hex");

const makeRefreshToken = (
  overrides: Partial<Parameters<typeof RefreshToken.fromPersistence>[0]> = {},
) =>
  RefreshToken.fromPersistence({
    id: "rt-1",
    userId: "user-1",
    organizationId: "org-1",
    familyId: "fam-1",
    tokenHash: TOKEN_HASH,
    issuedAt: new Date("2026-01-01"),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    replacedById: null,
    userAgent: null,
    ip: null,
    ...overrides,
  });

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

const makeMembership = () =>
  Membership.fromPersistence({
    id: "mem-1",
    userId: "user-1",
    organizationId: "org-1",
    role: "owner",
    status: "active",
    joinedAt: new Date(),
  });

const build = () => {
  const refreshTokenRepo: jest.Mocked<RefreshTokenRepository> = {
    save: jest
      .fn<RefreshTokenRepository["save"]>()
      .mockResolvedValue(undefined),
    findByTokenHash: jest.fn(),
    findByTokenHashForUpdate: jest.fn(),
    revokeFamily: jest
      .fn<RefreshTokenRepository["revokeFamily"]>()
      .mockResolvedValue(undefined),
    findActiveByUser: jest.fn(),
  };
  const tx = {
    runInTransaction: jest.fn().mockImplementation((fn: any) => fn("fake-tx")),
  } as unknown as jest.Mocked<TransactionPort>;
  const userRepo: jest.Mocked<UserRepository> = {
    existsByEmail: jest.fn(),
    existsByUsername: jest.fn(),
    findById: jest.fn(),
    findByIds: jest.fn(),
    findByEmail: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const membershipRepo: jest.Mocked<MembershipRepository> = {
    findById: jest.fn(),
    findByUserAndOrg: jest.fn(),
    findDefaultByUser: jest.fn(),
    findAllByUser: jest.fn(),
    findAllByOrganization: jest.fn(),
    findActivePageByUser: jest.fn(),
    findPageByOrganization: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    countByOrgAndRole: jest.fn(),
    delete: jest.fn(),
  };
  const tokenProvider: jest.Mocked<TokenProvider> = {
    sign: jest.fn<TokenProvider["sign"]>().mockReturnValue("new-access-jwt"),
    verify: jest.fn(),
  };
  const tokenHasher: jest.Mocked<TokenHasher> = {
    generate: jest
      .fn<TokenHasher["generate"]>()
      .mockReturnValue("new-raw-token"),
    hash: jest
      .fn<TokenHasher["hash"]>()
      .mockImplementation((raw) =>
        crypto.createHash("sha256").update(raw).digest("hex"),
      ),
  };
  const issueRefreshToken = new IssueRefreshToken(
    refreshTokenRepo,
    tokenHasher,
    30,
  );
  const sut = new RotateRefreshToken(
    refreshTokenRepo,
    userRepo,
    membershipRepo,
    tokenProvider,
    tokenHasher,
    issueRefreshToken,
    tx,
  );
  return { sut, refreshTokenRepo, userRepo, membershipRepo, tokenProvider };
};

describe("RotateRefreshToken use case", () => {
  beforeEach(() => jest.resetAllMocks());

  it("rotates a valid refresh token and returns new tokens", async () => {
    const { sut, refreshTokenRepo, userRepo, membershipRepo } = build();
    refreshTokenRepo.findByTokenHashForUpdate.mockResolvedValue(
      makeRefreshToken(),
    );
    userRepo.findById.mockResolvedValue(makeUser());
    membershipRepo.findByUserAndOrg.mockResolvedValue(makeMembership());

    const result = await sut.execute({ rawToken: RAW_TOKEN });

    expect(result.accessToken).toBe("new-access-jwt");
    expect(result.rawRefreshToken).toBeDefined();
    expect(refreshTokenRepo.save).toHaveBeenCalledTimes(2);
  });

  it("throws 401 when token hash not found", async () => {
    const { sut, refreshTokenRepo } = build();
    refreshTokenRepo.findByTokenHashForUpdate.mockResolvedValue(null);

    await expect(sut.execute({ rawToken: "unknown" })).rejects.toMatchObject({
      kind: "unauthorized",
    });
  });

  it("revokes entire family on reuse detection", async () => {
    const { sut, refreshTokenRepo } = build();
    const revoked = makeRefreshToken({ revokedAt: new Date() });
    refreshTokenRepo.findByTokenHashForUpdate.mockResolvedValue(revoked);

    await expect(sut.execute({ rawToken: RAW_TOKEN })).rejects.toMatchObject({
      kind: "unauthorized",
    });

    expect(refreshTokenRepo.revokeFamily).toHaveBeenCalledWith("fam-1");
  });

  it("revokes family and throws 401 when token is expired", async () => {
    const { sut, refreshTokenRepo } = build();
    const expired = makeRefreshToken({
      expiresAt: new Date("2020-01-01"),
    });
    refreshTokenRepo.findByTokenHashForUpdate.mockResolvedValue(expired);

    await expect(sut.execute({ rawToken: RAW_TOKEN })).rejects.toMatchObject({
      kind: "unauthorized",
    });

    expect(refreshTokenRepo.revokeFamily).toHaveBeenCalledWith("fam-1");
  });

  it("throws 401 when user not found", async () => {
    const { sut, refreshTokenRepo, userRepo } = build();
    refreshTokenRepo.findByTokenHashForUpdate.mockResolvedValue(
      makeRefreshToken(),
    );
    userRepo.findById.mockResolvedValue(null);

    await expect(sut.execute({ rawToken: RAW_TOKEN })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("throws 401 when org membership is inactive", async () => {
    const { sut, refreshTokenRepo, userRepo, membershipRepo } = build();
    refreshTokenRepo.findByTokenHashForUpdate.mockResolvedValue(
      makeRefreshToken({ organizationId: "org-1" }),
    );
    userRepo.findById.mockResolvedValue(makeUser());
    membershipRepo.findByUserAndOrg.mockResolvedValue(null);

    await expect(sut.execute({ rawToken: RAW_TOKEN })).rejects.toMatchObject({
      kind: "unauthorized",
    });
  });

  it("throws 401 when legacy token has no default membership", async () => {
    const { sut, refreshTokenRepo, userRepo, membershipRepo } = build();
    refreshTokenRepo.findByTokenHashForUpdate.mockResolvedValue(
      makeRefreshToken({ organizationId: null }),
    );
    userRepo.findById.mockResolvedValue(makeUser());
    membershipRepo.findDefaultByUser.mockResolvedValue(null);

    await expect(sut.execute({ rawToken: RAW_TOKEN })).rejects.toMatchObject({
      kind: "unauthorized",
    });
  });
});
