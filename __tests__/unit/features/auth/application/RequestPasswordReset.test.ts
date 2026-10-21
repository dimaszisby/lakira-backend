import { jest } from "@jest/globals";
import {
  RequestPasswordReset,
  RESET_TOKEN_TTL_MINUTES,
} from "@/features/auth/application/use-cases/RequestPasswordReset.js";
import { UserRepository } from "@/features/auth/domain/repositories/UserRepository.js";
import { PasswordResetTokenRepository } from "@/features/auth/domain/repositories/PasswordResetTokenRepository.js";
import { EmailSender } from "@/features/auth/application/ports/EmailSender.js";
import { AuthUser } from "@/features/auth/domain/entities/AuthUser.js";
import { PasswordResetToken } from "@/features/auth/domain/entities/PasswordResetToken.js";
import { buildPasswordResetEmail } from "@/features/auth/infrastructure/email/templates/password-reset.js";
import type { MessageQueuePort } from "@/shared/application/ports/MessageQueuePort.js";
import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";
import type { MessageIdempotencyPort } from "@/shared/application/ports/MessageIdempotencyPort.js";
import {
  EXCHANGES,
  QUEUES,
  ROUTING_KEYS,
} from "@/shared/application/messaging/job-routes.js";

const FROZEN_NOW = new Date("2026-04-24T10:00:00.000Z");

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

const TX = { id: "tx" } as unknown as PersistenceTransaction;

// queue-failure-paths D-03: a fallback runs the job under the published message's id, so
// the worker's copy of it is a duplicate. This fake runs the work, or reports a duplicate.
const fakeIdempotency = () => {
  const outcome = { next: "processed" as "processed" | "duplicate" };
  const port: jest.Mocked<MessageIdempotencyPort> = {
    runOnce: jest.fn(async (_key, work) => {
      if (outcome.next === "duplicate") return "duplicate";
      await work(TX);
      return "processed";
    }),
  };
  return { port, outcome };
};

const build = ({ queueEnabled = false } = {}) => {
  const idempotency = fakeIdempotency();
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
  const emailSender: jest.Mocked<EmailSender> = {
    send: jest.fn(),
  };
  const queue: jest.Mocked<MessageQueuePort> = {
    isEnabled: jest.fn(() => queueEnabled),
    publish: jest.fn(async () => undefined),
    close: jest.fn(async () => undefined),
  };
  const sut = new RequestPasswordReset(
    userRepo,
    tokenRepo,
    emailSender,
    queue,
    idempotency.port,
    {
      frontendResetUrl: "https://app.example.com/reset-password",
      buildEmail: buildPasswordResetEmail,
      now: () => FROZEN_NOW,
    },
  );
  return { sut, userRepo, tokenRepo, emailSender, queue, idempotency };
};

const savedToken = async (data: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}) =>
  PasswordResetToken.fromPersistence({
    id: "token-1",
    userId: data.userId,
    tokenHash: data.tokenHash,
    expiresAt: data.expiresAt,
    usedAt: null,
    createdAt: FROZEN_NOW,
  });

describe("RequestPasswordReset use case", () => {
  it("invalidates prior tokens, persists hashed token, and sends email when user exists", async () => {
    const { sut, userRepo, tokenRepo, emailSender } = build();
    const user = makeUser();
    userRepo.findByEmail.mockResolvedValue(user);
    tokenRepo.create.mockImplementation(async (data) =>
      PasswordResetToken.fromPersistence({
        id: "token-1",
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        usedAt: null,
        createdAt: FROZEN_NOW,
      }),
    );

    await sut.execute({ email: "User@Example.COM " });

    expect(userRepo.findByEmail).toHaveBeenCalledWith("user@example.com");
    // In the request, with the queue off: no transaction.
    expect(tokenRepo.invalidateAllForUser).toHaveBeenCalledWith(
      user.id,
      FROZEN_NOW,
      undefined,
    );
    expect(tokenRepo.create).toHaveBeenCalledTimes(1);

    const created = tokenRepo.create.mock.calls[0][0];
    expect(created.userId).toBe(user.id);
    expect(created.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(created.expiresAt.getTime()).toBe(
      FROZEN_NOW.getTime() + RESET_TOKEN_TTL_MINUTES * 60 * 1000,
    );

    expect(emailSender.send).toHaveBeenCalledTimes(1);
    const sent = emailSender.send.mock.calls[0][0];
    expect(sent.to).toBe(user.email);
    expect(sent.subject).toMatch(/reset/i);
    expect(sent.text).toContain(
      "https://app.example.com/reset-password?token=",
    );
    // The raw token must NOT equal the persisted hash
    const linkToken = decodeURIComponent(
      sent.text.split("?token=")[1].split(/\s/)[0],
    );
    expect(linkToken.length).toBeGreaterThan(0);
    expect(linkToken).not.toBe(created.tokenHash);
  });

  it("returns silently when user is unknown (anti-enumeration)", async () => {
    const { sut, userRepo, tokenRepo, emailSender } = build();
    userRepo.findByEmail.mockResolvedValue(null);

    await expect(
      sut.execute({ email: "missing@example.com" }),
    ).resolves.toBeUndefined();

    expect(tokenRepo.invalidateAllForUser).not.toHaveBeenCalled();
    expect(tokenRepo.create).not.toHaveBeenCalled();
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it("does not throw when emailSender.send fails (logs and resolves)", async () => {
    const { sut, userRepo, tokenRepo, emailSender } = build();
    userRepo.findByEmail.mockResolvedValue(makeUser());
    tokenRepo.create.mockImplementation(async (data) =>
      PasswordResetToken.fromPersistence({
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
      sut.execute({ email: "user@example.com" }),
    ).resolves.toBeUndefined();
  });

  describe("with the queue on (ADR-0069)", () => {
    it("publishes the user id, and nothing else, and sends nothing in the request", async () => {
      const { sut, userRepo, tokenRepo, emailSender, queue } = build({
        queueEnabled: true,
      });
      userRepo.findByEmail.mockResolvedValue(makeUser());

      await sut.execute({ email: "User@Example.COM " });

      expect(queue.publish).toHaveBeenCalledTimes(1);
      const [exchange, payload, options] = queue.publish.mock.calls[0];
      expect(exchange).toBe(EXCHANGES.JOBS);
      // durable-password-reset-email D-01: no address, no token in the broker.
      expect(payload).toEqual({ userId: "user-1" });
      expect(options.routingKey).toBe(
        ROUTING_KEYS.AUTH_SEND_PASSWORD_RESET_EMAIL,
      );
      expect(options.messageId).toMatch(/^[0-9a-f-]{36}$/);
      expect(tokenRepo.create).not.toHaveBeenCalled();
      expect(emailSender.send).not.toHaveBeenCalled();
    });

    it("publishes nothing for an unknown address", async () => {
      const { sut, userRepo, queue } = build({ queueEnabled: true });
      userRepo.findByEmail.mockResolvedValue(null);

      await sut.execute({ email: "missing@example.com" });

      expect(queue.publish).not.toHaveBeenCalled();
    });

    // D-04: a failed publish never fails the request.
    it("sends in the request, without throwing, when the publish fails", async () => {
      const { sut, userRepo, tokenRepo, emailSender, queue } = build({
        queueEnabled: true,
      });
      userRepo.findByEmail.mockResolvedValue(makeUser());
      // The fallback is the job, which reads the user by id (queue-failure-paths D-03).
      userRepo.findById.mockResolvedValue(makeUser());
      tokenRepo.create.mockImplementation(savedToken);
      queue.publish.mockRejectedValueOnce(new Error("Timeout"));

      await expect(
        sut.execute({ email: "user@example.com" }),
      ).resolves.toBeUndefined();

      expect(tokenRepo.create).toHaveBeenCalledTimes(1);
      expect(emailSender.send).toHaveBeenCalledTimes(1);
    });

    // queue-failure-paths D-03 (X68): the publish may have reached the broker.
    it("sends the job under the published message id and the job's queue, through its transaction", async () => {
      const { sut, userRepo, tokenRepo, emailSender, queue, idempotency } =
        build({ queueEnabled: true });
      userRepo.findByEmail.mockResolvedValue(makeUser());
      userRepo.findById.mockResolvedValue(makeUser());
      tokenRepo.create.mockImplementation(savedToken);
      queue.publish.mockRejectedValueOnce(new Error("Timeout"));

      await sut.execute({ email: "user@example.com" });

      expect(idempotency.port.runOnce).toHaveBeenCalledWith(
        {
          messageId: queue.publish.mock.calls[0][2].messageId,
          queue: QUEUES.AUTH_SEND_PASSWORD_RESET_EMAIL,
        },
        expect.any(Function),
      );
      expect(tokenRepo.create.mock.calls[0][1]).toBe(TX);
      expect(emailSender.send).toHaveBeenCalledTimes(1);
    });

    it("sends nothing when the worker already sent the job", async () => {
      const { sut, userRepo, emailSender, queue, idempotency } = build({
        queueEnabled: true,
      });
      userRepo.findByEmail.mockResolvedValue(makeUser());
      queue.publish.mockRejectedValueOnce(new Error("Timeout"));
      idempotency.outcome.next = "duplicate";

      await expect(
        sut.execute({ email: "user@example.com" }),
      ).resolves.toBeUndefined();
      expect(emailSender.send).not.toHaveBeenCalled();
    });

    it("does not throw when the fallback's send fails", async () => {
      const { sut, userRepo, tokenRepo, emailSender, queue } = build({
        queueEnabled: true,
      });
      userRepo.findByEmail.mockResolvedValue(makeUser());
      userRepo.findById.mockResolvedValue(makeUser());
      tokenRepo.create.mockImplementation(savedToken);
      queue.publish.mockRejectedValueOnce(new Error("Timeout"));
      emailSender.send.mockRejectedValue(new Error("smtp down"));

      await expect(
        sut.execute({ email: "user@example.com" }),
      ).resolves.toBeUndefined();
    });
  });

  describe("executeInTransaction (the worker's side)", () => {
    const tx = { id: "tx" } as unknown as PersistenceTransaction;

    it("writes both token calls through the transaction and sends", async () => {
      const { sut, userRepo, tokenRepo, emailSender } = build();
      const user = makeUser();
      userRepo.findById.mockResolvedValue(user);
      tokenRepo.create.mockImplementation(savedToken);

      await sut.executeInTransaction(user.id, tx);

      // One connection per job: the read goes through the job's transaction
      // (worker-cancel-and-one-connection-per-job D-02).
      expect(userRepo.findById).toHaveBeenCalledWith(user.id, tx);
      expect(tokenRepo.invalidateAllForUser).toHaveBeenCalledWith(
        user.id,
        FROZEN_NOW,
        tx,
      );
      expect(tokenRepo.create.mock.calls[0][1]).toBe(tx);
      expect(emailSender.send).toHaveBeenCalledTimes(1);
      expect(emailSender.send.mock.calls[0][0].to).toBe(user.email);
    });

    // D-02: the throw is what rolls the token back and retries the job.
    it("throws when the send fails", async () => {
      const { sut, userRepo, tokenRepo, emailSender } = build();
      userRepo.findById.mockResolvedValue(makeUser());
      tokenRepo.create.mockImplementation(savedToken);
      emailSender.send.mockRejectedValue(new Error("smtp down"));

      await expect(sut.executeInTransaction("user-1", tx)).rejects.toThrow(
        "smtp down",
      );
    });

    it("does nothing when the user no longer exists", async () => {
      const { sut, userRepo, tokenRepo, emailSender } = build();
      userRepo.findById.mockResolvedValue(null);

      await sut.executeInTransaction("user-1", tx);

      expect(tokenRepo.create).not.toHaveBeenCalled();
      expect(emailSender.send).not.toHaveBeenCalled();
    });
  });
});
