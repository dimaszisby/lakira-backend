import { describe, it, expect, jest } from "@jest/globals";
import type { Socket } from "net";
import { respondToMalformedRequest } from "@/shared/middleware/client-error.js";

const createSocket = (writable = true) => {
  const socket = {
    writable,
    end: jest.fn(),
    destroy: jest.fn(),
  };
  return socket as unknown as Socket & {
    end: jest.Mock;
    destroy: jest.Mock;
  };
};

describe("respondToMalformedRequest", () => {
  it("writes the error envelope as a raw HTTP response", () => {
    const socket = createSocket();

    respondToMalformedRequest(new Error("Parse Error"), socket);

    expect(socket.destroy).not.toHaveBeenCalled();
    const raw = socket.end.mock.calls[0][0] as string;
    const [head, body] = raw.split("\r\n\r\n");

    expect(head).toContain("HTTP/1.1 400 Bad Request");
    expect(head).toContain("Content-Type: application/json; charset=utf-8");
    expect(head).toContain("Connection: close");
    expect(head).toContain(`Content-Length: ${Buffer.byteLength(body)}`);
    expect(JSON.parse(body)).toEqual({
      status: "fail",
      message: "Malformed HTTP request",
    });
  });

  it("just destroys the socket when the peer already reset it", () => {
    const socket = createSocket();
    const err = Object.assign(new Error("reset"), { code: "ECONNRESET" });

    respondToMalformedRequest(err, socket);

    expect(socket.destroy).toHaveBeenCalledTimes(1);
    expect(socket.end).not.toHaveBeenCalled();
  });

  it("does not write to an unwritable socket", () => {
    const socket = createSocket(false);

    respondToMalformedRequest(new Error("Parse Error"), socket);

    expect(socket.destroy).toHaveBeenCalledTimes(1);
    expect(socket.end).not.toHaveBeenCalled();
  });
});
