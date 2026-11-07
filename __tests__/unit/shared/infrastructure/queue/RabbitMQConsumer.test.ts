import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { getRequestId } from "@/shared/middleware/request-id.js";

type Setup = (ch: unknown) => Promise<void>;
let setup: Setup | undefined;

const channel = {
  cancel: jest.fn(async () => undefined),
  close: jest.fn(async () => undefined),
  on: jest.fn(),
};

jest.mock("@/shared/infrastructure/queue/RabbitMQConnection.js", () => ({
  absorbChannelErrors: jest.fn(),
  connectRabbitMQ: () => ({
    createChannel: (options: { setup: Setup }) => {
      setup = options.setup;
      return channel;
    },
  }),
}));

jest.mock("@/shared/infrastructure/queue/topology.js", () => ({
  assertTopology: jest.fn(async () => undefined),
  assertRetryTier: jest.fn(async () => undefined),
  retryQueueFor: (queue: string, delayMs: number) =>
    `${queue}.retry.${delayMs}`,
}));

const topologyMock = jest.requireMock(
  "@/shared/infrastructure/queue/topology.js",
) as { assertTopology: jest.Mock };

/** The amqplib channel `setup` is handed, as the library hands it. */
const rawChannel = (consumerTag: string) => ({
  on: jest.fn(),
  prefetch: jest.fn(async () => undefined),
  consume: jest.fn(async () => ({ consumerTag })),
  cancel: jest.fn(async (tag: string) => {
    void tag;
  }),
});

const build = async () => {
  const { RabbitMQConsumer } =
    await import("@/shared/infrastructure/queue/RabbitMQConsumer.js");
  return new RabbitMQConsumer({
    queue: "test.queue",
    handler: async () => undefined,
    publisher: {
      isEnabled: () => true,
      publish: async () => undefined,
      close: async () => undefined,
    },
  });
};

describe("RabbitMQConsumer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setup = undefined;
  });

  // ADR-0076 decision 3: the worker bounds its consumers' drain inside its
  // shutdown deadline.
  it("drains for the time it is given, then closes the channel", async () => {
    const consumer = await build();
    const drain = jest.spyOn(consumer, "drain");

    await consumer.close(1_234);

    expect(drain).toHaveBeenCalledWith(1_234);
    expect(channel.close).toHaveBeenCalled();
  });

  // worker-cancel-and-one-connection-per-job D-01 (audit 2026-10-20, X60). The
  // consumer is registered on the raw channel, which the wrapper does not track,
  // so only that channel can cancel it.
  it("cancels its consumer on the channel that registered it", async () => {
    const consumer = await build();
    const raw = rawChannel("tag-1");
    await setup!(raw);

    await consumer.cancel();

    expect(raw.cancel).toHaveBeenCalledWith("tag-1");
  });

  it("does not consume again when a reconnect runs setup after cancel", async () => {
    const consumer = await build();
    await setup!(rawChannel("tag-1"));
    await consumer.cancel();

    const afterReconnect = rawChannel("tag-2");
    await setup!(afterReconnect);

    expect(topologyMock.assertTopology).toHaveBeenLastCalledWith(
      afterReconnect,
    );
    expect(afterReconnect.consume).not.toHaveBeenCalled();
  });

  it("cancels the tag of the latest channel after a reconnect", async () => {
    const consumer = await build();
    const first = rawChannel("tag-1");
    await setup!(first);
    const second = rawChannel("tag-2");
    await setup!(second);

    await consumer.cancel();

    expect(second.cancel).toHaveBeenCalledWith("tag-2");
    expect(first.cancel).not.toHaveBeenCalled();
  });

  it("cancels a consumer whose registration finishes after cancel", async () => {
    const consumer = await build();
    const raw = rawChannel("tag-late");
    let finishConsume!: () => void;
    raw.consume.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishConsume = () => resolve({ consumerTag: "tag-late" });
        }),
    );

    const settingUp = setup!(raw);
    await new Promise((resolve) => setImmediate(resolve));
    await consumer.cancel();
    finishConsume();
    await settingUp;

    expect(raw.cancel).toHaveBeenCalledWith("tag-late");
  });

  it("survives a cancel the closed channel refuses", async () => {
    const consumer = await build();
    const raw = rawChannel("tag-1");
    raw.cancel.mockRejectedValueOnce(new Error("Channel closed"));
    await setup!(raw);

    await expect(consumer.cancel()).resolves.toBeUndefined();
  });

  // queue-failure-paths D-01 (audit 2026-10-20 X63): a failed setup emitted `error` to no
  // listener and took the process down.
  it("listens for its channel's errors", async () => {
    await build();
    expect(channel.on).toHaveBeenCalledWith("error", expect.any(Function));
    const onError = channel.on.mock.calls.find((c) => c[0] === "error")![1] as (
      error: Error,
    ) => void;
    expect(() => onError(new Error("PRECONDITION_FAILED"))).not.toThrow();
  });

  // N4: the worker logs a job under the id of the request that published it.
  it("runs the handler under the message's request id, and mints one for a bad id", async () => {
    const seen: (string | undefined)[] = [];
    const { RabbitMQConsumer } =
      await import("@/shared/infrastructure/queue/RabbitMQConsumer.js");
    new RabbitMQConsumer({
      queue: "test.queue",
      handler: async () => {
        seen.push(getRequestId());
      },
      publisher: {
        isEnabled: () => true,
        publish: async () => undefined,
        close: async () => undefined,
      },
    });
    let deliver: ((msg: unknown) => void) | undefined;
    const raw = {
      ...rawChannel("tag-1"),
      consume: jest.fn(
        async (_queue: string, onMessage: (m: unknown) => void) => {
          deliver = onMessage;
          return { consumerTag: "tag-1" };
        },
      ),
      ack: jest.fn(),
    };
    await setup!(raw);

    const message = (requestId?: unknown) => ({
      content: Buffer.from("{}"),
      properties: {
        messageId: "m-1",
        headers: requestId === undefined ? {} : { "x-request-id": requestId },
      },
    });
    deliver!(message("req-7"));
    deliver!(message("not a valid id\n"));
    deliver!(message());
    await new Promise((resolve) => setImmediate(resolve));

    expect(seen[0]).toBe("req-7");
    expect(seen[1]).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen[2]).toMatch(/^[0-9a-f-]{36}$/);
    expect(raw.ack).toHaveBeenCalledTimes(3);
  });
});
