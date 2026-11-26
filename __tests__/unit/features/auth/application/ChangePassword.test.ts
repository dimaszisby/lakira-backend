import { jest } from "@jest/globals";
import {
  NotFoundError,
  ValidationError,
} from "@/shared/domain/errors/DomainError.js";
import { ChangePassword } from "@/features/auth/application/use-cases/ChangePassword.js";
import { ConfirmCurrentPassword } from "@/features/auth/application/use-cases/ConfirmCurrentPassword.js";
import { IssueRefreshToken } from "@/features/auth/application/use-cases/IssueRefreshToken.js";
import { UserRepository } from "@/features/auth/domain/repositories/UserRepository.js";
import { RefreshTokenRepository } from "@/features/auth/domain/repositories/RefreshTokenRepository.js";
import { PasswordResetTokenRepository } from "@/features/auth/domain/repositories/PasswordResetTokenRepository.js";
import { EmailChangeTokenRepository } from "@/features/auth/domain/repositories/EmailChangeTokenRepository.js";
import { ScheduleAccountNotice } from "@/features/auth/application/use-cases/ScheduleAccountNotice.js";
import { PasswordHasher } from "@/features/auth/application/ports/PasswordHasher.js";
import { AuthUser } from "@/features/auth/domain/entities/AuthUser.js";
import type { TransactionPort } from "@/shared/application/ports/TransactionPort.js";
import logger from "@/utils/logger.js";

const NOW = new Date("2026-11-24T10:00:00.000Z");

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

const INPUT = {
  userId: "user-1",
  organizationId: "org-1",
  userAgent: "jest-agent",
  ip: "203.0.113.7",
  currentPassword: "OldPassword1!",
  password: "NewPassword1!",
};

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
  const resetTokenRepo: jest.Mocked<PasswordResetTokenRepository> = {
    findByTokenHash: jest.fn(),
    create: jest.fn(),
    spend: jest.fn(),
    invalidateAllForUser: jest.fn(),
  };
  const refreshTokenRepo: jest.Mocked<RefreshTokenRepository> = {
    save: jest.fn(),
    findByTokenHash: jest.fn(),
    findByTokenHashForUpdate: jest.fn(),
    revokeFamily: jest.fn(),
    revokeAllForUser: jest.fn(),
    findActiveByUser: jest.fn(),
  };
  const hasher: jest.Mocked<PasswordHasher> = {
    hash: jest.fn(),
    compare: jest.fn(),
  };
  const issueRefreshToken = {
    executeInTransaction: jest.fn<IssueRefreshToken["executeInTransaction"]>(),
  } as unknown as jest.Mocked<IssueRefreshToken>;
  issueRefreshToken.executeInTransaction.mockResolvedValue({
    rawToken: "new-raw-refresh",
  } as Awaited<ReturnType<IssueRefreshToken["executeInTransaction"]>>);
  const confirm = {
    execute: jest.fn<ConfirmCurrentPassword["execute"]>(),
  } as unknown as jest.Mocked<ConfirmCurrentPassword>;
  const tx = {
    runInTransaction: jest.fn().mockImplementation((fn: any) => fn("fake-tx")),
  } as unknown as jest.Mocked<TransactionPort>;
  const emailChangeTokenRepo: jest.Mocked<EmailChangeTokenRepository> = {
    create: jest.fn(),
    supersedeAllForUser: jest.fn(),
    findById: jest.fn(),
    setTokenHash: jest.fn(),
    findByTokenHash: jest.fn(),
    spend: jest.fn(),
  };
  const notices = {
    execute: jest.fn<ScheduleAccountNotice["execute"]>(),
  } as unknown as jest.Mocked<ScheduleAccountNotice>;
  const sut = new ChangePassword(
    userRepo,
    resetTokenRepo,
    refreshTokenRepo,
    hasher,
    issueRefreshToken,
    confirm,
    tx,
    emailChangeTokenRepo,
    notices,
    { now: () => NOW },
  );
  return {
    sut,
    userRepo,
    resetTokenRepo,
    refreshTokenRepo,
    hasher,
    issueRefreshToken,
    confirm,
    tx,
    emailChangeTokenRepo,
    notices,
  };
};

describe("ChangePassword (credential-changes D-01, ADR-0097)", () => {
  beforeEach(() => jest.resetAllMocks());

  it("confirms the current password, then ends every session and issues this one a new token", async () => {
    const {
      sut,
      userRepo,
      resetTokenRepo,
      refreshTokenRepo,
      hasher,
      issueRefreshToken,
      confirm,
      tx,
      emailChangeTokenRepo,
      notices,
    } = build();
    const info = jest.spyOn(logger, "info").mockImplementation(() => logger);
    const user = makeUser();
    userRepo.findById.mockResolvedValue(user);
    hasher.compare.mockResolvedValue(false); // the new password differs
    hasher.hash.mockResolvedValue("new-hash");
    const writes: string[] = [];
    emailChangeTokenRepo.supersedeAllForUser.mockImplementation(async () => {
      writes.push("supersedeEmailChanges");
    });
    notices.execute.mockImplementation(async () => {
      writes.push("notice");
    });
    refreshTokenRepo.revokeAllForUser.mockImplementation(async () => {
      writes.push("revokeAllForUser");
    });
    userRepo.save.mockImplementation(async () => {
      writes.push("save");
      return user;
    });
    resetTokenRepo.invalidateAllForUser.mockImplementation(async () => {
      writes.push("invalidateResetTokens");
    });
    issueRefreshToken.executeInTransaction.mockImplementation(async () => {
      writes.push("issue");
      return { rawToken: "new-raw-refresh" } as Awaited<
        ReturnType<IssueRefreshToken["executeInTransaction"]>
      >;
    });

    const result = await sut.execute(INPUT);

    expect(result).toEqual({ rawRefreshToken: "new-raw-refresh" });
    expect(confirm.execute).toHaveBeenCalledWith(user, "OldPassword1!");
    expect(user.passwordHash).toBe("new-hash");
    expect(tx.runInTransaction).toHaveBeenCalledTimes(1);
    // D-09's cancelled email change first, ADR-0097's lock order, AC-5's
    // spent reset links, the new token last, and the notice after the commit.
    expect(writes).toEqual([
      "supersedeEmailChanges",
      "revokeAllForUser",
      "save",
      "invalidateResetTokens",
      "issue",
      "notice",
    ]);
    expect(emailChangeTokenRepo.supersedeAllForUser).toHaveBeenCalledWith(
      "user-1",
      NOW,
      "fake-tx",
    );
    expect(notices.execute).toHaveBeenCalledWith({
      userId: "user-1",
      notice: "password_changed",
    });
    expect(refreshTokenRepo.revokeAllForUser).toHaveBeenCalledWith(
      "user-1",
      NOW,
      "fake-tx",
    );
    expect(resetTokenRepo.invalidateAllForUser).toHaveBeenCalledWith(
      "user-1",
      NOW,
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
    expect(hasher.hash.mock.invocationCallOrder[0]).toBeLessThan(
      tx.runInTransaction.mock.invocationCallOrder[0],
    );
    expect(info).toHaveBeenCalledWith("auth.sessions.revoked", {
      userId: "user-1",
      reason: "password_change",
    });
    info.mockRestore();
  });

  it("writes nothing when the current password is refused", async () => {
    const { sut, userRepo, confirm, tx } = build();
    userRepo.findById.mockResolvedValue(makeUser());
    confirm.execute.mockRejectedValue(
      new ValidationError("Current password is incorrect", {
        field: "currentPassword",
      }),
    );

    await expect(sut.execute(INPUT)).rejects.toMatchObject({
      field: "currentPassword",
    });
    expect(tx.runInTransaction).not.toHaveBeenCalled();
  });

  it("sends no notice when the transaction fails", async () => {
    const { sut, userRepo, hasher, refreshTokenRepo, notices } = build();
    userRepo.findById.mockResolvedValue(makeUser());
    hasher.compare.mockResolvedValue(false);
    hasher.hash.mockResolvedValue("new-hash");
    refreshTokenRepo.revokeAllForUser.mockRejectedValue(new Error("deadlock"));

    await expect(sut.execute(INPUT)).rejects.toThrow("deadlock");
    expect(notices.execute).not.toHaveBeenCalled();
  });

  it("refuses a new password equal to the current one, on the field", async () => {
    const { sut, userRepo, hasher, tx } = build();
    userRepo.findById.mockResolvedValue(makeUser());
    hasher.compare.mockResolvedValue(true);

    await expect(sut.execute(INPUT)).rejects.toMatchObject({
      kind: "validation",
      field: "password",
    });
    expect(hasher.compare).toHaveBeenCalledWith("NewPassword1!", "old-hash");
    expect(tx.runInTransaction).not.toHaveBeenCalled();
  });

  it("answers not found for a user that no longer exists", async () => {
    const { sut, userRepo, confirm } = build();
    userRepo.findById.mockResolvedValue(null);

    await expect(sut.execute(INPUT)).rejects.toBeInstanceOf(NotFoundError);
    expect(confirm.execute).not.toHaveBeenCalled();
  });
});
