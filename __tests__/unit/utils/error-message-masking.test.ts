import { EventEmitter } from "events";
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import { Writable } from "node:stream";
import { transports } from "winston";
import { DatabaseError } from "sequelize";
import logger from "@/utils/logger.js";
import {
  drainBackgroundTasks,
  runInBackground,
} from "@/utils/background-tasks.js";
import { ScheduleEmailVerification } from "@/features/auth/application/use-cases/ScheduleEmailVerification.js";

type Setup = (ch: unknown) => Promise<void>;
let consumerSetup: Setup | undefined;

jest.mock("@/shared/infrastructure/queue/RabbitMQConnection.js", () => ({
  absorbChannelErrors: jest.fn(),
  connectRabbitMQ: () => ({
    createChannel: (options: { setup: Setup }) => {
      consumerSetup = options.setup;
      return Object.assign(new EventEmitter(), {
        close: jest.fn(async () => undefined),
      });
    },
  }),
}));

jest.mock("@/shared/infrastructure/queue/topology.js", () => ({
  assertTopology: jest.fn(async () => undefined),
  assertRetryTier: jest.fn(async () => undefined),
  retryQueueFor: (queue: string, delayMs: number) =>
    `${queue}.retry.${delayMs}`,
}));

/**
 * Kit log-and-ci-leaks D-01 (audit 2026-10-20 X3). The logger masks what a database error's
 * message quotes, but only when it is handed the error. These sites handed it the message as a
 * string, and the submitted value reached the line. The real logger, the real Sequelize error.
 */
const EMAIL = "victim@example.com";

const quotingDatabaseError = () =>
  new DatabaseError(
    Object.assign(new Error(`invalid input syntax for type uuid: "${EMAIL}"`), {
      code: "22P02",
      sql: "SELECT 1",
    }) as unknown as ConstructorParameters<typeof DatabaseError>[0],
  );

describe("an error's message that quotes a submitted value", () => {
  let lines: string[];
  let capture: InstanceType<typeof transports.Stream>;

  beforeEach(() => {
    lines = [];
    capture = new transports.Stream({
      stream: new Writable({
        write(chunk, _encoding, done) {
          lines.push(String(chunk));
          done();
        },
      }),
    });
    logger.add(capture);
  });

  afterEach(() => {
    logger.remove(capture);
  });

  const written = () => lines.join("\n");

  it("is masked when a background task fails with it", async () => {
    runInBackground("probe-task", async () => {
      throw quotingDatabaseError();
    });
    await drainBackgroundTasks();

    expect(written()).toContain("probe-task");
    expect(written()).toContain("22P02");
    expect(written()).not.toContain(EMAIL);
  });

  it("is masked when a publish fails with it", async () => {
    const sut = new ScheduleEmailVerification(
      {
        isEnabled: () => true,
        publish: async () => {
          throw quotingDatabaseError();
        },
        close: async () => undefined,
      },
      { sendInProcess: () => undefined, sendJobInProcess: () => undefined },
    );

    await sut.execute({
      userId: "8c0e2b1a-4f5d-4e6a-9b7c-1d2e3f4a5b6c",
      reason: "register",
    });

    expect(written()).toContain("not queued");
    expect(written()).not.toContain(EMAIL);
  });

  it("is masked when a queued job fails with it", async () => {
    const { RabbitMQConsumer } =
      await import("@/shared/infrastructure/queue/RabbitMQConsumer.js");
    new RabbitMQConsumer({
      queue: "test.queue",
      handler: async () => {
        throw quotingDatabaseError();
      },
      publisher: {
        isEnabled: () => true,
        publish: async () => undefined,
        close: async () => undefined,
      },
      maxRetries: 0,
    });
    let deliver: ((msg: unknown) => void) | undefined;
    const nack = jest.fn();
    await consumerSetup!({
      on: jest.fn(),
      prefetch: jest.fn(async () => undefined),
      consume: jest.fn(
        async (_queue: string, onMessage: (m: unknown) => void) => {
          deliver = onMessage;
          return { consumerTag: "tag-1" };
        },
      ),
      ack: jest.fn(),
      nack,
    });

    deliver!({
      content: Buffer.from("{}"),
      properties: { messageId: "m-1", headers: {} },
    });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(nack).toHaveBeenCalled();
    expect(written()).toContain("parking");
    expect(written()).not.toContain(EMAIL);
  });
});
