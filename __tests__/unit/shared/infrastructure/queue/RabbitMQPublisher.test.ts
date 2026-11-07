import { EventEmitter } from "events";
import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { requestIdStorage } from "@/shared/middleware/request-id.js";

type Setup = (ch: unknown) => Promise<void>;
type PublishOptions = { messageId: string; headers?: Record<string, unknown> };

/** A ChannelWrapper: an EventEmitter that throws on an `error` nobody listens to. */
class FakeWrapper extends EventEmitter {
  setup: Setup | undefined;
  /** Runs while a publish is in flight, before its confirm resolves. */
  beforeConfirm: (options: PublishOptions) => void = () => undefined;
  publish = jest.fn(
    async (
      exchange: string,
      routingKey: string,
      content: Buffer,
      options: PublishOptions,
    ) => {
      void exchange;
      void routingKey;
      void content;
      this.beforeConfirm(options);
      return true;
    },
  );
  close = jest.fn(async () => undefined);
}

let wrapper: FakeWrapper;
const createChannel = jest.fn((options: { setup: Setup }) => {
  wrapper.setup = options.setup;
  return wrapper;
});

jest.mock("@/shared/infrastructure/queue/RabbitMQConnection.js", () => ({
  ...(jest.requireActual(
    "@/shared/infrastructure/queue/RabbitMQConnection.js",
  ) as object),
  connectRabbitMQ: () => ({ createChannel }),
}));

jest.mock("@/shared/infrastructure/queue/topology.js", () => ({
  assertTopology: jest.fn(async () => undefined),
}));

jest.mock("@/config/envManager.js", () => ({
  env: { RABBITMQ_ENABLED: true },
}));

const build = async () => {
  const { RabbitMQPublisher } =
    await import("@/shared/infrastructure/queue/RabbitMQPublisher.js");
  const publisher = new RabbitMQPublisher();
  // The raw confirm channel `setup` is handed; it emits `return`.
  const raw = new EventEmitter();
  await wrapper.setup!(raw);
  return { publisher, raw };
};

const publishOne = (
  publisher: Awaited<ReturnType<typeof build>>["publisher"],
  headers?: Record<string, unknown>,
) =>
  publisher.publish(
    "jobs",
    { userId: "u-1" },
    { routingKey: "auth.x", messageId: "m-1", headers },
  );

describe("RabbitMQPublisher", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    wrapper = new FakeWrapper();
  });

  // durable-verification-email D-04. Without a timeout, a publish made while the
  // broker is unreachable waits for a reconnect, and so does the request behind it.
  it("gives every publish a timeout", async () => {
    const { PUBLISH_TIMEOUT_MS } =
      await import("@/shared/infrastructure/queue/RabbitMQPublisher.js");
    await build();

    expect(PUBLISH_TIMEOUT_MS).toBeGreaterThan(0);
    expect(createChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        confirm: true,
        publishTimeout: PUBLISH_TIMEOUT_MS,
      }),
    );
  });

  // queue-failure-paths D-01 (audit 2026-10-20 X63): a failed setup emitted `error` to no
  // listener, and the rejection stopped the API.
  it("survives a channel error and reports the queue unavailable until it reconnects", async () => {
    const { publisher, raw } = await build();
    expect(publisher.isEnabled()).toBe(true);

    // The broker closing the raw channel with an error is not thrown at the connection.
    expect(() =>
      raw.emit("error", new Error("Channel closed by server: 406")),
    ).not.toThrow();

    expect(() =>
      wrapper.emit("error", new Error("PRECONDITION_FAILED"), {
        name: "publisher",
      }),
    ).not.toThrow();
    expect(publisher.isEnabled()).toBe(false);

    wrapper.emit("connect");
    expect(publisher.isEnabled()).toBe(true);
  });

  // D-02 (X64): the broker returns an unroutable message, then confirms it.
  it("rejects a publish the broker returned as unroutable", async () => {
    const { publisher, raw } = await build();
    wrapper.beforeConfirm = (options) =>
      raw.emit("return", {
        fields: { exchange: "jobs", routingKey: "auth.x" },
        properties: { messageId: options.messageId },
      });

    await expect(publishOne(publisher)).rejects.toMatchObject({
      name: "UnroutableMessageError",
    });

    // A later publish under another id is not mistaken for it.
    wrapper.beforeConfirm = () => undefined;
    await expect(
      publisher.publish("jobs", {}, { routingKey: "auth.x", messageId: "m-2" }),
    ).resolves.toBeUndefined();
  });

  // N4: a job published within a request carries the request's id.
  it("carries the request id in the headers, beside the caller's", async () => {
    const { publisher } = await build();

    await requestIdStorage.run("req-7", () =>
      publishOne(publisher, { "x-retry-count": 1 }),
    );
    await publishOne(publisher);

    const headers = wrapper.publish.mock.calls.map(
      (call) => (call[3] as PublishOptions).headers,
    );
    expect(headers[0]).toEqual({ "x-retry-count": 1, "x-request-id": "req-7" });
    expect(headers[1]).toBeUndefined();
  });
});
