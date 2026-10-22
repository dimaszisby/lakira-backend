import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { Writable } from "node:stream";
import { transports } from "winston";
import logger, { logUnhandledRejection } from "@/utils/logger.js";

// Kit v6-small-items, D-02 (audit V6). The server passed the reason as an
// extra argument after a string, which splat() drops: the line said only that
// something was rejected.
describe("logUnhandledRejection", () => {
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

  const record = () => {
    expect(lines).toHaveLength(1);
    return JSON.parse(lines[0]) as Record<string, unknown>;
  };

  it("writes an Error reason's message and stack", () => {
    logUnhandledRejection("[SERVER ERROR]", new Error("pool exhausted"));

    const line = record();
    expect(line.level).toBe("error");
    expect(line.message).toContain("[SERVER ERROR] Unhandled rejection:");
    expect(line.message).toContain("pool exhausted");
    expect(line.stack).toContain("pool exhausted");
  });

  it("writes a reason that is not an Error", () => {
    logUnhandledRejection("[WORKER]", "channel closed");

    const line = record();
    expect(line.level).toBe("error");
    expect(line.message).toBe("[WORKER] Unhandled rejection: channel closed");
  });
});
