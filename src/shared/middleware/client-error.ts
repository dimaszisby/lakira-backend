import type { Server } from "http";
import type { Socket } from "net";
import { buildErrorEnvelope } from "@/shared/utils/error-envelope.js";

/**
 * Node's HTTP parser rejects a malformed request — an illegal byte in a header,
 * an oversized header block — before Express sees it, and its default reply is a
 * bodyless `400 Bad Request` carrying no `Content-Type`. That is an error
 * response the API emits which does not carry the envelope, and it is invisible
 * to the middleware stack: no `req`, no `res`, no error handler ever runs.
 *
 * The socket is therefore answered by hand. `Connection: close` is required —
 * the parser cannot be trusted to find the next message boundary on a stream it
 * has already failed to read.
 */
export const respondToMalformedRequest = (
  err: Error & { code?: string },
  socket: Socket,
): void => {
  if (err.code === "ECONNRESET" || !socket.writable) {
    socket.destroy();
    return;
  }

  const body = JSON.stringify(
    buildErrorEnvelope(400, "Malformed HTTP request"),
  );

  socket.end(
    "HTTP/1.1 400 Bad Request\r\n" +
      "Content-Type: application/json; charset=utf-8\r\n" +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      "Connection: close\r\n" +
      "\r\n" +
      body,
  );
};

/**
 * Attach to every `http.Server` this app is served from. There is more than one
 * — `startServer()` in production, `jest.setup.ts` for integration tests — and a
 * server without this handler silently falls back to Node's bodyless 400.
 */
export const attachClientErrorHandler = (server: Server): void => {
  server.on("clientError", respondToMalformedRequest);
};
