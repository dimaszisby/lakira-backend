import crypto from "node:crypto";
import { jest } from "@jest/globals";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/shared/domain/errors/DomainError.js";
import {
  EMAIL_CHANGE_TOKEN_TTL_HOURS,
  RequestEmailChange,
} from "@/features/auth/application/use-cases/RequestEmailChange.js";
import { ConfirmCurrentPassword } from "@/features/auth/application/use-cases/ConfirmCurrentPassword.js";
import { ScheduleAccountNotice } from "@/features/auth/application/use-cases/ScheduleAccountNotice.js";
import { UserRepository } from "@/features/auth/domain/repositories/UserRepository.js";
import { EmailChangeTokenRepository } from "@/features/auth/domain/repositories/EmailChangeTokenRepository.js";
import { EmailChangeToken } from "@/features/auth/domain/entities/EmailChangeToken.js";
import { AuthUser } from "@/features/auth/domain/entities/AuthUser.js";
import type { EmailSender } from "@/features/auth/application/ports/EmailSender.js";
import type { MessageQueuePort } from "@/shared/application/ports/MessageQueuePort.js";
import type { MessageIdempotencyPort } from "@/shared/application/ports/MessageIdempotencyPort.js";
import type { TransactionPort } from "@/shared/application/ports/TransactionPort.js";
import {
  EXCHANGES,
  QUEUES,
  ROUTING_KEYS,
} from "@/shared/application/messaging/job-routes.js";
import logger from "@/utils/logger.js";

const NOW = new Date("2026-11-25T10:00:00.000Z");
const REQUEST_ID = "5b1d9c2e-0a7f-4c3b-8e6d-2f4a1b3c5d7e";

const makeUser = () =>
  AuthUser.fromPersistence({
    id: "user-1",
    email: "old@example.com",
    username: "tester",
    passwordHash: "hash",
    isPublicProfile: true,
    emailVerifiedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  });

const makeRequest = (
  overrides: Partial<{ usedAt: Date | null; expiresAt: Date }> = {},
) =>
  EmailChangeToken.fromPersistence({
    id: REQUEST_ID,
    userId: "user-1",
    newEmail: "new@example.com",
    oldEmail: "old@example.com",
    tokenHash: null,
    expiresAt:
      overrides.expiresAt ??
      new Date(NOW.getTime() + EMAIL_CHANGE_TOKEN_TTL_HOURS * 3600 * 1000),
    usedAt: overrides.usedAt ?? null,
    createdAt: NOW,
  });

const INPUT = {
  userId: "user-1",
  currentPassword: "Current1!",
  email: "  New@Example.com ",
};

const build = ({ queueEnabled = true } = {}) => {
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
  const emailSender: jest.Mocked<EmailSender> = { send: jest.fn() };
  const queue: jest.Mocked<MessageQueuePort> = {
    isEnabled: jest.fn(() => queueEnabled),
    publish: jest.fn(),
    close: jest.fn(),
  } as unknown as jest.Mocked<MessageQueuePort>;
  const idempotency: jest.Mocked<MessageIdempotencyPort> = {
    runOnce: jest.fn(async (_key, work) => {
      await work("job-tx");
      return "processed" as const;
    }),
  };
  const confirm = {
    execute: jest.fn<ConfirmCurrentPassword["execute"]>(),
  } as unknown as jest.Mocked<ConfirmCurrentPassword>;
  const notices = {
    execute: jest.fn<ScheduleAccountNotice["execute"]>(),
  } as unknown as jest.Mocked<ScheduleAccountNotice>;
  const tx = {
    runInTransaction: jest.fn().mockImplementation((fn: any) => fn("fake-tx")),
  } as unknown as jest.Mocked<TransactionPort>;
  const buildEmail = jest.fn((link: string, hours: number) => ({
    subject: "Confirm",
    text: `${link} ${hours}`,
    html: link,
  }));
  const sut = new RequestEmailChange(
    userRepo,
    tokenRepo,
    emailSender,
    queue,
    idempotency,
    confirm,
    notices,
    tx,
    {
      frontendEmailChangeUrl: "https://app.example.com/confirm-email-change",
      buildEmail,
      now: () => NOW,
    },
  );
  userRepo.findById.mockResolvedValue(makeUser());
  userRepo.existsByEmail.mockResolvedValue(false);
  tokenRepo.create.mockResolvedValue(makeRequest());
  return {
    sut,
    userRepo,
    tokenRepo,
    emailSender,
    queue,
    idempotency,
    confirm,
    notices,
    tx,
    buildEmail,
  };
};

describe("RequestEmailChange (credential-changes D-02, D-05)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("confirms the password, replaces a pending change, stores this one and queues both emails", async () => {
    const { sut, confirm, tokenRepo, queue, notices, emailSender } = build();
    const info = jest.spyOn(logger, "info").mockImplementation(() => logger);

    await sut.execute(INPUT);

    expect(confirm.execute).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      "Current1!",
    );
    expect(tokenRepo.supersedeAllForUser).toHaveBeenCalledWith(
      "user-1",
      NOW,
      "fake-tx",
    );
    expect(
      tokenRepo.supersedeAllForUser.mock.invocationCallOrder[0],
    ).toBeLessThan(tokenRepo.create.mock.invocationCallOrder[0]);
    expect(tokenRepo.create).toHaveBeenCalledWith(
      {
        userId: "user-1",
        newEmail: "new@example.com",
        oldEmail: "old@example.com",
        expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
      },
      "fake-tx",
    );
    // The message carries the request's id only (AC-11).
    expect(queue.publish).toHaveBeenCalledWith(
      EXCHANGES.JOBS,
      { requestId: REQUEST_ID },
      {
        routingKey: ROUTING_KEYS.AUTH_SEND_EMAIL_CHANGE_EMAIL,
        messageId: expect.any(String),
      },
    );
    expect(notices.execute).toHaveBeenCalledWith({
      userId: "user-1",
      notice: "email_change_requested",
      requestId: REQUEST_ID,
    });
    expect(emailSender.send).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("auth.email_change.requested", {
      userId: "user-1",
    });
    info.mockRestore();
  });

  it("stores nothing when the current password is refused", async () => {
    const { sut, confirm, tx, notices } = build();
    confirm.execute.mockRejectedValue(
      new ValidationError("Current password is incorrect", {
        field: "currentPassword",
      }),
    );

    await expect(sut.execute(INPUT)).rejects.toMatchObject({
      field: "currentPassword",
    });
    expect(tx.runInTransaction).not.toHaveBeenCalled();
    expect(notices.execute).not.toHaveBeenCalled();
  });

  it("refuses the account's own address on the field", async () => {
    const { sut, tx } = build();

    await expect(
      sut.execute({ ...INPUT, email: "OLD@example.com" }),
    ).rejects.toMatchObject({ kind: "validation", field: "email" });
    expect(tx.runInTransaction).not.toHaveBeenCalled();
  });

  it("refuses an address another account holds", async () => {
    const { sut, userRepo, tx } = build();
    userRepo.existsByEmail.mockResolvedValue(true);

    await expect(sut.execute(INPUT)).rejects.toBeInstanceOf(ConflictError);
    expect(userRepo.existsByEmail).toHaveBeenCalledWith("new@example.com");
    expect(tx.runInTransaction).not.toHaveBeenCalled();
  });

  it("answers not found for a user that no longer exists", async () => {
    const { sut, userRepo, confirm } = build();
    userRepo.findById.mockResolvedValue(null);

    await expect(sut.execute(INPUT)).rejects.toBeInstanceOf(NotFoundError);
    expect(confirm.execute).not.toHaveBeenCalled();
  });

  it("with the queue off, sends the confirmation in the request", async () => {
    const { sut, tokenRepo, emailSender, queue } = build({
      queueEnabled: false,
    });
    tokenRepo.findById.mockResolvedValue(makeRequest());

    await sut.execute(INPUT);

    expect(queue.publish).not.toHaveBeenCalled();
    expect(emailSender.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "new@example.com" }),
    );
  });

  // ADR-0080: a publish that failed may have reached the broker.
  it("after a failed publish, runs the job under the id it tried", async () => {
    const { sut, queue, idempotency, tokenRepo, emailSender } = build();
    queue.publish.mockRejectedValue(new Error("confirm timeout"));
    tokenRepo.findById.mockResolvedValue(makeRequest());
    jest.spyOn(logger, "warn").mockImplementation(() => logger);

    await sut.execute(INPUT);

    const { messageId } = queue.publish.mock.calls[0][2];
    expect(idempotency.runOnce).toHaveBeenCalledWith(
      { messageId, queue: QUEUES.AUTH_SEND_EMAIL_CHANGE_EMAIL },
      expect.any(Function),
    );
    expect(emailSender.send).toHaveBeenCalledTimes(1);
  });

  it("answers 202's path even when the in-request send fails", async () => {
    const { sut, tokenRepo, emailSender, notices } = build({
      queueEnabled: false,
    });
    tokenRepo.findById.mockResolvedValue(makeRequest());
    emailSender.send.mockRejectedValue(new Error("smtp down"));
    jest.spyOn(logger, "error").mockImplementation(() => logger);

    await expect(sut.execute(INPUT)).resolves.toBeUndefined();
    expect(notices.execute).toHaveBeenCalled();
  });
});

describe("RequestEmailChange.executeInTransaction (the job)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("mints a token, stores only its hash and sends the link to the new address", async () => {
    const { sut, tokenRepo, emailSender, buildEmail } = build();
    tokenRepo.findById.mockResolvedValue(makeRequest());

    await sut.executeInTransaction(REQUEST_ID, "job-tx");

    expect(tokenRepo.findById).toHaveBeenCalledWith(REQUEST_ID, "job-tx");
    const [, storedHash, txArg] = tokenRepo.setTokenHash.mock.calls[0];
    expect(txArg).toBe("job-tx");
    const [link, hours] = buildEmail.mock.calls[0];
    expect(hours).toBe(24);
    const raw = decodeURIComponent(new URL(link).searchParams.get("token")!);
    expect(
      link.startsWith("https://app.example.com/confirm-email-change?token="),
    ).toBe(true);
    expect(storedHash).toBe(
      crypto.createHash("sha256").update(raw).digest("hex"),
    );
    expect(storedHash).not.toBe(raw);
    expect(emailSender.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "new@example.com", subject: "Confirm" }),
    );
  });

  it.each([
    ["missing", null],
    ["superseded", makeRequest({ usedAt: NOW })],
    ["expired", makeRequest({ expiresAt: NOW })],
  ])("sends nothing for a %s request", async (_name, row) => {
    const { sut, tokenRepo, emailSender } = build();
    tokenRepo.findById.mockResolvedValue(row);

    await sut.executeInTransaction(REQUEST_ID, "job-tx");

    expect(tokenRepo.setTokenHash).not.toHaveBeenCalled();
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it("lets a failed send throw, so the job's transaction rolls the hash back", async () => {
    const { sut, tokenRepo, emailSender } = build();
    tokenRepo.findById.mockResolvedValue(makeRequest());
    emailSender.send.mockRejectedValue(new Error("smtp down"));

    await expect(
      sut.executeInTransaction(REQUEST_ID, "job-tx"),
    ).rejects.toThrow("smtp down");
  });
});
