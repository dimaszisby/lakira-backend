import { jest } from "@jest/globals";
import {
  ConflictError,
  NotFoundError,
} from "@/shared/domain/errors/DomainError.js";
import { UpdateProfile } from "@/features/auth/application/use-cases/UpdateProfile.js";
import { UserRepository } from "@/features/auth/domain/repositories/UserRepository.js";
import { PasswordHasher } from "@/features/auth/application/ports/PasswordHasher.js";
import { AuthUser } from "@/features/auth/domain/entities/AuthUser.js";
import { RefreshTokenRepository } from "@/features/auth/domain/repositories/RefreshTokenRepository.js";
import { IssueRefreshToken } from "@/features/auth/application/use-cases/IssueRefreshToken.js";
import type { TransactionPort } from "@/shared/application/ports/TransactionPort.js";
import logger from "@/utils/logger.js";

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

const build = () => {
  const repo: jest.Mocked<UserRepository> = {
    existsByEmail: jest.fn(),
    existsByUsername: jest.fn(),
    findById: jest.fn(),
    findByIds: jest.fn(),
    findByEmail: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
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
  const issueRefreshToken = {
    executeInTransaction: jest.fn<IssueRefreshToken["executeInTransaction"]>(),
  } as unknown as jest.Mocked<IssueRefreshToken>;
  issueRefreshToken.executeInTransaction.mockResolvedValue({
    rawToken: "new-raw-refresh",
  } as Awaited<ReturnType<IssueRefreshToken["executeInTransaction"]>>);
  const tx = {
    runInTransaction: jest.fn().mockImplementation((fn: any) => fn("fake-tx")),
  } as unknown as jest.Mocked<TransactionPort>;
  const sut = new UpdateProfile(
    repo,
    hasher,
    refreshTokenRepo,
    issueRefreshToken,
    tx,
  );
  return { sut, repo, hasher, refreshTokenRepo, issueRefreshToken, tx };
};

const SESSION = {
  userId: "user-1",
  organizationId: "org-1",
  userAgent: "jest-agent",
  ip: "203.0.113.7",
};

describe("UpdateProfile use case", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("updates provided fields and persists user", async () => {
    const { sut, repo, hasher } = build();
    const user = makeUser();
    repo.findById.mockResolvedValue(user);
    repo.existsByEmail.mockResolvedValue(false);
    repo.existsByUsername.mockResolvedValue(false);
    hasher.hash.mockResolvedValue("next-hash");
    repo.save.mockImplementation(async () => user);

    await sut.execute({
      ...SESSION,
      email: " New@Example.com ",
      username: "new-user",
      password: "Password123!",
      isPublicProfile: false,
    });

    const savedUser = repo.save.mock.calls[0][0];
    expect(savedUser.email).toBe("new@example.com");
    expect(savedUser.username).toBe("new-user");
    expect(savedUser.isPublicProfile).toBe(false);
    expect(savedUser.passwordHash).toBe("next-hash");
  });

  it("a new password ends every session, then issues this one a new token in the same transaction (ADR-0097)", async () => {
    const { sut, repo, hasher, refreshTokenRepo, issueRefreshToken, tx } =
      build();
    const info = jest.spyOn(logger, "info").mockImplementation(() => logger);
    const user = makeUser();
    repo.findById.mockResolvedValue(user);
    hasher.hash.mockResolvedValue("next-hash");
    const writes: string[] = [];
    repo.save.mockImplementation(async () => {
      writes.push("save");
      return user;
    });
    refreshTokenRepo.revokeAllForUser.mockImplementation(async () => {
      writes.push("revokeAllForUser");
    });
    issueRefreshToken.executeInTransaction.mockImplementation(async () => {
      writes.push("issue");
      return { rawToken: "new-raw-refresh" } as Awaited<
        ReturnType<IssueRefreshToken["executeInTransaction"]>
      >;
    });

    const result = await sut.execute({ ...SESSION, password: "Password123!" });

    expect(result).toEqual({ user, rawRefreshToken: "new-raw-refresh" });
    expect(tx.runInTransaction).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledWith(user, "fake-tx");
    expect(refreshTokenRepo.revokeAllForUser).toHaveBeenCalledWith(
      "user-1",
      expect.any(Date),
      "fake-tx",
    );
    expect(issueRefreshToken.executeInTransaction).toHaveBeenCalledWith(
      {
        userId: "user-1",
        organizationId: "org-1",
        userAgent: "jest-agent",
        ip: "203.0.113.7",
      },
      "fake-tx",
    );
    // Revocation first, ahead of the user row's lock (a concurrent refresh would
    // otherwise deadlock with it); the new token after it, or it would be
    // revoked with the rest.
    expect(writes).toEqual(["revokeAllForUser", "save", "issue"]);
    expect(info).toHaveBeenCalledWith("auth.sessions.revoked", {
      userId: "user-1",
      reason: "password_change",
    });
    info.mockRestore();
    expect(hasher.hash.mock.invocationCallOrder[0]).toBeLessThan(
      tx.runInTransaction.mock.invocationCallOrder[0],
    );
  });

  it("without a password, ends no session and issues no token", async () => {
    const { sut, repo, refreshTokenRepo, issueRefreshToken, tx } = build();
    const user = makeUser();
    repo.findById.mockResolvedValue(user);
    repo.existsByUsername.mockResolvedValue(false);
    repo.save.mockResolvedValue(user);

    const result = await sut.execute({ ...SESSION, username: "renamed" });

    expect(result).toEqual({ user, rawRefreshToken: null });
    expect(repo.save).toHaveBeenCalledWith(user);
    expect(tx.runInTransaction).not.toHaveBeenCalled();
    expect(refreshTokenRepo.revokeAllForUser).not.toHaveBeenCalled();
    expect(issueRefreshToken.executeInTransaction).not.toHaveBeenCalled();
  });

  it("throws when user cannot be found", async () => {
    const { sut, repo } = build();
    repo.findById.mockResolvedValue(null);

    await expect(
      sut.execute({ ...SESSION, userId: "missing", email: "user@example.com" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws when email already taken, before any session ends", async () => {
    const { sut, repo, refreshTokenRepo } = build();
    repo.findById.mockResolvedValue(makeUser());
    repo.existsByEmail.mockResolvedValue(true);

    await expect(
      sut.execute({
        ...SESSION,
        email: "new@example.com",
        password: "Password123!",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(refreshTokenRepo.revokeAllForUser).not.toHaveBeenCalled();
  });
});
