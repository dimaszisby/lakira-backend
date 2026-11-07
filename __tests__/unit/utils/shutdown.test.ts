import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import http from "http";
import net from "net";
import type { AddressInfo } from "net";
import { closeHttpServer, createShutdown } from "@/utils/shutdown.js";

jest.mock("@/utils/logger.js", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
  flushLogs: jest.fn(async () => undefined),
}));

const loggerMock = (
  jest.requireMock("@/utils/logger.js") as {
    default: Record<"info" | "error" | "warn", jest.Mock>;
  }
).default;

const never = () => new Promise<void>(() => undefined);

type Steps = (exitCode: number) => Promise<void>;

/** A shutdown whose exit and flush are recorded instead of run. */
const build = (
  steps: (exitCode: number) => Promise<void>,
  timeoutMs = 1_000,
) => {
  const exit = jest.fn<(code: number) => void>();
  const flush = jest.fn<() => Promise<void>>(async () => undefined);
  const shutdown = createShutdown({
    label: "TEST",
    steps,
    timeoutMs,
    exit,
    flush,
  });
  return { shutdown, exit, flush };
};

// ADR-0076 decisions 2 and 3.
describe("createShutdown", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("runs the steps, flushes the logs, then exits with the code it was given", async () => {
    const order: string[] = [];
    const steps = jest.fn<Steps>(async () => {
      order.push("steps");
    });
    const { shutdown, exit, flush } = build(steps);
    flush.mockImplementation(async () => {
      order.push("flush");
    });
    exit.mockImplementation(() => {
      order.push("exit");
    });

    await shutdown("SIGTERM");

    expect(order).toEqual(["steps", "flush", "exit"]);
    expect(steps).toHaveBeenCalledWith(0);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("hands the steps the code of the call that started them", async () => {
    const steps = jest.fn<Steps>(async () => undefined);
    const { shutdown, exit } = build(steps);

    await shutdown("Uncaught Exception", 1);

    expect(steps).toHaveBeenCalledWith(1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("returns the first call's promise to a second call, and runs the steps once", async () => {
    let finish!: () => void;
    const steps = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { shutdown, exit } = build(steps);

    const first = shutdown("SIGTERM");
    const second = shutdown("SIGINT");
    expect(second).toBe(first);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("Already shutting down (SIGINT)"),
    );

    finish();
    await first;
    expect(steps).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("exits non-zero when a crash arrives during a graceful shutdown", async () => {
    let finish!: () => void;
    const steps = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { shutdown, exit } = build(steps);

    const first = shutdown("SIGTERM");
    void shutdown("Uncaught Exception", 1);
    finish();
    await first;

    expect(steps).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("logs a step that throws and exits 1", async () => {
    const failure = new Error("close failed");
    const { shutdown, exit, flush } = build(async () => {
      throw failure;
    });

    await shutdown("SIGTERM");

    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.stringContaining("[TEST]"),
      failure,
    );
    expect(flush).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("exits 1 at the deadline when a step never settles, saying so", async () => {
    const { shutdown, exit, flush } = build(never, 50);

    await shutdown("SIGTERM");

    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.stringContaining("did not finish within 50 ms"),
    );
    expect(flush).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("exits at the deadline even when the log flush never settles", async () => {
    const { shutdown, exit, flush } = build(never, 50);
    flush.mockImplementation(never);

    await shutdown("SIGTERM");

    expect(exit).toHaveBeenCalledWith(1);
  }, 5_000);

  it("still exits when the log flush fails", async () => {
    const { shutdown, exit, flush } = build(async () => undefined, 50);
    flush.mockImplementation(async () => {
      throw new Error("transport closed");
    });

    await shutdown("SIGTERM");

    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("does not fire the deadline after a shutdown that finished", async () => {
    const { shutdown, exit } = build(async () => undefined, 50);

    await shutdown("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(exit).toHaveBeenCalledTimes(1);
    expect(loggerMock.error).not.toHaveBeenCalled();
  });
});

describe("closeHttpServer", () => {
  let server: http.Server;
  let sockets: net.Socket[];

  beforeEach(async () => {
    jest.clearAllMocks();
    sockets = [];
    // A handler that never answers: the request it holds keeps close() waiting.
    server = http.createServer(() => undefined);
    await new Promise<void>((resolve) => server.listen(0, resolve));
  });

  afterEach(() => {
    sockets.forEach((socket) => socket.destroy());
    if (server.listening) server.closeAllConnections();
  });

  const holdRequestOpen = async (): Promise<void> => {
    const { port } = server.address() as AddressInfo;
    const socket = net.connect(port, "127.0.0.1");
    sockets.push(socket);
    socket.on("error", () => undefined);
    await new Promise<void>((resolve) => socket.on("connect", resolve));
    socket.write("GET / HTTP/1.1\r\nHost: localhost\r\n\r\n");
    // Until the server has the request, close() has nothing to wait for.
    await new Promise<void>((resolve) =>
      server.once("request", () => resolve()),
    );
  };

  it("resolves at once when nothing is open", async () => {
    const started = Date.now();
    await closeHttpServer(server, 1_000);

    expect(Date.now() - started).toBeLessThan(500);
    expect(server.listening).toBe(false);
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it("closes a connection still open at the bound, with a warning, and resolves", async () => {
    await holdRequestOpen();

    const started = Date.now();
    await closeHttpServer(server, 100);

    expect(Date.now() - started).toBeGreaterThanOrEqual(90);
    expect(server.listening).toBe(false);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("still open after 100 ms"),
    );
  });
});
