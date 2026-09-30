import { jest } from "@jest/globals";
import {
  RequestEmailVerification,
  VERIFICATION_TOKEN_TTL_SEC,
} from "@/features/auth/application/use-cases/RequestEmailVerification.js";
import { UserRepository } from "@/features/auth/domain/repositories/UserRepository.js";
import { EmailVerificationTokenRepository } from "@/features/auth/domain/repositories/EmailVerificationTokenRepository.js";
import { EmailSender } from "@/features/auth/application/ports/EmailSender.js";
import { AuthUser } from "@/features/auth/domain/entities/AuthUser.js";
import { EmailVerificationToken } from "@/features/auth/domain/entities/EmailVerificationToken.js";
import { buildEmailVerificationEmail } from "@/features/auth/infrastructure/email/templates/email-verification.js";

const FROZEN_NOW = new Date("2026-05-08T10:00:00.000Z");

const makeUser = (emailVerifiedAt: Date | null = null) =>
  AuthUser.fromPersistence({
    id: "user-1",
    email: "user@example.com",
    username: "tester",
    passwordHash: "hash",
    isPublicProfile: true,
    emailVerifiedAt,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
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
  const emailSender: jest.Mocked<EmailSender> = {
    send: jest.fn(),
  };
  const sut = new RequestEmailVerification(userRepo, tokenRepo, emailSender, {
    frontendVerifyUrl: "https://app.example.com/verify-email",
    buildEmail: buildEmailVerificationEmail,
    now: () => FROZEN_NOW,
  });
  return { sut, userRepo, tokenRepo, emailSender };
};

describe("RequestEmailVerification use case", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("revokes prior tokens, persists hashed token, and sends email when user is unverified", async () => {
    const { sut, userRepo, tokenRepo, emailSender } = build();
    const user = makeUser(null);
    userRepo.findById.mockResolvedValue(user);
    tokenRepo.save.mockImplementation(async (data) =>
      EmailVerificationToken.fromPersistence({
        id: "token-1",
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        usedAt: null,
        createdAt: FROZEN_NOW,
      }),
    );

    await sut.execute({ userId: "user-1", email: "user@example.com" });

    expect(userRepo.findById).toHaveBeenCalledWith("user-1");
    expect(tokenRepo.revokeAllForUser).toHaveBeenCalledWith(
      user.id,
      FROZEN_NOW,
    );
    expect(tokenRepo.save).toHaveBeenCalledTimes(1);

    const saved = tokenRepo.save.mock.calls[0][0];
    expect(saved.userId).toBe(user.id);
    expect(saved.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(saved.expiresAt.getTime()).toBe(
      FROZEN_NOW.getTime() + VERIFICATION_TOKEN_TTL_SEC * 1000,
    );

    expect(emailSender.send).toHaveBeenCalledTimes(1);
    const sent = emailSender.send.mock.calls[0][0];
    expect(sent.to).toBe(user.email);
    expect(sent.subject).toMatch(/verify/i);
    expect(sent.text).toContain("https://app.example.com/verify-email?token=");
    const linkToken = decodeURIComponent(
      sent.text.split("?token=")[1].split(/\s/)[0],
    );
    expect(linkToken).not.toBe(saved.tokenHash);
  });

  it("returns silently when user is not found", async () => {
    const { sut, userRepo, tokenRepo, emailSender } = build();
    userRepo.findById.mockResolvedValue(null);

    await expect(
      sut.execute({ userId: "missing", email: "x@example.com" }),
    ).resolves.toBeUndefined();

    expect(tokenRepo.revokeAllForUser).not.toHaveBeenCalled();
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it("returns silently when user is already verified", async () => {
    const { sut, userRepo, tokenRepo, emailSender } = build();
    userRepo.findById.mockResolvedValue(makeUser(FROZEN_NOW));

    await sut.execute({ userId: "user-1", email: "user@example.com" });

    expect(tokenRepo.revokeAllForUser).not.toHaveBeenCalled();
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it("does not throw when emailSender.send fails", async () => {
    const { sut, userRepo, tokenRepo, emailSender } = build();
    userRepo.findById.mockResolvedValue(makeUser(null));
    tokenRepo.save.mockImplementation(async (data) =>
      EmailVerificationToken.fromPersistence({
        id: "token-1",
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        usedAt: null,
        createdAt: FROZEN_NOW,
      }),
    );
    emailSender.send.mockRejectedValue(new Error("smtp down"));

    await expect(
      sut.execute({ userId: "user-1", email: "user@example.com" }),
    ).resolves.toBeUndefined();
  });
});
