import { EventEmitter } from "events";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import type { Channel } from "amqplib";
import { ReopeningChannel } from "@/shared/infrastructure/queue/ReopeningChannel.js";

type Setup = (ch: Channel) => Promise<void>;

/** A ChannelWrapper: emits `connect` and `error`, holds the setup it was given. */
class FakeWrapper extends EventEmitter {
  constructor(readonly setup: Setup) {
    super();
  }
  close = jest.fn(async () => undefined);
}

/** The raw amqplib channel a setup is handed; `brokerClose` is the broker closing it. */
class FakeRaw extends EventEmitter {
  close = jest.fn(async () => {
    this.emit("close");
  });
  brokerClose(): void {
    this.emit("close");
  }
}

const raw = () => new FakeRaw() as FakeRaw & Channel;

let connected: boolean;
let wrappers: FakeWrapper[];
const createChannel = jest.fn((options: { setup: Setup }) => {
  const wrapper = new FakeWrapper(options.setup);
  wrappers.push(wrapper);
  return wrapper;
});
const connection = {
  createChannel,
  isConnected: () => connected,
} as unknown as ConstructorParameters<typeof ReopeningChannel>[0];

const build = (overrides: { maxDelayMs?: number } = {}) => {
  const setup = jest.fn(async (ch: Channel) => {
    void ch;
  });
  const onLost = jest.fn();
  const onError = jest.fn();
  const onConnect = jest.fn();
  const channel = new ReopeningChannel<Channel>(connection, {
    name: "test",
    setup,
    onError,
    onConnect,
    onLost,
    baseDelayMs: 1_000,
    maxDelayMs: overrides.maxDelayMs ?? 30_000,
  });
  return { channel, setup, onLost, onError, onConnect };
};

/** Runs the newest wrapper's setup on a fresh raw channel, as the library does. */
const setUpLatest = async () => {
  const ch = raw();
  await wrappers.at(-1)!.setup(ch);
  return ch;
};

describe("ReopeningChannel (#312, ADR-0102)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    connected = true;
    wrappers = [];
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("opens a new wrapper after the broker closes the channel, the old one closed first", async () => {
    const { channel, setup, onLost } = build();
    const first = await setUpLatest();
    expect(setup).toHaveBeenCalledTimes(1);

    first.brokerClose();
    expect(onLost).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(999);
    expect(createChannel).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1);
    expect(createChannel).toHaveBeenCalledTimes(2);
    expect(wrappers[0]!.close).toHaveBeenCalledTimes(1);
    expect(wrappers[0]!.close.mock.invocationCallOrder[0]).toBeLessThan(
      createChannel.mock.invocationCallOrder[1]!,
    );
    expect(channel.current).toBe(wrappers[1]);

    await setUpLatest();
    expect(setup).toHaveBeenCalledTimes(2);
  });

  /** Closes the newest channel and returns how long the reopen then took, in 1 s steps. */
  const closeAndTimeReopen = async (connect: boolean) => {
    const ch = await setUpLatest();
    if (connect) wrappers.at(-1)!.emit("connect");
    ch.brokerClose();
    const before = createChannel.mock.calls.length;
    let waited = 0;
    while (createChannel.mock.calls.length === before) {
      await jest.advanceTimersByTimeAsync(1_000);
      waited += 1_000;
    }
    return waited;
  };

  it("doubles the wait on each attempt up to the cap", async () => {
    build({ maxDelayMs: 4_000 });
    const waits: number[] = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      waits.push(await closeAndTimeReopen(false));
    }
    expect(waits).toEqual([1_000, 2_000, 4_000, 4_000]);
  });

  // Review M1: a close that recurs right after every setup, such as a retry queue
  // declared with other arguments, would otherwise be retried once a second for ever.
  it("keeps doubling the wait when each channel connects and is closed again at once", async () => {
    build({ maxDelayMs: 8_000 });
    const waits: number[] = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      waits.push(await closeAndTimeReopen(true));
    }
    expect(waits).toEqual([1_000, 2_000, 4_000, 8_000]);
  });

  it("starts the waits over once a channel has stayed up the stability window", async () => {
    build({ maxDelayMs: 8_000 });
    await closeAndTimeReopen(false);
    await closeAndTimeReopen(false);

    const ch = await setUpLatest();
    wrappers.at(-1)!.emit("connect");
    await jest.advanceTimersByTimeAsync(30_000);
    ch.brokerClose();
    await jest.advanceTimersByTimeAsync(1_000);
    expect(createChannel).toHaveBeenCalledTimes(4);
  });

  it("opens nothing while the connection is down: the library's reconnect sets it up", async () => {
    build();
    (await setUpLatest()).brokerClose();
    connected = false;

    await jest.advanceTimersByTimeAsync(60_000);
    expect(createChannel).toHaveBeenCalledTimes(1);
    expect(wrappers[0]!.close).not.toHaveBeenCalled();
  });

  it("opens nothing when setup has already run again on the same wrapper", async () => {
    const { setup } = build();
    (await setUpLatest()).brokerClose();
    // The connection reconnected and the library ran the wrapper's setup itself.
    await setUpLatest();

    await jest.advanceTimersByTimeAsync(60_000);
    expect(createChannel).toHaveBeenCalledTimes(1);
    expect(setup).toHaveBeenCalledTimes(2);
  });

  it("stops a pending reopen on close(), and reports no loss for its own close", async () => {
    const { channel, onLost } = build();
    const first = await setUpLatest();
    first.brokerClose();
    await channel.close();

    await jest.advanceTimersByTimeAsync(60_000);
    expect(createChannel).toHaveBeenCalledTimes(1);
    expect(wrappers[0]!.close).toHaveBeenCalledTimes(1);
    expect(onLost).toHaveBeenCalledTimes(1);

    // A channel closed by close() itself is not a loss.
    const second = build();
    const ch = await setUpLatest();
    await second.channel.close();
    ch.brokerClose();
    expect(second.onLost).not.toHaveBeenCalled();
  });

  it("closes a channel a replaced wrapper opens late, without running setup on it", async () => {
    const { setup } = build();
    (await setUpLatest()).brokerClose();
    await jest.advanceTimersByTimeAsync(1_000);
    expect(createChannel).toHaveBeenCalledTimes(2);

    // The replaced wrapper's setup runs after the replacement exists.
    const late = raw();
    await wrappers[0]!.setup(late);
    expect(late.close).toHaveBeenCalledTimes(1);
    expect(setup).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(60_000);
    expect(createChannel).toHaveBeenCalledTimes(2);
  });

  it("closes a channel set up after stopReopening(), and reopens nothing", async () => {
    const { channel, setup } = build();
    channel.stopReopening();

    const ch = raw();
    await wrappers[0]!.setup(ch);
    expect(ch.close).toHaveBeenCalledTimes(1);
    expect(setup).not.toHaveBeenCalled();
  });

  it("ignores the close of a channel the library has already replaced", async () => {
    const { onLost } = build();
    const first = await setUpLatest();
    // The connection reconnected and the library set the wrapper up on a new channel
    // before the old one reported its close.
    await setUpLatest();
    first.brokerClose();

    await jest.advanceTimersByTimeAsync(60_000);
    expect(onLost).not.toHaveBeenCalled();
    expect(createChannel).toHaveBeenCalledTimes(1);
  });

  it("hands each wrapper's error and connect to the caller, the replacement's too", async () => {
    const { onError, onConnect } = build();
    const failure = new Error("PRECONDITION_FAILED");
    wrappers[0]!.emit("error", failure);
    expect(onError).toHaveBeenCalledWith(failure);

    (await setUpLatest()).brokerClose();
    await jest.advanceTimersByTimeAsync(1_000);
    wrappers[1]!.emit("connect");
    expect(onConnect).toHaveBeenCalledTimes(1);
  });
});
