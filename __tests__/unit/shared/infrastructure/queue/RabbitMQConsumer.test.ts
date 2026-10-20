import { describe, it, expect, jest } from "@jest/globals";

const channel = {
  cancel: jest.fn(async () => undefined),
  close: jest.fn(async () => undefined),
};

jest.mock("@/shared/infrastructure/queue/RabbitMQConnection.js", () => ({
  connectRabbitMQ: () => ({ createChannel: () => channel }),
}));

// ADR-0076 decision 3: the worker bounds its consumers' drain inside its
// shutdown deadline.
describe("RabbitMQConsumer.close", () => {
  it("drains for the time it is given, then closes the channel", async () => {
    const { RabbitMQConsumer } =
      await import("@/shared/infrastructure/queue/RabbitMQConsumer.js");
    const consumer = new RabbitMQConsumer({
      queue: "test.queue",
      handler: async () => undefined,
      publisher: {
        isEnabled: () => true,
        publish: async () => undefined,
        close: async () => undefined,
      },
    });
    const drain = jest.spyOn(consumer, "drain");

    await consumer.close(1_234);

    expect(drain).toHaveBeenCalledWith(1_234);
    expect(channel.close).toHaveBeenCalled();
  });
});
