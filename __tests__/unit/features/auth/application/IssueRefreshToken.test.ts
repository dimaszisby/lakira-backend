import { jest } from "@jest/globals";
import { IssueRefreshToken } from "@/features/auth/application/use-cases/IssueRefreshToken.js";
import { RefreshTokenRepository } from "@/features/auth/domain/repositories/RefreshTokenRepository.js";
import { TokenHasher } from "@/features/auth/application/ports/TokenHasher.js";

const build = () => {
  const refreshTokenRepo: jest.Mocked<RefreshTokenRepository> = {
    save: jest
      .fn<RefreshTokenRepository["save"]>()
      .mockResolvedValue(undefined),
    findByTokenHash: jest.fn(),
    findByTokenHashForUpdate: jest.fn(),
    revokeFamily: jest.fn(),
    revokeAllForUser: jest.fn(),
    findActiveByUser: jest.fn(),
  };
  const tokenHasher: jest.Mocked<TokenHasher> = {
    generate: jest
      .fn<TokenHasher["generate"]>()
      .mockReturnValue("raw-token-abc"),
    hash: jest.fn<TokenHasher["hash"]>().mockReturnValue("hashed-abc"),
  };
  const sut = new IssueRefreshToken(refreshTokenRepo, tokenHasher, 30);
  return { sut, refreshTokenRepo, tokenHasher };
};

describe("IssueRefreshToken use case", () => {
  beforeEach(() => jest.resetAllMocks());

  it("issues a token and persists it", async () => {
    const { sut, refreshTokenRepo, tokenHasher } = build();

    const result = await sut.execute({ userId: "user-1" });

    expect(tokenHasher.generate).toHaveBeenCalled();
    expect(tokenHasher.hash).toHaveBeenCalledWith("raw-token-abc");
    expect(refreshTokenRepo.save).toHaveBeenCalledTimes(1);
    expect(result.rawToken).toBe("raw-token-abc");
    expect(result.refreshToken.userId).toBe("user-1");
    expect(result.refreshToken.tokenHash).toBe("hashed-abc");
  });

  it("uses provided familyId instead of generating one", async () => {
    const { sut } = build();

    const result = await sut.execute({
      userId: "user-1",
      familyId: "existing-family",
    });

    expect(result.refreshToken.familyId).toBe("existing-family");
  });

  it("sets expiry based on ttlDays", async () => {
    const { sut } = build();

    const before = Date.now();
    const result = await sut.execute({ userId: "user-1" });
    const expectedMin = before + 30 * 24 * 60 * 60 * 1000 - 1000;

    expect(result.refreshToken.expiresAt.getTime()).toBeGreaterThanOrEqual(
      expectedMin,
    );
  });

  it("stores userAgent and ip when provided", async () => {
    const { sut } = build();

    const result = await sut.execute({
      userId: "user-1",
      userAgent: "TestAgent",
      ip: "10.0.0.1",
    });

    expect(result.refreshToken.userAgent).toBe("TestAgent");
    expect(result.refreshToken.ip).toBe("10.0.0.1");
  });
});
