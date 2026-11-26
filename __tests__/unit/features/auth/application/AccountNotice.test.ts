import { jest } from "@jest/globals";
import { ScheduleAccountNotice } from "@/features/auth/application/use-cases/ScheduleAccountNotice.js";
import { SendAccountNotice } from "@/features/auth/application/use-cases/SendAccountNotice.js";
import { SendAccountNoticeHandler } from "@/features/auth/application/use-cases/SendAccountNoticeHandler.js";
import { UserRepository } from "@/features/auth/domain/repositories/UserRepository.js";
import { EmailChangeTokenRepository } from "@/features/auth/domain/repositories/EmailChangeTokenRepository.js";
import { EmailChangeToken } from "@/features/auth/domain/entities/EmailChangeToken.js";
import { AuthUser } from "@/features/auth/domain/entities/AuthUser.js";
import type { EmailSender } from "@/features/auth/application/ports/EmailSender.js";
import type { MessageQueuePort } from "@/shared/application/ports/MessageQueuePort.js";
import type { MessageIdempotencyPort } from "@/shared/application/ports/MessageIdempotencyPort.js";
import type { IncomingMessage } from "@/shared/application/ports/MessageHandlerPort.js";
import { isTerminalMessageError } from "@/shared/application/errors/TerminalMessageError.js";
import {
  EXCHANGES,
  ROUTING_KEYS,
} from "@/shared/application/messaging/job-routes.js";
import logger from "@/utils/logger.js";

const USER_ID = "8c0e2b1a-4f5d-4e6a-9b7c-1d2e3f4a5b6c";
const REQUEST_ID = "5b1d9c2e-0a7f-4c3b-8e6d-2f4a1b3c5d7e";
const NOW = new Date("2026-11-25T10:00:00.000Z");

const request = (userId = USER_ID) =>
  EmailChangeToken.fromPersistence({
    id: REQUEST_ID,
    userId,
    newEmail: "new@example.com",
    oldEmail: "old@example.com",
    tokenHash: null,
    expiresAt: NOW,
    usedAt: NOW,
    createdAt: NOW,
  });

const user = () =>
  AuthUser.fromPersistence({
    id: USER_ID,
    email: "account@example.com",
    username: "tester",
    passwordHash: "hash",
    isPublicProfile: true,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  });

describe("ScheduleAccountNotice (credential-changes D-05)", () => {
  const build = (enabled = true) => {
    const queue = {
      isEnabled: jest.fn(() => enabled),
      publish: jest.fn<MessageQueuePort["publish"]>(),
      close: jest.fn(),
    } as unknown as jest.Mocked<MessageQueuePort>;
    const deps = { sendInProcess: jest.fn(), sendJobInProcess: jest.fn() };
    return { sut: new ScheduleAccountNotice(queue, deps), queue, deps };
  };
  const job = { userId: USER_ID, notice: "password_changed" as const };

  it("publishes ids only", async () => {
    const { sut, queue, deps } = build();

    await sut.execute(job);

    expect(queue.publish).toHaveBeenCalledWith(EXCHANGES.JOBS, job, {
      routingKey: ROUTING_KEYS.AUTH_SEND_ACCOUNT_NOTICE,
      messageId: expect.any(String),
    });
    expect(deps.sendInProcess).not.toHaveBeenCalled();
  });

  it("sends in process with the queue off", async () => {
    const { sut, queue, deps } = build(false);

    await sut.execute(job);

    expect(queue.publish).not.toHaveBeenCalled();
    expect(deps.sendInProcess).toHaveBeenCalledWith(job);
  });

  it("runs the job in process under the id it tried, after a failed publish (ADR-0080)", async () => {
    const { sut, queue, deps } = build();
    queue.publish.mockRejectedValue(new Error("unroutable"));
    jest.spyOn(logger, "warn").mockImplementation(() => logger);

    await expect(sut.execute(job)).resolves.toBeUndefined();

    const { messageId } = queue.publish.mock.calls[0][2];
    expect(deps.sendJobInProcess).toHaveBeenCalledWith({ ...job, messageId });
  });
});

describe("SendAccountNotice (AC-7, AC-10)", () => {
  const build = () => {
    const userRepo = {
      findById: jest.fn<UserRepository["findById"]>(),
    } as unknown as jest.Mocked<UserRepository>;
    const tokenRepo = {
      findById: jest.fn<EmailChangeTokenRepository["findById"]>(),
    } as unknown as jest.Mocked<EmailChangeTokenRepository>;
    const emailSender: jest.Mocked<EmailSender> = { send: jest.fn() };
    const deps = {
      buildEmailChangeNotice: jest.fn((newEmail: string) => ({
        subject: "Changing",
        text: newEmail,
        html: newEmail,
      })),
      buildPasswordChanged: jest.fn(() => ({
        subject: "Changed",
        text: "t",
        html: "h",
      })),
    };
    const sut = new SendAccountNotice(userRepo, tokenRepo, emailSender, deps);
    return { sut, userRepo, tokenRepo, emailSender, deps };
  };

  it("sends the change notice to the row's old address, through the job's transaction", async () => {
    const { sut, tokenRepo, emailSender, deps } = build();
    tokenRepo.findById.mockResolvedValue(request());

    await sut.executeInTransaction(
      {
        userId: USER_ID,
        notice: "email_change_requested",
        requestId: REQUEST_ID,
      },
      "job-tx",
    );

    expect(tokenRepo.findById).toHaveBeenCalledWith(REQUEST_ID, "job-tx");
    expect(deps.buildEmailChangeNotice).toHaveBeenCalledWith("new@example.com");
    expect(emailSender.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "old@example.com", subject: "Changing" }),
    );
  });

  it("sends nothing for a request that belongs to another user", async () => {
    const { sut, tokenRepo, emailSender } = build();
    tokenRepo.findById.mockResolvedValue(request("someone-else"));

    await sut.executeInTransaction(
      {
        userId: USER_ID,
        notice: "email_change_requested",
        requestId: REQUEST_ID,
      },
      "job-tx",
    );

    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it("sends the password notice to the account's address", async () => {
    const { sut, userRepo, emailSender } = build();
    userRepo.findById.mockResolvedValue(user());

    await sut.executeInTransaction(
      { userId: USER_ID, notice: "password_changed" },
      "job-tx",
    );

    expect(userRepo.findById).toHaveBeenCalledWith(USER_ID, "job-tx");
    expect(emailSender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "account@example.com",
        subject: "Changed",
      }),
    );
  });

  it("logs a failed send in process instead of throwing", async () => {
    const { sut, userRepo, emailSender } = build();
    userRepo.findById.mockResolvedValue(user());
    emailSender.send.mockRejectedValue(new Error("smtp down"));
    const error = jest.spyOn(logger, "error").mockImplementation(() => logger);

    await expect(
      sut.execute({ userId: USER_ID, notice: "password_changed" }),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("Failed to send account notice", {
      userId: USER_ID,
      notice: "password_changed",
      error: expect.any(Error),
    });
  });
});

describe("SendAccountNoticeHandler", () => {
  const QUEUE = "lakira.auth.send-account-notice";
  const message = (body: unknown): IncomingMessage => ({
    content: Buffer.from(JSON.stringify(body)),
    properties: { messageId: "msg-1" },
  });
  const build = () => {
    const executeInTransaction = jest.fn(async () => undefined);
    const idempotency: jest.Mocked<MessageIdempotencyPort> = {
      runOnce: jest.fn(async (_key, work) => {
        await work("job-tx");
        return "processed" as const;
      }),
    };
    const sut = new SendAccountNoticeHandler(
      { executeInTransaction } as unknown as SendAccountNotice,
      idempotency,
    );
    return { sut, executeInTransaction, idempotency };
  };

  it("sends inside the idempotency transaction, keyed by message and queue", async () => {
    const { sut, executeInTransaction, idempotency } = build();
    const job = {
      userId: USER_ID,
      notice: "email_change_requested",
      requestId: REQUEST_ID,
    };

    await sut.handle(message(job), { queue: QUEUE });

    expect(idempotency.runOnce).toHaveBeenCalledWith(
      { messageId: "msg-1", queue: QUEUE },
      expect.any(Function),
    );
    expect(executeInTransaction).toHaveBeenCalledWith(job, "job-tx");
  });

  it("drops a stray request id from a password notice", async () => {
    const { sut, executeInTransaction } = build();

    await sut.handle(
      message({
        userId: USER_ID,
        notice: "password_changed",
        requestId: REQUEST_ID,
      }),
      { queue: QUEUE },
    );

    expect(executeInTransaction).toHaveBeenCalledWith(
      { userId: USER_ID, notice: "password_changed" },
      "job-tx",
    );
  });

  it.each([
    ["no user id", { notice: "password_changed" }],
    ["an unknown notice", { userId: USER_ID, notice: "account_deleted" }],
    [
      "a change notice without a request id",
      { userId: USER_ID, notice: "email_change_requested" },
    ],
  ])("parks a job with %s", async (_name, body) => {
    const { sut, executeInTransaction } = build();

    const error = await sut.handle(message(body), { queue: QUEUE }).then(
      () => null,
      (e: unknown) => e,
    );

    expect(isTerminalMessageError(error)).toBe(true);
    expect(executeInTransaction).not.toHaveBeenCalled();
  });
});
