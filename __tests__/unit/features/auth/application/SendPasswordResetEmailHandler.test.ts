import { jest } from "@jest/globals";
import { SendPasswordResetEmailHandler } from "@/features/auth/application/use-cases/SendPasswordResetEmailHandler.js";
import type { RequestPasswordReset } from "@/features/auth/application/use-cases/RequestPasswordReset.js";
import type { MessageIdempotencyPort } from "@/shared/application/ports/MessageIdempotencyPort.js";
import type { IncomingMessage } from "@/shared/application/ports/MessageHandlerPort.js";
import { isTerminalMessageError } from "@/shared/application/errors/TerminalMessageError.js";

const USER_ID = "8c0e2b1a-4f5d-4e6a-9b7c-1d2e3f4a5b6c";
const QUEUE = "lakira.auth.send-password-reset-email";
const TX = { id: "tx-1" };

const message = (
  body: string,
  messageId: unknown = "msg-1",
): IncomingMessage => ({
  content: Buffer.from(body),
  properties: { messageId },
});

const build = () => {
  const executeInTransaction = jest.fn(async () => undefined);
  const requestPasswordReset = {
    executeInTransaction,
  } as unknown as RequestPasswordReset;
  const idempotency: jest.Mocked<MessageIdempotencyPort> = {
    runOnce: jest.fn(async (_key, work) => {
      await work(TX);
      return "processed" as const;
    }),
  };
  const sut = new SendPasswordResetEmailHandler(
    requestPasswordReset,
    idempotency,
  );
  return { sut, executeInTransaction, idempotency };
};

const terminal = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(isTerminalMessageError(error)).toBe(true);
};

describe("SendPasswordResetEmailHandler", () => {
  it("sends inside the idempotency transaction, keyed by message and queue", async () => {
    const { sut, executeInTransaction, idempotency } = build();

    await sut.handle(message(JSON.stringify({ userId: USER_ID })), {
      queue: QUEUE,
    });

    expect(idempotency.runOnce).toHaveBeenCalledWith(
      { messageId: "msg-1", queue: QUEUE },
      expect.any(Function),
    );
    expect(executeInTransaction).toHaveBeenCalledWith(USER_ID, TX);
  });

  // durable-password-reset-email D-02: the failure must reach the consumer, which
  // retries; swallowing it would record the message as processed.
  it("lets a failed send throw, so the consumer retries it", async () => {
    const { sut, executeInTransaction } = build();
    executeInTransaction.mockRejectedValueOnce(new Error("smtp down"));

    await expect(
      sut.handle(message(JSON.stringify({ userId: USER_ID })), {
        queue: QUEUE,
      }),
    ).rejects.toThrow("smtp down");
  });

  it("skips a duplicate without sending", async () => {
    const { sut, executeInTransaction, idempotency } = build();
    idempotency.runOnce.mockResolvedValueOnce("duplicate");

    await sut.handle(message(JSON.stringify({ userId: USER_ID })), {
      queue: QUEUE,
    });

    expect(executeInTransaction).not.toHaveBeenCalled();
  });

  it("parks malformed JSON", async () => {
    const { sut, idempotency } = build();

    await terminal(sut.handle(message("{not json"), { queue: QUEUE }));
    expect(idempotency.runOnce).not.toHaveBeenCalled();
  });

  it.each([
    ["no user id", {}],
    ["a user id that is not a UUID", { userId: "user-1" }],
    ["a null body", null],
  ])("parks a job with %s", async (_label, body) => {
    const { sut, idempotency } = build();

    await terminal(sut.handle(message(JSON.stringify(body)), { queue: QUEUE }));
    expect(idempotency.runOnce).not.toHaveBeenCalled();
  });
});
