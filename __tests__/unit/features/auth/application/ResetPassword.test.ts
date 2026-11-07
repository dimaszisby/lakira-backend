import crypto from "node:crypto";
import { ValidationError } from "@/shared/domain/errors/DomainError.js";
import { jest } from "@jest/globals";
import { ResetPassword } from "@/features/auth/application/use-cases/ResetPassword.js";
import { UserRepository } from "@/features/auth/domain/repositories/UserRepository.js";
import { PasswordResetTokenRepository } from "@/features/auth/domain/repositories/PasswordResetTokenRepository.js";
import { PasswordHasher } from "@/features/auth/application/ports/PasswordHasher.js";
import { AuthUser } from "@/features/auth/domain/entities/AuthUser.js";
import { PasswordResetToken } from "@/features/auth/domain/entities/PasswordResetToken.js";

const FROZEN_NOW = new Date("2026-04-24T10:00:00.000Z");
const RAW_TOKEN = "raw-token-value";
const TOKEN_HASH = crypto.createHash("sha256").update(RAW_TOKEN).digest("hex");

const makeUser = () =>
  AuthUser.fromPersistence({
    id: "user-1",
    email: "user@example.com",
    username: "tester",
    passwordHash: "old-hash",
    isPublicProfile: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });

const makeToken = (
  overrides: Partial<{
    expiresAt: Date;
    usedAt: Date | null;
    userId: string;
  }> = {},
) =>
  PasswordResetToken.fromPersistence({
    id: "token-1",
    userId: overrides.userId ?? "user-1",
    tokenHash: TOKEN_HASH,
    expiresAt:
      overrides.expiresAt ?? new Date(FROZEN_NOW.getTime() + 5 * 60 * 1000),
    usedAt: overrides.usedAt ?? null,
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
  const tokenRepo: jest.Mocked<PasswordResetTokenRepository> = {
    findByTokenHash: jest.fn(),
    create: jest.fn(),
    markUsed: jest.fn(),
    invalidateAllForUser: jest.fn(),
  };
  const hasher: jest.Mocked<PasswordHasher> = {
    hash: jest.fn(),
    compare: jest.fn(),
  };
  const sut = new ResetPassword(userRepo, tokenRepo, hasher, {
    now: () => FROZEN_NOW,
  });
  return { sut, userRepo, tokenRepo, hasher };
};

describe("ResetPassword use case", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("hashes new password, updates user, and marks token used on happy path", async () => {
    const { sut, userRepo, tokenRepo, hasher } = build();
    const user = makeUser();
    userRepo.findById.mockResolvedValue(user);
    tokenRepo.findByTokenHash.mockResolvedValue(makeToken());
    hasher.hash.mockResolvedValue("new-hash");
    userRepo.save.mockResolvedValue(user);

    await sut.execute({
      token: RAW_TOKEN,
      password: "NewPassword123!",
      passwordConfirmation: "NewPassword123!",
    });

    expect(tokenRepo.findByTokenHash).toHaveBeenCalledWith(TOKEN_HASH);
    expect(hasher.hash).toHaveBeenCalledWith("NewPassword123!");
    expect(userRepo.save).toHaveBeenCalledWith(user);
    expect(user.passwordHash).toBe("new-hash");
    expect(tokenRepo.markUsed).toHaveBeenCalledWith("token-1", FROZEN_NOW);
  });

  it("throws when password and confirmation mismatch", async () => {
    const { sut, tokenRepo } = build();

    await expect(
      sut.execute({
        token: RAW_TOKEN,
        password: "a",
        passwordConfirmation: "b",
      }),
    ).rejects.toMatchObject({
      message: "Passwords do not match",
      kind: "validation",
    });
    expect(tokenRepo.findByTokenHash).not.toHaveBeenCalled();
  });

  it.each([
    [
      "unknown token",
      (tokenRepo: jest.Mocked<PasswordResetTokenRepository>) => {
        tokenRepo.findByTokenHash.mockResolvedValue(null);
      },
    ],
    [
      "used token",
      (tokenRepo: jest.Mocked<PasswordResetTokenRepository>) => {
        tokenRepo.findByTokenHash.mockResolvedValue(
          makeToken({ usedAt: new Date(FROZEN_NOW.getTime() - 60 * 1000) }),
        );
      },
    ],
    [
      "expired token",
      (tokenRepo: jest.Mocked<PasswordResetTokenRepository>) => {
        tokenRepo.findByTokenHash.mockResolvedValue(
          makeToken({
            expiresAt: new Date(FROZEN_NOW.getTime() - 60 * 1000),
          }),
        );
      },
    ],
  ])(
    "throws generic 'Invalid or expired reset token' for %s",
    async (_label, setup) => {
      const { sut, tokenRepo } = build();
      setup(tokenRepo);

      await expect(
        sut.execute({
          token: RAW_TOKEN,
          password: "NewPassword123!",
          passwordConfirmation: "NewPassword123!",
        }),
      ).rejects.toMatchObject({
        message: "Invalid or expired reset token",
        kind: "validation",
      });
    },
  );

  it("collapses missing user to the same generic error (no info leak)", async () => {
    const { sut, userRepo, tokenRepo } = build();
    tokenRepo.findByTokenHash.mockResolvedValue(makeToken());
    userRepo.findById.mockResolvedValue(null);

    await expect(
      sut.execute({
        token: RAW_TOKEN,
        password: "NewPassword123!",
        passwordConfirmation: "NewPassword123!",
      }),
    ).rejects.toMatchObject({
      message: "Invalid or expired reset token",
      kind: "validation",
    });
  });

  it("rejects with a ValidationError", async () => {
    const { sut } = build();

    await expect(
      sut.execute({
        token: RAW_TOKEN,
        password: "a",
        passwordConfirmation: "b",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
