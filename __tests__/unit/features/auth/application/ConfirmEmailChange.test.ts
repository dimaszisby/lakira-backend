import crypto from "node:crypto";
import { jest } from "@jest/globals";
import {
  ConflictError,
  ValidationError,
} from "@/shared/domain/errors/DomainError.js";
import {
  ConfirmEmailChange,
  INVALID_EMAIL_CHANGE_TOKEN,
} from "@/features/auth/application/use-cases/ConfirmEmailChange.js";
import { UserRepository } from "@/features/auth/domain/repositories/UserRepository.js";
import { EmailChangeTokenRepository } from "@/features/auth/domain/repositories/EmailChangeTokenRepository.js";
import { EmailVerificationTokenRepository } from "@/features/auth/domain/repositories/EmailVerificationTokenRepository.js";
import { PasswordResetTokenRepository } from "@/features/auth/domain/repositories/PasswordResetTokenRepository.js";
import { EmailChangeToken } from "@/features/auth/domain/entities/EmailChangeToken.js";
import { AuthUser } from "@/features/auth/domain/entities/AuthUser.js";
import type { TransactionPort } from "@/shared/application/ports/TransactionPort.js";
import logger from "@/utils/logger.js";

const NOW = new Date("2026-11-25T10:00:00.000Z");
const RAW = "raw-change-token";
const HASH = crypto.createHash("sha256").update(RAW).digest("hex");

const makeUser = () =>
  AuthUser.fromPersistence({
    id: "user-1",
    email: "old@example.com",
    username: "tester",
    passwordHash: "hash",
    isPublicProfile: true,
    emailVerifiedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  });

const request = EmailChangeToken.fromPersistence({
  id: "request-1",
  userId: "user-1",
  newEmail: "new@example.com",
  oldEmail: "old@example.com",
  tokenHash: HASH,
  expiresAt: new Date(NOW.getTime() + 3600 * 1000),
  usedAt: null,
  createdAt: NOW,
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
  const tokenRepo: jest.Mocked<EmailChangeTokenRepository> = {
    create: jest.fn(),
    supersedeAllForUser: jest.fn(),
    findById: jest.fn(),
    setTokenHash: jest.fn(),
    findByTokenHash: jest.fn(),
    spend: jest.fn(),
  };
  const verificationRepo: jest.Mocked<EmailVerificationTokenRepository> = {
    save: jest.fn(),
    findByTokenHash: jest.fn(),
    revokeAllForUser: jest.fn(),
    markUsed: jest.fn(),
  };
  const resetRepo: jest.Mocked<PasswordResetTokenRepository> = {
    findByTokenHash: jest.fn(),
    create: jest.fn(),
    spend: jest.fn(),
    invalidateAllForUser: jest.fn(),
  };
  const tx = {
    runInTransaction: jest.fn().mockImplementation((fn: any) => fn("fake-tx")),
  } as unknown as jest.Mocked<TransactionPort>;
  const sut = new ConfirmEmailChange(
    userRepo,
    tokenRepo,
    verificationRepo,
    resetRepo,
    tx,
    { now: () => NOW },
  );
  tokenRepo.findByTokenHash.mockResolvedValue(request);
  tokenRepo.spend.mockResolvedValue(true);
  userRepo.existsByEmail.mockResolvedValue(false);
  return { sut, userRepo, tokenRepo, verificationRepo, resetRepo, tx };
};

describe("ConfirmEmailChange (credential-changes D-02, AC-8)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("spends the token, changes and verifies the email, and revokes the old links, in one transaction", async () => {
    const { sut, userRepo, tokenRepo, verificationRepo, resetRepo, tx } =
      build();
    const info = jest.spyOn(logger, "info").mockImplementation(() => logger);
    const user = makeUser();
    userRepo.findById.mockResolvedValue(user);

    await sut.execute({ token: RAW });

    expect(tokenRepo.findByTokenHash).toHaveBeenCalledWith(HASH);
    expect(tx.runInTransaction).toHaveBeenCalledTimes(1);
    expect(tokenRepo.spend).toHaveBeenCalledWith("request-1", NOW, "fake-tx");
    // The token row is locked ahead of the user's (D-09).
    expect(tokenRepo.spend.mock.invocationCallOrder[0]).toBeLessThan(
      userRepo.findById.mock.invocationCallOrder[0],
    );
    expect(userRepo.existsByEmail).toHaveBeenCalledWith(
      "new@example.com",
      "fake-tx",
    );
    expect(user.email).toBe("new@example.com");
    expect(user.emailVerifiedAt).toEqual(NOW);
    expect(userRepo.save).toHaveBeenCalledWith(user, "fake-tx");
    expect(verificationRepo.revokeAllForUser).toHaveBeenCalledWith(
      "user-1",
      NOW,
      "fake-tx",
    );
    expect(resetRepo.invalidateAllForUser).toHaveBeenCalledWith(
      "user-1",
      NOW,
      "fake-tx",
    );
    expect(info).toHaveBeenCalledWith("auth.email_change.confirmed", {
      userId: "user-1",
    });
    info.mockRestore();
  });

  it("answers the generic 400 for an unknown token, opening no transaction", async () => {
    const { sut, tokenRepo, tx } = build();
    tokenRepo.findByTokenHash.mockResolvedValue(null);

    await expect(sut.execute({ token: RAW })).rejects.toThrow(
      new ValidationError(INVALID_EMAIL_CHANGE_TOKEN),
    );
    expect(tx.runInTransaction).not.toHaveBeenCalled();
  });

  // A used, superseded or expired token, or the loser of a race, spends nothing.
  it("answers the same 400 when the token was not spent, and changes nothing", async () => {
    const { sut, tokenRepo, userRepo } = build();
    tokenRepo.spend.mockResolvedValue(false);

    await expect(sut.execute({ token: RAW })).rejects.toMatchObject({
      kind: "validation",
      message: INVALID_EMAIL_CHANGE_TOKEN,
    });
    expect(userRepo.findById).not.toHaveBeenCalled();
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it("answers 409 when the address was taken since the request, saving nothing", async () => {
    const { sut, userRepo } = build();
    userRepo.findById.mockResolvedValue(makeUser());
    userRepo.existsByEmail.mockResolvedValue(true);

    await expect(sut.execute({ token: RAW })).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(userRepo.save).not.toHaveBeenCalled();
  });
});
