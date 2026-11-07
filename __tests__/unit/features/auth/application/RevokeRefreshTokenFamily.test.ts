import { jest } from "@jest/globals";
import { UnauthorizedError } from "@/shared/domain/errors/DomainError.js";
import { RevokeRefreshTokenFamily } from "@/features/auth/application/use-cases/RevokeRefreshTokenFamily.js";
import { RefreshTokenRepository } from "@/features/auth/domain/repositories/RefreshTokenRepository.js";
import { TokenHasher } from "@/features/auth/application/ports/TokenHasher.js";
import { RefreshToken } from "@/features/auth/domain/entities/RefreshToken.js";

const build = () => {
  const refreshTokenRepo: jest.Mocked<RefreshTokenRepository> = {
    save: jest.fn(),
    findByTokenHash: jest.fn(),
    findByTokenHashForUpdate: jest.fn(),
    revokeFamily: jest
      .fn<RefreshTokenRepository["revokeFamily"]>()
      .mockResolvedValue(undefined),
    findActiveByUser: jest.fn(),
  };
  const tokenHasher: jest.Mocked<TokenHasher> = {
    generate: jest.fn<TokenHasher["generate"]>().mockReturnValue("raw"),
    hash: jest.fn<TokenHasher["hash"]>().mockReturnValue("hashed"),
  };
  const sut = new RevokeRefreshTokenFamily(refreshTokenRepo, tokenHasher);
  return { sut, refreshTokenRepo, tokenHasher };
};

const makeToken = () =>
  RefreshToken.fromPersistence({
    id: "rt-1",
    userId: "user-1",
    organizationId: "org-1",
    familyId: "fam-1",
    tokenHash: "hashed",
    issuedAt: new Date("2026-01-01"),
    expiresAt: new Date("2026-01-31"),
    revokedAt: null,
    replacedById: null,
    userAgent: null,
    ip: null,
  });

describe("RevokeRefreshTokenFamily use case", () => {
  beforeEach(() => jest.resetAllMocks());

  it("hashes the raw token and revokes the family", async () => {
    const { sut, refreshTokenRepo, tokenHasher } = build();
    refreshTokenRepo.findByTokenHash.mockResolvedValue(makeToken());

    await sut.execute("raw-token");

    expect(tokenHasher.hash).toHaveBeenCalledWith("raw-token");
    expect(refreshTokenRepo.findByTokenHash).toHaveBeenCalledWith("hashed");
    expect(refreshTokenRepo.revokeFamily).toHaveBeenCalledWith("fam-1");
  });

  it("throws 401 when token not found", async () => {
    const { sut, refreshTokenRepo } = build();
    refreshTokenRepo.findByTokenHash.mockResolvedValue(null);

    await expect(sut.execute("unknown")).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    await expect(sut.execute("unknown")).rejects.toMatchObject({
      kind: "unauthorized",
    });
  });
});
