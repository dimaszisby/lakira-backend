import crypto from "node:crypto";
import { ValidationError } from "@/shared/domain/errors/DomainError.js";
import { jest } from "@jest/globals";
import { ResetPassword } from "@/features/auth/application/use-cases/ResetPassword.js";
import { UserRepository } from "@/features/auth/domain/repositories/UserRepository.js";
import { PasswordResetTokenRepository } from "@/features/auth/domain/repositories/PasswordResetTokenRepository.js";
import { PasswordHasher } from "@/features/auth/application/ports/PasswordHasher.js";
import { RefreshTokenRepository } from "@/features/auth/domain/repositories/RefreshTokenRepository.js";
import type { TransactionPort } from "@/shared/application/ports/TransactionPort.js";
import logger from "@/utils/logger.js";
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
  const refreshTokenRepo: jest.Mocked<RefreshTokenRepository> = {
    save: jest.fn(),
    findByTokenHash: jest.fn(),
    findByTokenHashForUpdate: jest.fn(),
    revokeFamily: jest.fn(),
    revokeAllForUser: jest.fn(),
    findActiveByUser: jest.fn(),
  };
  const tx = {
    runInTransaction: jest.fn().mockImplementation((fn: any) => fn("fake-tx")),
  } as unknown as jest.Mocked<TransactionPort>;
  const sut = new ResetPassword(
    userRepo,
    tokenRepo,
    hasher,
    refreshTokenRepo,
    tx,
    { now: () => FROZEN_NOW },
  );
  return { sut, userRepo, tokenRepo, hasher, refreshTokenRepo, tx };
};

const VALID_INPUT = {
  token: RAW_TOKEN,
  password: "NewPassword123!",
  passwordConfirmation: "NewPassword123!",
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

    await sut.execute(VALID_INPUT);

    expect(tokenRepo.findByTokenHash).toHaveBeenCalledWith(TOKEN_HASH);
    expect(hasher.hash).toHaveBeenCalledWith("NewPassword123!");
    expect(userRepo.save).toHaveBeenCalledWith(user, "fake-tx");
    expect(user.passwordHash).toBe("new-hash");
    expect(tokenRepo.markUsed).toHaveBeenCalledWith(
      "token-1",
      FROZEN_NOW,
      "fake-tx",
    );
  });

  it("ends every session of the user in the transaction that saves the password (ADR-0097)", async () => {
    const { sut, userRepo, tokenRepo, hasher, refreshTokenRepo, tx } = build();
    const info = jest.spyOn(logger, "info").mockImplementation(() => logger);
    const user = makeUser();
    userRepo.findById.mockResolvedValue(user);
    tokenRepo.findByTokenHash.mockResolvedValue(makeToken());
    hasher.hash.mockResolvedValue("new-hash");
    const writes: string[] = [];
    userRepo.save.mockImplementation(async () => {
      writes.push("save");
      return user;
    });
    refreshTokenRepo.revokeAllForUser.mockImplementation(async () => {
      writes.push("revokeAllForUser");
    });
    tokenRepo.markUsed.mockImplementation(async () => {
      writes.push("markUsed");
    });

    await sut.execute(VALID_INPUT);

    expect(tx.runInTransaction).toHaveBeenCalledTimes(1);
    expect(refreshTokenRepo.revokeAllForUser).toHaveBeenCalledWith(
      "user-1",
      FROZEN_NOW,
      "fake-tx",
    );
    // Sessions end before the user row is written, in UpdateProfile's lock order.
    expect(writes).toEqual(["revokeAllForUser", "save", "markUsed"]);
    expect(info).toHaveBeenCalledWith("auth.sessions.revoked", {
      userId: "user-1",
      reason: "password_reset",
    });
    info.mockRestore();
  });

  it("hashes before the transaction opens, so no connection waits on bcrypt", async () => {
    const { sut, userRepo, tokenRepo, hasher, tx } = build();
    userRepo.findById.mockResolvedValue(makeUser());
    tokenRepo.findByTokenHash.mockResolvedValue(makeToken());
    hasher.hash.mockResolvedValue("new-hash");

    await sut.execute(VALID_INPUT);

    expect(hasher.hash.mock.invocationCallOrder[0]).toBeLessThan(
      tx.runInTransaction.mock.invocationCallOrder[0],
    );
  });

  it("rejects when a write in the transaction fails, so the reset is not reported done", async () => {
    const { sut, userRepo, tokenRepo, hasher, refreshTokenRepo } = build();
    userRepo.findById.mockResolvedValue(makeUser());
    tokenRepo.findByTokenHash.mockResolvedValue(makeToken());
    hasher.hash.mockResolvedValue("new-hash");
    refreshTokenRepo.revokeAllForUser.mockRejectedValue(new Error("db down"));

    await expect(sut.execute(VALID_INPUT)).rejects.toThrow("db down");
    expect(userRepo.save).not.toHaveBeenCalled();
    expect(tokenRepo.markUsed).not.toHaveBeenCalled();
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
      const { sut, tokenRepo, refreshTokenRepo, tx } = build();
      setup(tokenRepo);

      await expect(sut.execute(VALID_INPUT)).rejects.toMatchObject({
        message: "Invalid or expired reset token",
        kind: "validation",
      });
      // A token that cannot reset the password ends no session either.
      expect(tx.runInTransaction).not.toHaveBeenCalled();
      expect(refreshTokenRepo.revokeAllForUser).not.toHaveBeenCalled();
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
