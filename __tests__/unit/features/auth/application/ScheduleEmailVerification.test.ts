import { jest } from "@jest/globals";
import { ScheduleEmailVerification } from "@/features/auth/application/use-cases/ScheduleEmailVerification.js";
import type { MessageQueuePort } from "@/shared/application/ports/MessageQueuePort.js";
import {
  EXCHANGES,
  ROUTING_KEYS,
} from "@/shared/application/messaging/job-routes.js";

const USER_ID = "8c0e2b1a-4f5d-4e6a-9b7c-1d2e3f4a5b6c";

const build = (enabled: boolean) => {
  const queue: jest.Mocked<MessageQueuePort> = {
    isEnabled: jest.fn(() => enabled),
    publish: jest.fn(async () => undefined),
    close: jest.fn(async () => undefined),
  };
  const sendInProcess = jest.fn();
  const sendJobInProcess = jest.fn();
  const sut = new ScheduleEmailVerification(queue, {
    sendInProcess,
    sendJobInProcess,
  });
  return { sut, queue, sendInProcess, sendJobInProcess };
};

describe("ScheduleEmailVerification", () => {
  it("publishes the user id, and nothing else, when the queue is on", async () => {
    const { sut, queue, sendInProcess } = build(true);

    await sut.execute({ userId: USER_ID, reason: "register" });

    expect(queue.publish).toHaveBeenCalledTimes(1);
    const [exchange, payload, options] = queue.publish.mock.calls[0];
    expect(exchange).toBe(EXCHANGES.JOBS);
    // durable-verification-email D-02: no address, no token in the broker.
    expect(payload).toEqual({ userId: USER_ID });
    expect(options.routingKey).toBe(ROUTING_KEYS.AUTH_SEND_VERIFICATION_EMAIL);
    expect(options.messageId).toMatch(/^[0-9a-f-]{36}$/);
    expect(sendInProcess).not.toHaveBeenCalled();
  });

  it("gives every job its own message id", async () => {
    const { sut, queue } = build(true);

    await sut.execute({ userId: USER_ID, reason: "register" });
    await sut.execute({ userId: USER_ID, reason: "resend" });

    const [first, second] = queue.publish.mock.calls.map(
      ([, , options]) => options.messageId,
    );
    expect(first).not.toBe(second);
  });

  // D-04: a failed publish never fails the request. queue-failure-paths D-03 (audit
  // 2026-10-20 X68): the publish may have reached the broker, so the fallback is the job
  // itself, under the same message id, and the worker's copy is a duplicate.
  it("sends the job in process under the message id it tried to publish", async () => {
    const { sut, queue, sendInProcess, sendJobInProcess } = build(true);
    queue.publish.mockRejectedValueOnce(new Error("Timeout"));

    await expect(
      sut.execute({ userId: USER_ID, reason: "resend" }),
    ).resolves.toBeUndefined();

    const published = queue.publish.mock.calls[0][2].messageId;
    expect(sendJobInProcess).toHaveBeenCalledWith({
      userId: USER_ID,
      reason: "resend",
      messageId: published,
    });
    expect(sendInProcess).not.toHaveBeenCalled();
  });

  it("sends in process when the queue is off", async () => {
    const { sut, queue, sendInProcess } = build(false);

    await sut.execute({ userId: USER_ID, reason: "register" });

    expect(queue.publish).not.toHaveBeenCalled();
    expect(sendInProcess).toHaveBeenCalledWith({
      userId: USER_ID,
      reason: "register",
    });
  });
});
