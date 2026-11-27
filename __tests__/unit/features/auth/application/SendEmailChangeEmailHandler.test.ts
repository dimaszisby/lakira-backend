import { jest } from "@jest/globals";
import { SendEmailChangeEmailHandler } from "@/features/auth/application/use-cases/SendEmailChangeEmailHandler.js";
import type { RequestEmailChange } from "@/features/auth/application/use-cases/RequestEmailChange.js";
import type { MessageIdempotencyPort } from "@/shared/application/ports/MessageIdempotencyPort.js";
import type { IncomingMessage } from "@/shared/application/ports/MessageHandlerPort.js";
import { isTerminalMessageError } from "@/shared/application/errors/TerminalMessageError.js";

const REQUEST_ID = "5b1d9c2e-0a7f-4c3b-8e6d-2f4a1b3c5d7e";
const QUEUE = "lakira.auth.send-email-change-email";

const message = (body: string): IncomingMessage => ({
  content: Buffer.from(body),
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
  const sut = new SendEmailChangeEmailHandler(
    { executeInTransaction } as unknown as RequestEmailChange,
    idempotency,
  );
  return { sut, executeInTransaction, idempotency };
};

describe("SendEmailChangeEmailHandler (credential-changes D-05)", () => {
  it("mints and sends inside the idempotency transaction", async () => {
    const { sut, executeInTransaction, idempotency } = build();

    await sut.handle(message(JSON.stringify({ requestId: REQUEST_ID })), {
      queue: QUEUE,
    });

    expect(idempotency.runOnce).toHaveBeenCalledWith(
      { messageId: "msg-1", queue: QUEUE },
      expect.any(Function),
    );
    expect(executeInTransaction).toHaveBeenCalledWith(REQUEST_ID, "job-tx");
  });

  it("lets a failed send throw, so the consumer retries it", async () => {
    const { sut, executeInTransaction } = build();
    executeInTransaction.mockRejectedValueOnce(new Error("smtp down"));

    await expect(
      sut.handle(message(JSON.stringify({ requestId: REQUEST_ID })), {
        queue: QUEUE,
      }),
    ).rejects.toThrow("smtp down");
  });

  it.each([
    ["not JSON", "{"],
    ["no request id", JSON.stringify({})],
    ["a request id that is not a UUID", JSON.stringify({ requestId: "1" })],
  ])("parks a message with %s", async (_name, body) => {
    const { sut, executeInTransaction } = build();

    const error = await sut.handle(message(body), { queue: QUEUE }).then(
      () => null,
      (e: unknown) => e,
    );

    expect(isTerminalMessageError(error)).toBe(true);
    expect(executeInTransaction).not.toHaveBeenCalled();
  });
});
