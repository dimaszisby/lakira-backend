import { describe, it, expect, jest } from "@jest/globals";

const createChannel = jest.fn((options: unknown) => {
  void options;
  return { publish: jest.fn(async () => true), close: jest.fn() };
});

jest.mock("@/shared/infrastructure/queue/RabbitMQConnection.js", () => ({
  connectRabbitMQ: () => ({ createChannel }),
}));

// durable-verification-email D-04. Without a timeout, a publish made while the
// broker is unreachable waits for a reconnect, and so does the request behind it.
describe("RabbitMQPublisher", () => {
  it("gives every publish a timeout", async () => {
    const { RabbitMQPublisher, PUBLISH_TIMEOUT_MS } =
      await import("@/shared/infrastructure/queue/RabbitMQPublisher.js");

    new RabbitMQPublisher();

    expect(PUBLISH_TIMEOUT_MS).toBeGreaterThan(0);
    expect(createChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        confirm: true,
        publishTimeout: PUBLISH_TIMEOUT_MS,
      }),
    );
  });
});
