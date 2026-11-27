import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { getRequestId } from "@/shared/middleware/request-id.js";
import { JobSlots } from "@/shared/infrastructure/queue/JobSlots.js";

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
    // Down, so a pending reopen does nothing here (ReopeningChannel.test.ts covers it).
    isConnected: () => false,
  }),
}));

jest.mock("@/shared/infrastructure/queue/topology.js", () => ({
  assertTopology: jest.fn(async () => undefined),
  assertRetryTier: jest.fn(async () => undefined),
  retryQueueFor: (queue: string, delayMs: number) =>
    `${queue}.retry.${delayMs}`,
}));

/** The amqplib channel `setup` is handed, as the library hands it. */
const rawChannel = (consumerTag: string) => {
  const closeListeners: Array<() => void> = [];
  return {
    on: jest.fn(),
    once: jest.fn((event: string, listener: () => void) => {
      if (event === "close") closeListeners.push(listener);
    }),
    /** The channel closing under the consumer, as amqplib reports it. */
    fireClose: () => closeListeners.forEach((listener) => listener()),
    prefetch: jest.fn(async (count: number) => {
      void count;
    }),
    consume: jest.fn(async () => ({ consumerTag })),
    close: jest.fn(async () => undefined),
    cancel: jest.fn(async (tag: string) => {
      void tag;
    }),
  };
};

const build = async () => {
  const { RabbitMQConsumer } =
    await import("@/shared/infrastructure/queue/RabbitMQConsumer.js");
  return new RabbitMQConsumer({
    slots: new JobSlots(10),
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

    // Stopping, it closes the channel rather than declaring anything on it (ADR-0102).
    expect(afterReconnect.close).toHaveBeenCalledTimes(1);
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

  // #312 (audit 2026-11-14 Y61): the broker closed the channel, and its consumer with it.
  it("forgets the consumer of a channel the broker closed", async () => {
    const consumer = await build();
    const raw = rawChannel("tag-1");
    await setup!(raw);

    raw.fireClose();
    await consumer.cancel();

    expect(raw.cancel).not.toHaveBeenCalled();
  });

  // Review M2 on #312: a deleted queue cancels its consumer and leaves the channel open,
  // so nothing would reopen it.
  it("closes its channel when the broker cancels the consumer, so it is reopened", async () => {
    const consumer = await build();
    const raw = rawChannel("tag-1");
    let onMessage: ((msg: unknown) => void) | undefined;
    raw.consume.mockImplementationOnce((async (
      queue: string,
      callback: (msg: unknown) => void,
    ) => {
      void queue;
      onMessage = callback;
      return { consumerTag: "tag-1" };
    }) as never);
    await setup!(raw);

    onMessage!(null);
    expect(raw.close).toHaveBeenCalledTimes(1);

    await consumer.cancel();
    expect(raw.cancel).not.toHaveBeenCalled();
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
      slots: new JobSlots(10),
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

// ADR-0100 (#310, audit 2026-11-14 X62): a job runs only when one of the
// worker's slots is free, so jobs never outnumber the pool's connections.
describe("RabbitMQConsumer job slots", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setup = undefined;
  });

  const deferred = () => {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

  const flush = () => new Promise((resolve) => setImmediate(resolve));

  const message = (id: string) => ({
    content: Buffer.from("{}"),
    properties: { messageId: id, headers: {} },
  });

  const start = async (
    slots: JobSlots,
    handler: (msg: { properties: { messageId: string } }) => Promise<void>,
  ) => {
    const { RabbitMQConsumer } =
      await import("@/shared/infrastructure/queue/RabbitMQConsumer.js");
    const publish = jest.fn(async () => undefined);
    const consumer = new RabbitMQConsumer({
      slots,
      queue: "test.queue",
      handler: handler as never,
      maxRetries: 3,
      retryBaseDelayMs: 1000,
      publisher: {
        isEnabled: () => true,
        publish,
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
      nack: jest.fn(),
    };
    await setup!(raw);
    return {
      consumer,
      raw,
      publish,
      deliver: (id: string) => deliver!(message(id)),
    };
  };

  it("with one slot, starts a second job only once the first has settled", async () => {
    const first = deferred();
    const started: string[] = [];
    const { raw, deliver } = await start(new JobSlots(1), async (msg) => {
      started.push(msg.properties.messageId);
      if (msg.properties.messageId === "m-1") await first.promise;
    });

    deliver("m-1");
    deliver("m-2");
    await flush();
    expect(started).toEqual(["m-1"]);

    first.resolve();
    await flush();
    await flush();
    expect(started).toEqual(["m-1", "m-2"]);
    expect(raw.ack).toHaveBeenCalledTimes(2);
  });

  it("frees the slot when a job fails, and the next one runs", async () => {
    const started: string[] = [];
    const { raw, publish, deliver } = await start(
      new JobSlots(1),
      async (msg) => {
        started.push(msg.properties.messageId);
        if (msg.properties.messageId === "m-1") throw new Error("smtp down");
      },
    );

    deliver("m-1");
    deliver("m-2");
    await flush();
    await flush();
    await flush();

    expect(started).toEqual(["m-1", "m-2"]);
    expect(publish).toHaveBeenCalledTimes(1); // m-1 went to its retry queue
    expect(raw.ack).toHaveBeenCalledTimes(2); // m-1 after the republish, m-2 done
  });

  it("on cancel, returns a job still waiting for a slot to the queue unstarted", async () => {
    const first = deferred();
    const started: string[] = [];
    const slots = new JobSlots(1);
    const { consumer, raw, publish, deliver } = await start(
      slots,
      async (msg) => {
        started.push(msg.properties.messageId);
        await first.promise;
      },
    );

    deliver("m-1");
    deliver("m-2");
    await flush();
    expect(slots.waiting).toBe(1);

    await consumer.cancel();
    await flush();

    // Requeued as it came: not a retry, never started.
    expect(raw.nack).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: expect.objectContaining({ messageId: "m-2" }),
      }),
      false,
      true,
    );
    expect(publish).not.toHaveBeenCalled();
    expect(slots.waiting).toBe(0);

    first.resolve();
    await flush();
    expect(started).toEqual(["m-1"]);
    expect(raw.ack).toHaveBeenCalledTimes(1);
    expect(slots.running).toBe(0);
  });

  it("drains without waiting on a job that never got a slot", async () => {
    // The one slot is held by another consumer's job, which stays running
    // through the drain: only the abort lets this consumer's waiter go.
    const slots = new JobSlots(1);
    const holder = deferred();
    const other = await start(slots, async () => {
      await holder.promise;
    });
    other.deliver("held");
    const { consumer, raw, deliver } = await start(
      slots,
      async () => undefined,
    );
    deliver("m-1");
    await flush();
    expect(slots.waiting).toBe(1);

    await consumer.cancel();
    await expect(consumer.drain(5_000)).resolves.toBeUndefined();

    expect(slots.running).toBe(1); // the other consumer's job is still running
    expect(raw.nack).toHaveBeenCalledWith(expect.anything(), false, true);
    holder.resolve();
  });

  it("drops a waiting job whose channel closed, without settling it there", async () => {
    const slots = new JobSlots(1);
    const holder = deferred();
    const started: string[] = [];
    const { raw, deliver } = await start(slots, async (msg) => {
      started.push(msg.properties.messageId);
      await holder.promise;
    });
    deliver("m-1");
    deliver("m-2");
    await flush();
    expect(slots.waiting).toBe(1);

    // The broker requeues both with the channel; m-2 must not run on it.
    raw.fireClose();
    await flush();
    expect(slots.waiting).toBe(0);

    holder.resolve();
    await flush();
    expect(started).toEqual(["m-1"]);
    expect(raw.nack).not.toHaveBeenCalled();
  });

  it("prefetches no more than its slots can run", async () => {
    const { raw } = await start(new JobSlots(3), async () => undefined);

    expect(raw.prefetch).toHaveBeenCalledWith(3);
  });

  it("shares its slots with another consumer", async () => {
    const slots = new JobSlots(1);
    const first = deferred();
    const started: string[] = [];
    const a = await start(slots, async (msg) => {
      started.push(`a:${msg.properties.messageId}`);
      await first.promise;
    });
    const b = await start(slots, async (msg) => {
      started.push(`b:${msg.properties.messageId}`);
    });

    a.deliver("m-1");
    b.deliver("m-2");
    await flush();
    expect(started).toEqual(["a:m-1"]);

    first.resolve();
    await flush();
    await flush();
    expect(started).toEqual(["a:m-1", "b:m-2"]);
  });
});
