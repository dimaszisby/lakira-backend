import crypto from "node:crypto";
import { jest } from "@jest/globals";
import { VerifyEmail } from "@/features/auth/application/use-cases/VerifyEmail.js";
import { UserRepository } from "@/features/auth/domain/repositories/UserRepository.js";
import { EmailVerificationTokenRepository } from "@/features/auth/domain/repositories/EmailVerificationTokenRepository.js";
import { AuthUser } from "@/features/auth/domain/entities/AuthUser.js";
import { EmailVerificationToken } from "@/features/auth/domain/entities/EmailVerificationToken.js";
import AppError from "@/utils/AppError.js";

const FROZEN_NOW = new Date("2026-05-08T10:00:00.000Z");
const RAW_TOKEN = "raw-token-value";
const TOKEN_HASH = crypto.createHash("sha256").update(RAW_TOKEN).digest("hex");

const makeUser = () =>
  AuthUser.fromPersistence({
    id: "user-1",
    email: "user@example.com",
    username: "tester",
    passwordHash: "hash",
    isPublicProfile: true,
    emailVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });

const makeToken = (
  overrides: Partial<{ expiresAt: Date; usedAt: Date | null }> = {},
) =>
  EmailVerificationToken.fromPersistence({
    id: "token-1",
    userId: "user-1",
    tokenHash: TOKEN_HASH,
    expiresAt:
      overrides.expiresAt ??
      new Date(FROZEN_NOW.getTime() + 24 * 60 * 60 * 1000),
    usedAt: overrides.usedAt !== undefined ? overrides.usedAt : null,
    createdAt: FROZEN_NOW,
  });

const build = () => {
  const userRepo: jest.Mocked<UserRepository> = {
    existsByEmail: jest.fn(),
    existsByUsername: jest.fn(),
    findById: jest.fn(),
    findByIds: jest.fn(),
    findByEmail: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const tokenRepo: jest.Mocked<EmailVerificationTokenRepository> = {
    save: jest.fn(),
    findByTokenHash: jest.fn(),
    revokeAllForUser: jest.fn(),
    markUsed: jest.fn(),
  };
  const sut = new VerifyEmail(userRepo, tokenRepo, { now: () => FROZEN_NOW });
  return { sut, userRepo, tokenRepo };
};

describe("VerifyEmail use case", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("sets emailVerifiedAt, saves user, and marks token used on happy path", async () => {
    const { sut, userRepo, tokenRepo } = build();
    const user = makeUser();
    tokenRepo.findByTokenHash.mockResolvedValue(makeToken());
    userRepo.findById.mockResolvedValue(user);
    userRepo.save.mockResolvedValue(user);

    await sut.execute({ token: RAW_TOKEN });

    expect(tokenRepo.findByTokenHash).toHaveBeenCalledWith(TOKEN_HASH);
    expect(userRepo.findById).toHaveBeenCalledWith("user-1");
    expect(user.emailVerifiedAt).toEqual(FROZEN_NOW);
    expect(userRepo.save).toHaveBeenCalledWith(user);
    expect(tokenRepo.markUsed).toHaveBeenCalledWith("token-1", FROZEN_NOW);
  });

  it.each([
    [
      "unknown token",
      (tokenRepo: jest.Mocked<EmailVerificationTokenRepository>) => {
        tokenRepo.findByTokenHash.mockResolvedValue(null);
      },
    ],
    [
      "used token",
      (tokenRepo: jest.Mocked<EmailVerificationTokenRepository>) => {
        tokenRepo.findByTokenHash.mockResolvedValue(
          makeToken({ usedAt: new Date(FROZEN_NOW.getTime() - 1000) }),
        );
      },
    ],
    [
      "expired token",
      (tokenRepo: jest.Mocked<EmailVerificationTokenRepository>) => {
        tokenRepo.findByTokenHash.mockResolvedValue(
          makeToken({
            expiresAt: new Date(FROZEN_NOW.getTime() - 1000),
          }),
        );
      },
    ],
  ])("throws generic 400 for %s", async (_label, setup) => {
    const { sut, tokenRepo } = build();
    setup(tokenRepo);

    await expect(sut.execute({ token: RAW_TOKEN })).rejects.toMatchObject({
      message: "Verification link is invalid or has expired.",
      statusCode: 400,
    });
  });

  it("collapses missing user to the same generic 400 (no info leak)", async () => {
    const { sut, userRepo, tokenRepo } = build();
    tokenRepo.findByTokenHash.mockResolvedValue(makeToken());
    userRepo.findById.mockResolvedValue(null);

    await expect(sut.execute({ token: RAW_TOKEN })).rejects.toMatchObject({
      message: "Verification link is invalid or has expired.",
      statusCode: 400,
    });
  });

  it("throws AppError instances", async () => {
    const { sut, tokenRepo } = build();
    tokenRepo.findByTokenHash.mockResolvedValue(null);

    await expect(sut.execute({ token: RAW_TOKEN })).rejects.toBeInstanceOf(
      AppError,
    );
  });
});
